import { apply } from '../engine/game';
import { autoCasualties } from '../engine/casualties';
import type { Action, GameState } from '../engine/types';
import type { Draft } from './board';
import { planCombatMove } from './combatMove';
import { decide, intercept, nextBattle } from './decisions';
import { mobilizeAction } from './mobilize';
import { planNoncombat } from './noncombat';
import { purchaseAction } from './purchase';

/**
 * Movement phases are planned whole on a scratch copy, then replayed one action per call. Each planned
 * action is keyed by a fingerprint of the state it was planned for, so a replay survives any caller
 * (and any number of concurrent games) and a state the plan did not foresee simply triggers a replan.
 */
const plans = new Map<string, Action>();
const PLAN_CACHE_LIMIT = 20000;

const fingerprint = (s: GameState) =>
  `${s.round}|${s.power}|${s.phase}|${s.rng}|${JSON.stringify(s.purchases)}|${s.units
    .map((u) => `${u.id}${u.at}${u.moved}${u.carriedBy ?? ''}${u.offloadedTo ?? ''}`)
    .join(',')}`;

function remember(d: Draft): void {
  if (plans.size > PLAN_CACHE_LIMIT) plans.clear();
  d.states.forEach((st, i) => plans.set(fingerprint(st), d.actions[i]!));
  plans.set(fingerprint(d.state), { type: 'endPhase' });
}

function planned(s: GameState, planner: (s: GameState) => Draft, fresh = false): Action {
  const key = fingerprint(s);
  const cached = fresh ? undefined : plans.get(key);
  if (cached) return cached;
  remember(planner(s));
  return plans.get(key) ?? { type: 'endPhase' };
}

const ok = (s: GameState, a: Action) => apply(s, a).ok;

/** A choice the engine always accepts for the pending decision. */
function fallback(s: GameState): Action {
  const d = s.pending;
  if (!d) return { type: 'endPhase' };
  switch (d.kind) {
    case 'casualties': {
      const b = s.battles.find((x) => x.id === d.battle)!;
      const ids = d.side === 'attacker' ? b.attackers : b.defenders;
      const pool = s.units.filter((u) => ids.includes(u.id) && !b.submerged.includes(u.id) && !b.doomed.includes(u.id));
      return { type: 'casualties', units: autoCasualties(d.groups, pool) };
    }
    case 'submerge':
      return { type: 'submerge', units: [] };
    case 'retreat':
      return { type: 'retreat', to: null };
    case 'bombard':
      return { type: 'bombard', ships: [] };
    case 'landStranded':
      return { type: 'landStranded', landings: Object.fromEntries(d.fighters.map((f) => [f, null])) };
    case 'intercept':
      return { type: 'intercept', units: [] };
  }
}

function choose(s: GameState, fresh = false): Action {
  if (s.pending) return decide(s, s.pending);
  switch (s.phase) {
    case 'purchase':
      return purchaseAction(s);
    case 'combatMove':
      return planned(s, planCombatMove, fresh);
    case 'combat':
      return nextBattle(s);
    case 'noncombatMove':
      return planned(s, planNoncombat, fresh);
    case 'mobilize':
      return mobilizeAction(s);
  }
}

/** The next action for whichever power must act in `state` (see actingPower). */
export function aiAction(state: GameState): Action {
  if (state.winner) throw new Error('the game is over');
  const a = choose(state);
  if (ok(state, a)) return a;
  const replanned = choose(state, true);
  if (ok(state, replanned)) return replanned;
  const f = fallback(state);
  if (ok(state, f)) return f;
  throw new Error(`AI found no legal action for ${state.power} in ${state.phase}: ${JSON.stringify(a)}`);
}

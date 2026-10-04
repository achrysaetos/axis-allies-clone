import { isLand, space } from '../engine/data';
import { autoCasualties, validateCasualties } from '../engine/casualties';
import { areAllied } from '../engine/queries';
import { battleBlocker } from '../engine/combat';
import type { Action, Battle, Decision, GameState, Unit, UnitId } from '../engine/types';
import { asCombatants, simulate } from './eval';

const RETREAT_BELOW = 0.3;

function pool(s: GameState, b: Battle, side: 'attacker' | 'defender'): Unit[] {
  const ids = side === 'attacker' ? b.attackers : b.defenders;
  return s.units.filter((u) => ids.includes(u.id) && !b.submerged.includes(u.id) && !b.doomed.includes(u.id));
}

/** Odds that the attacker wins the rest of battle `b` from here. */
function attackerOdds(s: GameState, b: Battle) {
  return simulate({
    kind: b.kind === 'sea' ? 'sea' : 'land',
    attackers: asCombatants(pool(s, b, 'attacker')),
    defenders: asCombatants(s.units.filter((u) => b.defenders.includes(u.id) && !b.submerged.includes(u.id))),
    trials: 80,
  });
}

/** Lose cheap units first, but keep a land unit alive to take the territory when aircraft could die instead. */
function casualties(s: GameState, b: Battle, d: Extract<Decision, { kind: 'casualties' }>): Action {
  const units = pool(s, b, d.side);
  const chosen = autoCasualties(d.groups, units);
  if (d.side === 'attacker' && b.kind === 'land') {
    const land = units.filter((u) => isLand(u.type));
    const killed = new Set(chosen);
    if (land.length > 0 && land.every((u) => killed.has(u.id))) {
      const keep = land[land.length - 1]!;
      const spare = units.find((u) => !isLand(u.type) && !killed.has(u.id));
      if (spare) {
        const swapped = chosen.map((id) => (id === keep.id ? spare.id : id));
        if (validateCasualties(d.groups, units, swapped) === null) return { type: 'casualties', units: swapped };
      }
    }
  }
  return { type: 'casualties', units: chosen };
}

export function decide(s: GameState, d: Decision): Action {
  switch (d.kind) {
    case 'casualties':
      return casualties(s, s.battles.find((x) => x.id === d.battle)!, d);
    case 'submerge': {
      const b = s.battles.find((x) => x.id === d.battle)!;
      const win = attackerOdds(s, b).win;
      const losing = d.side === 'attacker' ? win < 0.4 : win > 0.6;
      return { type: 'submerge', units: losing ? d.subs : [] };
    }
    case 'retreat': {
      const b = s.battles.find((x) => x.id === d.battle)!;
      if (attackerOdds(s, b).win >= RETREAT_BELOW) return { type: 'retreat', to: null };
      const to = d.options.find((o) => o !== b.space) ?? d.options[0] ?? null;
      return { type: 'retreat', to };
    }
    case 'bombard':
      return { type: 'bombard', ships: d.ships.slice(0, d.max) };
    case 'landStranded':
      return {
        type: 'landStranded',
        landings: Object.fromEntries(
          d.fighters.map((f) => {
            const options = d.options[f]!;
            return [f, options.find((o) => !space(o).water) ?? options[0] ?? null];
          }),
        ),
      };
    case 'intercept':
      return intercept(s, d);
  }
}

/** Interceptors scramble when they outnumber the escorts. */
export function intercept(s: GameState, d: { battle: number; fighters: UnitId[] }): Action {
  const b = s.battles.find((x) => x.id === d.battle);
  const escorts = s.units.filter((u) => b?.attackers.includes(u.id) && u.type === 'fighter').length;
  const units = d.fighters.length > escorts ? d.fighters : [];
  return { type: 'intercept', units };
}

/** Fight open battles in a legal order; skip optional ones we would likely lose. */
export function nextBattle(s: GameState): Action {
  const open = s.battles.filter((b) => !b.resolved && battleBlocker(s, b) === null);
  const b = open[0];
  if (!b) return { type: 'endPhase' };
  if (b.optional) {
    const here = s.units.filter((u) => u.at === b.space);
    const att = here.filter((u) => u.owner === b.attacker && u.carriedBy === null && u.type !== 'transport');
    const def = here.filter((u) => !areAllied(u.owner, b.attacker) && u.carriedBy === null);
    const odds = simulate({ kind: 'sea', attackers: asCombatants(att), defenders: asCombatants(def), trials: 60 });
    if (odds.win < 0.5 || odds.attLoss > odds.defLoss) return { type: 'skipBattle', battle: b.id };
  }
  return { type: 'startBattle', battle: b.id };
}

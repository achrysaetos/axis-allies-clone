import { aiAction } from '../ai';
import { asCombatants, simulate } from '../ai/eval';
import { STATS, isLand } from '../engine/data';
import { autoCasualties } from '../engine/casualties';
import { battleBlocker } from '../engine/combat';
import { actingPower, apply } from '../engine/game';
import { DEFAULT_OPTIONS } from '../engine/state';
import { POWERS } from '../engine/types';
import type { Action, Battle, Decision, GameState, Power, Unit } from '../engine/types';

/** Online, every power held by someone else, or by nobody yet, is 'remote'. */
export type Controller = 'human' | 'ai' | 'remote';

export interface Session {
  state: GameState;
  controllers: Record<Power, Controller>;
  /** States before each move of the current movement phase. */
  undo: GameState[];
  /** Units that left play, so finished battles can still show what died. */
  fallen: Unit[];
}

const FALLEN_LIMIT = 400;

export function newSession(state: GameState, controllers: Record<Power, Controller>): Session {
  return { state, controllers, undo: [], fallen: [] };
}

export type Step = { ok: true; session: Session } | { ok: false; error: string };

/**
 * Bombarding has no cost in this edition, so a player always fires every ship allowed, strongest first; asking
 * would only add a step the board game never has.
 */
function autoBombard(state: GameState): GameState {
  const d = state.pending;
  if (d?.kind !== 'bombard') return state;
  const attack = (id: number) => STATS[state.units.find((u) => u.id === id)!.type].attack;
  const ships = [...d.ships].sort((a, b) => attack(b) - attack(a)).slice(0, d.max);
  const r = apply(state, { type: 'bombard', ships });
  return r.ok ? r.state : state;
}

export function act(session: Session, action: Action): Step {
  const applied = apply(session.state, action);
  if (!applied.ok) return applied;
  const r = { ...applied, state: autoBombard(applied.state) };
  const alive = new Set(r.state.units.map((u) => u.id));
  const died = session.state.units.filter((u) => !alive.has(u.id));
  return {
    ok: true,
    session: {
      ...session,
      state: r.state,
      undo: action.type === 'move' ? [...session.undo, session.state] : [],
      fallen: died.length > 0 ? [...session.fallen, ...died].slice(-FALLEN_LIMIT) : session.fallen,
    },
  };
}

/** Applies a player's step, such as one drop that flies planes and marches tanks, all or nothing and as one undo. */
export function actAll(session: Session, actions: Action[]): Step {
  let cur = session;
  for (const a of actions) {
    const r = act(cur, a);
    if (!r.ok) return r;
    cur = r.session;
  }
  const undo = actions.length > 0 && actions.every((a) => a.type === 'move') ? [...session.undo, session.state] : cur.undo;
  return { ok: true, session: { ...cur, undo } };
}

export function undo(session: Session): Session {
  const prev = session.undo[session.undo.length - 1];
  if (!prev) return session;
  return { ...session, state: prev, undo: session.undo.slice(0, -1) };
}

export function casualtyPool(state: GameState, b: Battle, side: 'attacker' | 'defender'): Unit[] {
  const ids = side === 'attacker' ? b.attackers : b.defenders;
  return state.units.filter((u) => ids.includes(u.id) && !b.submerged.includes(u.id) && !b.doomed.includes(u.id));
}

/** The engine's simplest legal answer to a pending decision. */
export function defaultDecision(state: GameState, d: Decision): Action {
  switch (d.kind) {
    case 'casualties': {
      const b = state.battles.find((x) => x.id === d.battle);
      return { type: 'casualties', units: b ? autoCasualties(d.groups, casualtyPool(state, b, d.side)) : [] };
    }
    case 'submerge':
      return { type: 'submerge', units: [] };
    case 'retreat':
      return { type: 'retreat', to: null };
    case 'bombard':
      return { type: 'bombard', ships: d.ships.slice(0, d.max) };
    case 'intercept':
      return { type: 'intercept', units: [] };
    case 'landStranded':
      return { type: 'landStranded', landings: Object.fromEntries(d.fighters.map((f) => [f, d.options[f]?.[0] ?? null])) };
    default:
      return unreachable(d);
  }
}

export function unreachable(x: never): never {
  throw new Error(`unhandled ${JSON.stringify(x)}`);
}

/** Fight a battle to the end, answering every decision `decides` allows with its default. */
export function quickResolve(session: Session, battle: number, decides: (p: Power) => boolean = () => true): Step {
  let cur = session;
  if (cur.state.activeBattle !== battle) {
    const r = act(cur, { type: 'startBattle', battle });
    if (!r.ok) return r;
    cur = r.session;
  }
  for (let d = cur.state.pending; d && 'battle' in d && d.battle === battle && decides(d.power); d = cur.state.pending) {
    const r = act(cur, d.kind === 'retreat' ? quickRetreat(cur.state, d) : defaultDecision(cur.state, d));
    if (!r.ok) return r;
    cur = r.session;
  }
  return { ok: true, session: cur };
}

export const QUICK_RETREAT_BELOW = 0.3;

/** The attacker's chances if the battle goes on as it stands, or null when only aircraft are left to fight for land. */
export function pressOnOdds(state: GameState, b: Battle) {
  const attackers = casualtyPool(state, b, 'attacker');
  if (b.kind === 'land' && !attackers.some((u) => isLand(u.type) && u.type !== 'aaGun')) return null;
  return simulate({
    kind: b.kind === 'sea' ? 'sea' : 'land',
    attackers: asCombatants(attackers),
    defenders: asCombatants(casualtyPool(state, b, 'defender')),
    trials: 300,
  });
}

/** Quick play retreats when the attack has turned bad, or when only aircraft are left to fight for land they cannot take. */
function quickRetreat(state: GameState, d: Extract<Decision, { kind: 'retreat' }>): Action {
  const b = state.battles.find((x) => x.id === d.battle)!;
  const to = d.options.find((o) => o !== b.space) ?? d.options[0] ?? null;
  const odds = pressOnOdds(state, b);
  return { type: 'retreat', to: !odds || odds.win < QUICK_RETREAT_BELOW ? to : null };
}

/** Keeps an AI turn moving when its own action is rejected. */
export function fallbackAction(state: GameState): Action {
  if (state.pending) return defaultDecision(state, state.pending);
  if (state.phase === 'combat') {
    const open = state.battles.find((b) => !b.resolved && battleBlocker(state, b) === null);
    if (open) return { type: 'startBattle', battle: open.id };
  }
  return { type: 'endPhase' };
}

/** One AI action; rejected actions fall back to a default, then to replaying the movement phase from its start. */
export function aiStep(session: Session): Step {
  const proposed = aiAction(session.state);
  const r = act(session, proposed);
  if (r.ok) return r;
  console.warn(`AI ${proposed.type} rejected: ${r.error}`);
  const fallback = act(session, fallbackAction(session.state));
  if (fallback.ok) return fallback;
  const phaseStart = session.undo[0];
  if (!phaseStart) return fallback;
  console.warn(`AI cannot end the phase (${fallback.error}); undoing its moves`);
  return act({ ...session, state: phaseStart, undo: [] }, { type: 'endPhase' });
}

/** AI actions until a phase or turn boundary, a human's decision, or the time budget, so each step stays visible. */
export function aiBurst(session: Session, budgetMs: number): Step {
  const start = performance.now();
  const { phase, power } = session.state;
  let cur = session;
  for (;;) {
    const r = aiStep(cur);
    if (!r.ok) return cur === session ? r : { ok: true, session: cur };
    cur = r.session;
    const s = cur.state;
    if (s.winner || s.phase !== phase || s.power !== power || cur.controllers[actingPower(s)] !== 'ai') break;
    if (s.activeBattle !== null || performance.now() - start > budgetMs) break;
  }
  return { ok: true, session: cur };
}

interface SavedSession {
  version: 1;
  state: GameState;
  controllers: Record<Power, Controller>;
}

export function serialize(session: Session): string {
  const saved: SavedSession = { version: 1, state: session.state, controllers: session.controllers };
  return JSON.stringify(saved);
}

export function parseSession(text: string): Session | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'not a JSON file';
  }
  if (typeof raw !== 'object' || raw === null) return 'not a saved game';
  const r = raw as Partial<SavedSession>;
  const s = r.state;
  if (r.version !== 1 || !s || !Array.isArray(s.units) || typeof s.round !== 'number' || !POWERS.includes(s.power))
    return 'not a saved game from this version';
  const controllers = Object.fromEntries(POWERS.map((p) => [p, r.controllers?.[p] === 'ai' ? 'ai' : 'human'])) as Record<
    Power,
    Controller
  >;
  const state: GameState = {
    ...s,
    options: { ...DEFAULT_OPTIONS, ...s.options },
    hostileSeaAtTurnStart: s.hostileSeaAtTurnStart ?? [],
    mobilized: s.mobilized ?? [],
    battles: s.battles.map((b) => ({
      ...b,
      roster: b.roster ?? [],
      dice: b.dice.map((d) => ({ ...d, round: d.round ?? 1, targets: d.targets ?? [] })),
    })),
  };
  return newSession(state, controllers);
}

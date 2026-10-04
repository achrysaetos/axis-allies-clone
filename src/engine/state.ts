import { SETUP, SPACE_IDS, space } from './data';
import type { GameState, Options, Power, Unit, UnitType } from './types';
import { POWERS } from './types';

export const DEFAULT_OPTIONS: Options = { victory: 'standard', turkishStraitsClosed: false, sbrEscortsInterceptors: false };

export function freshUnit(id: number, type: UnitType, owner: Power, at: string): Unit {
  return {
    id,
    type,
    owner,
    at,
    damage: 0,
    moved: 0,
    turnStart: at,
    cameFrom: null,
    carriedBy: null,
    loadedIn: null,
    offloadedTo: null,
    movedInCombat: false,
    fought: false,
    bombarded: false,
    sbr: false,
    retreated: false,
    blitzed: false,
    escaped: false,
  };
}

export function newGame(seed = 1942, options: Partial<Options> = {}): GameState {
  const owner: Record<string, Power> = {};
  for (const id of SPACE_IDS) {
    const o = space(id).originalOwner;
    if (o) owner[id] = o;
  }
  const units: Unit[] = [];
  for (const p of SETUP.units) for (let i = 0; i < p.count; i++) units.push(freshUnit(units.length + 1, p.type, p.owner, p.at));
  const treasury = Object.fromEntries(POWERS.map((p) => [p, SETUP.treasury[p]])) as Record<Power, number>;
  return {
    options: { ...DEFAULT_OPTIONS, ...options },
    round: 1,
    power: 'Russians',
    phase: 'purchase',
    treasury,
    owner,
    ownerAtTurnStart: { ...owner },
    capturedThisTurn: [],
    units,
    nextUnitId: units.length + 1,
    purchases: [],
    placements: {},
    battles: [],
    activeBattle: null,
    pending: null,
    rng: seed >>> 0 || 1,
    scriptedDice: [],
    winner: null,
    log: [],
  };
}

/** Mulberry32 step; returns [die 1..6, next rng state]. */
export function rollDie(rng: number): [number, number] {
  const next = (rng + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [Math.floor(r * 6) + 1, next];
}

export function roll(state: GameState, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const scripted = state.scriptedDice.shift();
    if (scripted !== undefined) {
      out.push(scripted);
      continue;
    }
    const [d, next] = rollDie(state.rng);
    state.rng = next;
    out.push(d);
  }
  return out;
}

import { CAPITAL_OF, STATS, isAir, space } from '../engine/data';
import { apply } from '../engine/game';
import { areAllied, carrierRoom, canLandAir, factoryAt } from '../engine/queries';
import type { Action, GameState, Power, SpaceId, Unit } from '../engine/types';

/** A scratch copy of the game that records each legal action applied to it. */
export class Draft {
  readonly states: GameState[] = [];
  readonly actions: Action[] = [];
  public state: GameState;
  /** The scratch copy drops the log: apply clones the whole state, and plans never read it. */
  constructor(state: GameState) {
    this.state = { ...state, log: [] };
  }

  try(a: Action): boolean {
    const r = apply(this.state, a);
    if (!r.ok) return false;
    this.states.push(this.state);
    this.actions.push(a);
    this.state = r.state;
    return true;
  }

  /** Apply all of `as` or none of them. */
  tryAll(as: Action[]): boolean {
    const mark = { state: this.state, n: this.actions.length };
    for (const a of as) {
      if (this.try(a)) continue;
      this.rollback(mark);
      return false;
    }
    return true;
  }

  mark() {
    return { state: this.state, n: this.actions.length };
  }

  rollback(m: { state: GameState; n: number }): void {
    this.state = m.state;
    this.states.length = m.n;
    this.actions.length = m.n;
  }
}

export const mine = (s: GameState, power: Power = s.power) => s.units.filter((u) => u.owner === power);

export const isFriendly = (s: GameState, id: SpaceId, power: Power) => {
  const o = s.owner[id];
  return o !== undefined && areAllied(o, power);
};

export const isEnemyLand = (s: GameState, id: SpaceId, power: Power) => {
  const o = s.owner[id];
  return o !== undefined && !areAllied(o, power);
};

export const enemiesAt = (s: GameState, at: SpaceId, power: Power) =>
  s.units.filter((u) => u.at === at && !areAllied(u.owner, power) && u.type !== 'factory' && !(u.carriedBy !== null && !isAir(u.type)));

export const value = (us: Unit[]) => us.reduce((n, u) => n + (u.type === 'factory' ? 0 : STATS[u.type].cost), 0);

/** Land hops from each territory to the nearest enemy-held territory, walking through any land. */
export function frontDistance(s: GameState, power: Power): Map<SpaceId, number> {
  const dist = new Map<SpaceId, number>();
  let frontier = Object.keys(s.owner).filter((id) => isEnemyLand(s, id, power));
  for (const id of frontier) dist.set(id, 0);
  for (let d = 1; frontier.length > 0; d++) {
    const next: SpaceId[] = [];
    for (const id of frontier)
      for (const n of space(id).neighbors) {
        if (dist.has(n) || s.owner[n] === undefined) continue;
        dist.set(n, d);
        next.push(n);
      }
    frontier = next;
  }
  return dist;
}

/** Territory or carrier zone where `power`'s aircraft can end the turn right now. */
export function safeLanding(s: GameState, u: Unit, at: SpaceId): boolean {
  if (!space(at).water) return canLandAir(s, at, u.owner);
  return u.type === 'fighter' && carrierRoom(s, at, u.owner) > 0;
}

export const capitalOf = (p: Power) => CAPITAL_OF[p];

export function ownFactories(s: GameState, power: Power): SpaceId[] {
  return s.units
    .filter((u) => u.type === 'factory' && u.owner === power && s.owner[u.at] === power && s.ownerAtTurnStart[u.at] === power && !s.capturedThisTurn.includes(u.at))
    .map((u) => u.at);
}

export const productionLeft = (s: GameState, at: SpaceId) => {
  const f = factoryAt(s, at);
  return f ? Math.max(0, space(at).ipc - f.damage - (s.placements[at] ?? 0)) : 0;
};

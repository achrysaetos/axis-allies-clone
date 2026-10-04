import {
  CANALS,
  CAPITAL_OF,
  CARRIER_CAPACITY,
  SIDE,
  STATS,
  SURFACE_WARSHIPS,
  TRANSPORT_CAPACITY,
  TURKISH_STRAITS_ZONE,
  VICTORY_CITIES,
  isNeutral,
  space,
} from './data';
import type { GameState, Power, Side, SpaceId, Unit, UnitId } from './types';

export const areAllied = (a: Power, b: Power) => SIDE[a] === SIDE[b];


export const unitsAt = (state: GameState, at: SpaceId) => state.units.filter((u) => u.at === at);

export const enemyUnitsAt = (state: GameState, at: SpaceId, power: Power) =>
  state.units.filter((u) => u.at === at && !areAllied(u.owner, power));

export function isFriendlyLand(state: GameState, id: SpaceId, power: Power): boolean {
  const o = state.owner[id];
  return o !== undefined && areAllied(o, power);
}

export function isHostileLand(state: GameState, id: SpaceId, power: Power): boolean {
  const o = state.owner[id];
  return o !== undefined && !areAllied(o, power);
}

export function wasHostileAtTurnStart(state: GameState, id: SpaceId, power: Power): boolean {
  const o = state.ownerAtTurnStart[id];
  return o !== undefined && !areAllied(o, power);
}

export function canLandAir(state: GameState, id: SpaceId, power: Power): boolean {
  const s = space(id);
  if (s.water) return false;
  const start = state.ownerAtTurnStart[id];
  return start !== undefined && areAllied(start, power) && isFriendlyLand(state, id, power);
}

/** Hostile sea zones contain enemy surface warships; enemy subs and transports are ignored. */
export const isHostileSea = (state: GameState, zone: SpaceId, power: Power) =>
  enemyUnitsAt(state, zone, power).some((u) => SURFACE_WARSHIPS.has(u.type));

export const hasEnemyDestroyer = (state: GameState, zone: SpaceId, power: Power) =>
  enemyUnitsAt(state, zone, power).some((u) => u.type === 'destroyer');

/** Whether a sea unit may cross between two adjacent sea zones this turn. */
export function seaPassageOpen(state: GameState, from: SpaceId, to: SpaceId, power: Power): boolean {
  if (state.options.turkishStraitsClosed && (from === TURKISH_STRAITS_ZONE || to === TURKISH_STRAITS_ZONE)) return false;
  for (const canal of CANALS) {
    if (canal.seaZones.includes(from) && canal.seaZones.includes(to)) {
      return canal.landTerritories.every((t) => {
        const o = state.ownerAtTurnStart[t];
        return o !== undefined && areAllied(o, power);
      });
    }
  }
  return true;
}

export const cargoOf = (state: GameState, carrier: UnitId) => state.units.filter((u) => u.carriedBy === carrier);

export const transportLoad = (state: GameState, transport: UnitId) =>
  cargoOf(state, transport).reduce((sum, u) => sum + (STATS[u.type].transportCost ?? 99), 0);

export const transportHasRoom = (state: GameState, transport: UnitId, cost: number) =>
  transportLoad(state, transport) + cost <= TRANSPORT_CAPACITY;

/** Free fighter slots on friendly carriers in a zone for a given side. */
export function carrierRoom(state: GameState, zone: SpaceId, power: Power): number {
  const here = unitsAt(state, zone).filter((u) => areAllied(u.owner, power));
  const slots = here.filter((u) => u.type === 'carrier').length * CARRIER_CAPACITY;
  const fighters = here.filter((u) => u.type === 'fighter').length;
  return slots - fighters;
}

export function capitalHeld(state: GameState, power: Power): boolean {
  const cap = CAPITAL_OF[power];
  const o = state.owner[cap];
  return o !== undefined && areAllied(o, power);
}

export function income(state: GameState, power: Power): number {
  let total = 0;
  for (const [id, o] of Object.entries(state.owner)) if (o === power) total += space(id).ipc;
  return total;
}

export function victoryCities(state: GameState, side: Side): number {
  return VICTORY_CITIES.filter((id) => {
    const o = state.owner[id];
    return o !== undefined && SIDE[o] === side;
  }).length;
}

export const factoryAt = (state: GameState, at: SpaceId) => state.units.find((u) => u.at === at && u.type === 'factory');



export const isPassable = (id: SpaceId) => !isNeutral(id);


export const remainingMove = (u: Unit) => STATS[u.type].move - u.moved;

/** Air distances over passable spaces, ignoring hostility. */
export function airDistances(from: SpaceId, max: number): Map<SpaceId, number> {
  const dist = new Map<SpaceId, number>([[from, 0]]);
  let frontier = [from];
  for (let d = 1; d <= max; d++) {
    const next: SpaceId[] = [];
    for (const s of frontier)
      for (const n of space(s).neighbors) {
        if (dist.has(n) || !isPassable(n)) continue;
        dist.set(n, d);
        next.push(n);
      }
    frontier = next;
  }
  return dist;
}

/** Sea distances through passable, non-closed water, ignoring hostility. */
export function seaDistances(state: GameState, from: SpaceId, max: number, power: Power): Map<SpaceId, number> {
  const dist = new Map<SpaceId, number>([[from, 0]]);
  let frontier = [from];
  for (let d = 1; d <= max; d++) {
    const next: SpaceId[] = [];
    for (const s of frontier)
      for (const n of space(s).neighbors) {
        if (dist.has(n) || !space(n).water || !seaPassageOpen(state, s, n, power)) continue;
        dist.set(n, d);
        next.push(n);
      }
    frontier = next;
  }
  return dist;
}

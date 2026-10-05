import { space } from '../engine/data';
import { moveBlocker } from '../engine/movement';
import { POWERS, UNIT_TYPES } from '../engine/types';
import type { GameState, Power, SpaceId, Unit, UnitId, UnitType } from '../engine/types';
import { reachable, resolveMove } from './paths';
import type { MoveResolution, PlannedMove } from './paths';
import { apply } from '../engine/game';
import { forecasts } from './odds';
import type { Forecast } from './odds';
import { areAllied } from '../engine/queries';

/** One piece on the board: every unit of one owner and type in a space, split by whether it rides a transport and can still move. */
export interface Stack {
  key: string;
  owner: Power;
  type: UnitType;
  carried: boolean;
  /** The moving power's units that cannot move any more, drawn faded like pieces already pushed into place. */
  spent: boolean;
  units: Unit[];
}

/** What the player is holding: units lifted off the board, or reinforcements picked from the mobilization zone. */
export type Hand = { kind: 'units'; from: SpaceId; units: UnitId[] } | { kind: 'new'; type: UnitType; count: number };

const isCarried = (u: Unit) => u.carriedBy !== null && u.type !== 'fighter';

/** Cargo cannot sail on its own, but the player can still lift it off the transport onto a coast. */
const offloadable = (state: GameState, u: Unit) =>
  u.owner === state.power && isCarried(u) && u.offloadedTo === null && space(u.at).water;

/** Whether the moving power can pick this unit up right now. */
export const pickable = (state: GameState, u: Unit) =>
  (state.phase === 'combatMove' || state.phase === 'noncombatMove') && (moveBlocker(state, u) === null || offloadable(state, u));

export function stacksAt(state: GameState, units: Unit[]): Stack[] {
  const moving = state.phase === 'combatMove' || state.phase === 'noncombatMove';
  // Planes that retreated hover over the battlefield until noncombat; they are drawn as out of play until then.
  const spent = (u: Unit) =>
    u.owner === state.power && ((moving && !pickable(state, u)) || (state.phase === 'combat' && u.retreated));
  const out: Stack[] = [];
  for (const owner of POWERS)
    for (const type of UNIT_TYPES) {
      if (type === 'factory') continue;
      const mine = units.filter((u) => u.owner === owner && u.type === type);
      if (mine.length === 0) continue;
      for (const carried of [false, true])
        for (const done of [false, true]) {
          const here = mine.filter((u) => isCarried(u) === carried && spent(u) === done);
          if (here.length > 0)
            out.push({ key: `${owner}|${type}|${+carried}|${+done}`, owner, type, carried, spent: done, units: here });
        }
    }
  // A stack that finishes moving fades in place rather than jumping to the back, so pieces stay where the eye left them.
  return out;
}

export function stackAt(state: GameState, at: SpaceId, key: string): Stack | undefined {
  return stacksAt(
    state,
    state.units.filter((u) => u.at === at),
  ).find((s) => s.key === key);
}

/** Units the moving power may pick up from a stack; empty when the stack is not theirs to move. */
export function grabbable(state: GameState, s: Stack): UnitId[] {
  return s.units.filter((u) => pickable(state, u)).map((u) => u.id);
}

const unitOf = (state: GameState, id: UnitId) => state.units.find((u) => u.id === id)!;

/** Everything aboard the same transports as the given cargo, so lifting one piece empties the ship onto the beach. */
export function shipmates(state: GameState, ids: UnitId[]): UnitId[] {
  const ships = new Set(ids.map((id) => unitOf(state, id).carriedBy).filter((t) => t !== null));
  const mates = state.units.filter((u) => u.carriedBy !== null && ships.has(u.carriedBy) && isCarried(u) && pickable(state, u));
  return [...new Set([...ids, ...mates.map((u) => u.id)])];
}

/** Fighters on the deck of a carrier sailing into an attack take off and fight beside it. */
function withDeckFighters(state: GameState, hand: UnitId[], to: SpaceId): UnitId[] {
  const attack =
    state.phase === 'combatMove' &&
    state.units.some((u) => u.at === to && u.type !== 'factory' && !areAllied(u.owner, state.power));
  if (!attack) return hand;
  const carriers = new Set(hand.filter((id) => unitOf(state, id).type === 'carrier'));
  const deck = state.units.filter(
    (u) => u.type === 'fighter' && u.carriedBy !== null && carriers.has(u.carriedBy) && pickable(state, u),
  );
  return [...new Set([...deck.map((u) => u.id), ...hand])];
}

const carriersOf = (state: GameState, hand: UnitId[]) => {
  const units = hand.map((id) => unitOf(state, id));
  if (!units.every(isCarried)) return [];
  return [...new Set(units.map((u) => u.carriedBy!))];
};

/** Cargo dropped on a coast its transport has not reached yet: sail the transport next to it, then land. */
function viaTransport(state: GameState, hand: UnitId[], from: SpaceId, to: SpaceId): MoveResolution | null {
  const ships = carriersOf(state, hand);
  if (ships.length === 0 || !space(from).water || space(to).water) return null;
  let best: PlannedMove[] | null = null;
  let hostile: SpaceId | null = null;
  const power = state.units.find((u) => u.id === ships[0])!.owner;
  const enemyIn = (zone: SpaceId) => state.units.some((u) => u.at === zone && !areAllied(u.owner, power));
  for (const zone of space(to).neighbors.filter((n) => space(n).water && n !== from)) {
    const sail = resolveMove(state, { units: ships, sbr: false }, from, zone);
    if (!sail.ok) continue;
    let s = state;
    for (const m of sail.moves) {
      const r = apply(s, { type: 'move', ...m });
      if (!r.ok) break;
      s = r.state;
    }
    const land = resolveMove(s, { units: hand, sbr: false }, zone, to);
    if (!land.ok) continue;
    // Sailing into enemy ships starts a sea battle, which is a choice the player makes, never a side effect of a drop.
    if (enemyIn(zone)) {
      hostile ??= zone;
      continue;
    }
    const moves = [...sail.moves, ...land.moves];
    const steps = (ms: PlannedMove[]) => ms.reduce((n, m) => n + m.path.length, 0);
    if (!best || steps(moves) < steps(best)) best = moves;
  }
  if (best) return { ok: true, moves: best };
  return hostile
    ? {
        ok: false,
        error: `To land on ${to} the transport must sail into ${hostile}, where enemy units wait. Move the transport there first if you mean to fight.`,
      }
    : null;
}

/** Spaces a hand can be dropped on, counting coasts its transport could sail to first. */
export function handReach(state: GameState, hand: UnitId[], from: SpaceId): Set<SpaceId> {
  const out = reachable(state, { units: hand, sbr: false }, from);
  const ships = carriersOf(state, hand);
  if (ships.length === 0 || !space(from).water) return out;
  for (const zone of reachable(state, { units: ships, sbr: false }, from))
    for (const n of space(zone).neighbors)
      if (!space(n).water && !out.has(n) && viaTransport(state, hand, from, n)?.ok) out.add(n);
  return out;
}

/**
 * Moves for dropping a hand of units on `to`. A whole stack is often grabbed with mixed movement left or more
 * cargo than the ships hold, so when the full hand cannot make it, as many as can go still do.
 */
export function dropMoves(state: GameState, picked: UnitId[], from: SpaceId, to: SpaceId, sbr: boolean): MoveResolution {
  const hand = withDeckFighters(state, picked, to);
  const all = resolveMove(state, { units: hand, sbr }, from, to);
  if (all.ok) return all;
  const shipped = viaTransport(state, hand, from, to);
  if (shipped) return shipped;
  if (hand.length === 1) return all;
  // Take units one at a time while the group still fits, as a player loads a transport until it is full.
  const able: UnitId[] = [];
  for (const id of hand) if (resolveMove(state, { units: [...able, id], sbr }, from, to).ok) able.push(id);
  if (able.length === 0) return all;
  return resolveMove(state, { units: able, sbr }, from, to);
}

/** What dropping the hand on `to` would do: the route it takes and, in combat move, the odds of the attack it joins. */
export function dropPreview(
  state: GameState,
  hand: UnitId[],
  from: SpaceId,
  to: SpaceId,
): { route: SpaceId[]; odds?: Forecast } | null {
  const r = dropMoves(state, hand, from, to, false);
  if (!r.ok) return null;
  const route = r.moves.flatMap((m, i) => (i === 0 ? m.path : m.path.slice(1))).filter((id, i, all) => id !== all[i - 1]);
  let after = state;
  for (const m of r.moves) {
    const next = apply(after, { type: 'move', ...m });
    if (!next.ok) return { route };
    after = next.state;
  }
  if (state.phase !== 'combatMove') return { route };
  return { route, odds: forecasts(after).find((f) => f.space === to && f.kind !== 'sbr') };
}

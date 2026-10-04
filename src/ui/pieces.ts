import { moveBlocker } from '../engine/movement';
import { POWERS, UNIT_TYPES } from '../engine/types';
import type { GameState, Power, SpaceId, Unit, UnitId, UnitType } from '../engine/types';
import { resolveMove } from './paths';
import type { MoveResolution } from './paths';

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

export function stacksAt(state: GameState, units: Unit[]): Stack[] {
  const moving = state.phase === 'combatMove' || state.phase === 'noncombatMove';
  const spent = (u: Unit) => moving && u.owner === state.power && moveBlocker(state, u) !== null;
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
  return s.units.filter((u) => moveBlocker(state, u) === null).map((u) => u.id);
}

/**
 * Moves for dropping a hand of units on `to`. A whole stack is often grabbed with mixed movement left, so when
 * the full hand cannot make it, the units that can go alone still do, as a player would push only those forward.
 */
export function dropMoves(state: GameState, hand: UnitId[], from: SpaceId, to: SpaceId, sbr: boolean): MoveResolution {
  const all = resolveMove(state, { units: hand, sbr }, from, to);
  if (all.ok || hand.length === 1) return all;
  const able = hand.filter((id) => resolveMove(state, { units: [id], sbr }, from, to).ok);
  if (able.length === 0 || able.length === hand.length) return all;
  return resolveMove(state, { units: able, sbr }, from, to);
}

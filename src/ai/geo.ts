import { SPACE_IDS, isNeutral, space } from '../engine/data';
import type { SpaceId } from '../engine/types';

const N = SPACE_IDS.length;
const INDEX = new Map(SPACE_IDS.map((id, i) => [id, i]));
const FAR = 255;

/** All-pairs hop counts over the spaces a domain may enter, ignoring ownership and units. */
function allPairs(enter: (id: SpaceId) => boolean): Uint8Array {
  const m = new Uint8Array(N * N).fill(FAR);
  SPACE_IDS.forEach((from, i) => {
    if (!enter(from)) return;
    m[i * N + i] = 0;
    let frontier = [from];
    for (let d = 1; frontier.length > 0; d++) {
      const next: SpaceId[] = [];
      for (const s of frontier)
        for (const n of space(s).neighbors) {
          const j = INDEX.get(n)!;
          if (m[i * N + j] !== FAR || !enter(n)) continue;
          m[i * N + j] = d;
          next.push(n);
        }
      frontier = next;
    }
  });
  return m;
}

const LAND = allPairs((id) => !space(id).water && !isNeutral(id));
const AIR = allPairs((id) => !isNeutral(id));
const SEA = allPairs((id) => space(id).water);

const lookup = (m: Uint8Array) => (a: SpaceId, b: SpaceId) => m[INDEX.get(a)! * N + INDEX.get(b)!]!;

/** Hop counts; 255 when unreachable. Sea distance ignores canals and straits. */
export const landDist = lookup(LAND);
export const airDist = lookup(AIR);
export const seaDist = lookup(SEA);

export const seaNeighbors = (id: SpaceId) => space(id).neighbors.filter((n) => space(n).water);

/**
 * Shortest paths from `from` within `max` steps. A space is entered when `enter(prev, next)` allows it,
 * and expanded further only when `pass(next)` allows it.
 */
export function paths(
  from: SpaceId,
  max: number,
  enter: (prev: SpaceId, next: SpaceId) => boolean,
  pass: (id: SpaceId) => boolean,
): Map<SpaceId, SpaceId[]> {
  const out = new Map<SpaceId, SpaceId[]>([[from, [from]]]);
  let frontier = [from];
  for (let d = 0; d < max; d++) {
    const next: SpaceId[] = [];
    for (const s of frontier)
      for (const n of space(s).neighbors) {
        if (out.has(n) || !enter(s, n)) continue;
        out.set(n, [...out.get(s)!, n]);
        if (pass(n)) next.push(n);
      }
    frontier = next;
  }
  out.delete(from);
  return out;
}

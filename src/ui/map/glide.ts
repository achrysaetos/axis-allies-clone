import type { SpaceId, Unit } from '../../engine/types';
import { CENTER, MAP_WIDTH } from './geometry';

export const glideKey = (space: SpaceId, owner: string, type: string) => `${space}|${owner}|${type}`;

/**
 * Where each stack that just arrived came from, as the offset from its new space back to its old one, so it can
 * slide into place. The map wraps east to west, so a move across the seam takes the short way round.
 */
export function glidesBetween(prev: readonly Unit[], next: readonly Unit[]): Map<string, [number, number]> {
  const was = new Map(prev.map((u) => [u.id, u.at]));
  const out = new Map<string, [number, number]>();
  for (const u of next) {
    const from = was.get(u.id);
    if (from === undefined || from === u.at) continue;
    const a = CENTER.get(from);
    const b = CENTER.get(u.at);
    if (!a || !b) continue;
    let dx = a[0] - b[0];
    if (dx > MAP_WIDTH / 2) dx -= MAP_WIDTH;
    if (dx < -MAP_WIDTH / 2) dx += MAP_WIDTH;
    out.set(glideKey(u.at, u.owner, u.type), [dx, a[1] - b[1]]);
  }
  return out;
}

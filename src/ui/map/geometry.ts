import geometryJson from '../../data/geometry.json';
import { SPACE_IDS, space } from '../../engine/data';
import type { SpaceId } from '../../engine/types';

export const MAP_WIDTH = geometryJson.width;
export const MAP_HEIGHT = geometryJson.height;

export interface SpaceShape {
  id: SpaceId;
  d: string;
  center: [number, number];
  water: boolean;
  /** Land too small to hit reliably with a pointer, given a round click pad over its center. */
  tiny: boolean;
}

const TINY_AREA = 2600;

/** Shoelace area of an SVG path made of straight-edged polygons. */
function areaOf(d: string): number {
  let a = 0;
  for (const poly of d.split(/(?=M)/)) {
    const n = (poly.match(/-?[\d.]+/g) ?? []).map(Number);
    for (let i = 0; i + 1 < n.length; i += 2) {
      const j = i + 2 < n.length - 1 ? i + 2 : 0;
      a += n[i]! * n[j + 1]! - n[j]! * n[i + 1]!;
    }
  }
  return Math.abs(a / 2);
}

const raw: Record<SpaceId, { center: number[]; polygons: string[] }> = geometryJson.spaces;

export const SHAPES: readonly SpaceShape[] = SPACE_IDS.map((id) => {
  const g = raw[id];
  if (!g) throw new Error(`no geometry for ${id}`);
  const [x = 0, y = 0] = g.center;
  const d = g.polygons.join('');
  return { id, d, center: [x, y], water: space(id).water, tiny: !space(id).water && areaOf(d) < TINY_AREA };
});

export const CENTER: ReadonlyMap<SpaceId, [number, number]> = new Map(SHAPES.map((s) => [s.id, s.center]));

export const seaNumber = (id: SpaceId) => id.replace(' Sea Zone', '');

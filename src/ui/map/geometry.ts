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
}

const raw: Record<SpaceId, { center: number[]; polygons: string[] }> = geometryJson.spaces;

export const SHAPES: readonly SpaceShape[] = SPACE_IDS.map((id) => {
  const g = raw[id];
  if (!g) throw new Error(`no geometry for ${id}`);
  const [x = 0, y = 0] = g.center;
  return { id, d: g.polygons.join(''), center: [x, y], water: space(id).water };
});

export const CENTER: ReadonlyMap<SpaceId, [number, number]> = new Map(SHAPES.map((s) => [s.id, s.center]));

export const seaNumber = (id: SpaceId) => id.replace(' Sea Zone', '');

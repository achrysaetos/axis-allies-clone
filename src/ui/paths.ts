import { SPACE_IDS, isAir, isLand, isSea, space } from '../engine/data';
import { planMove } from '../engine/movement';
import { isPassable, remainingMove } from '../engine/queries';
import type { GameState, SpaceId, Unit, UnitId } from '../engine/types';

export interface MoveIntent {
  units: UnitId[];
  sbr: boolean;
}

type Shape = { kind: 'adjacent' } | { kind: 'walk'; steps: number; enter: (id: SpaceId) => boolean };

function shapeOf(units: Unit[], from: SpaceId): Shape {
  const fromWater = space(from).water;
  const steps = Math.min(...units.map(remainingMove));
  if (units.every((u) => isLand(u.type))) {
    if (fromWater) return { kind: 'adjacent' };
    return { kind: 'walk', steps, enter: (id) => !space(id).water && isPassable(id) };
  }
  if (units.every((u) => isSea(u.type))) return { kind: 'walk', steps, enter: (id) => space(id).water };
  if (units.every((u) => isAir(u.type))) return { kind: 'walk', steps, enter: isPassable };
  return { kind: 'walk', steps, enter: isPassable };
}

function distancesTo(to: SpaceId, max: number, enter: (id: SpaceId) => boolean): Map<SpaceId, number> {
  const dist = new Map<SpaceId, number>([[to, 0]]);
  let frontier = [to];
  for (let d = 1; d <= max && frontier.length > 0; d++) {
    const next: SpaceId[] = [];
    for (const s of frontier)
      for (const n of space(s).neighbors) {
        if (dist.has(n)) continue;
        dist.set(n, d);
        if (enter(n)) next.push(n);
      }
    frontier = next;
  }
  return dist;
}

/** Simple paths from `from` to `to`, shortest first, bounded by `limit`. */
function candidatePaths(units: Unit[], from: SpaceId, to: SpaceId, limit: number): SpaceId[][] {
  if (from === to) return [];
  const shape = shapeOf(units, from);
  const adjacent = space(from).neighbors.includes(to);
  if (shape.kind === 'adjacent') return adjacent ? [[from, to]] : [];
  if (adjacent && units.every((u) => isLand(u.type)) && space(to).water) return [[from, to]];
  if (!shape.enter(to)) return [];
  const dist = distancesTo(to, shape.steps, shape.enter);
  const best = dist.get(from);
  if (best === undefined) return [];
  const out: SpaceId[][] = [];
  const path = [from];
  const walk = (at: SpaceId, left: number) => {
    if (out.length >= limit) return;
    if (at === to) {
      if (left === 0) out.push([...path]);
      return;
    }
    for (const n of space(at).neighbors) {
      const d = dist.get(n);
      if (d === undefined || d > left - 1 || path.includes(n)) continue;
      if (n !== to && !shape.enter(n)) continue;
      path.push(n);
      walk(n, left - 1);
      path.pop();
    }
  };
  for (let len = best; len <= shape.steps && out.length < limit; len++) walk(from, len);
  return out;
}

export type MoveResolution = { ok: true; path: SpaceId[] } | { ok: false; error: string };

export function resolveMove(state: GameState, intent: MoveIntent, from: SpaceId, to: SpaceId, limit = 60): MoveResolution {
  const units = intent.units.map((id) => state.units.find((u) => u.id === id)).filter((u): u is Unit => !!u);
  if (units.length === 0) return { ok: false, error: 'select units to move' };
  const paths = candidatePaths(units, from, to, limit);
  if (paths.length === 0) return { ok: false, error: `${to} is out of reach` };
  let firstError: string | null = null;
  for (const path of paths) {
    const r = planMove(state, { units: intent.units, path, sbr: intent.sbr || undefined });
    if (typeof r !== 'string') return { ok: true, path };
    firstError ??= r;
  }
  return { ok: false, error: firstError ?? `${to} is out of reach` };
}

export function reachable(state: GameState, intent: MoveIntent, from: SpaceId): Set<SpaceId> {
  const out = new Set<SpaceId>();
  if (intent.units.length === 0) return out;
  for (const id of SPACE_IDS) {
    if (id !== from && resolveMove(state, intent, from, id, 4).ok) out.add(id);
  }
  return out;
}

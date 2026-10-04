import { SPACE_IDS, isAir, isLand, isSea, space } from '../engine/data';
import { apply } from '../engine/game';
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

export type MoveResolution = { ok: true; moves: { units: UnitId[]; path: SpaceId[] }[] } | { ok: false; error: string };

const domainOf = (u: Unit) => (isAir(u.type) ? 'air' : isSea(u.type) ? 'sea' : 'land');

/** Split a mixed selection into one group per domain; the engine moves land, sea and air separately. */
function groups(state: GameState, ids: UnitId[]): Unit[][] {
  const units = ids.map((id) => state.units.find((u) => u.id === id)).filter((u): u is Unit => !!u);
  const byDomain = new Map<string, Unit[]>();
  for (const u of units) byDomain.set(domainOf(u), [...(byDomain.get(domainOf(u)) ?? []), u]);
  return ['land', 'sea', 'air'].map((d) => byDomain.get(d)).filter((g): g is Unit[] => !!g);
}

function pathFor(state: GameState, units: Unit[], sbr: boolean, from: SpaceId, to: SpaceId, limit: number): MoveResolution & { path?: SpaceId[] } {
  const paths = candidatePaths(units, from, to, limit);
  if (paths.length === 0) return { ok: false, error: `${to} is out of reach` };
  let firstError: string | null = null;
  const ids = units.map((u) => u.id);
  for (const path of paths) {
    const r = planMove(state, { units: ids, path, sbr: (sbr && units.some((u) => isAir(u.type))) || undefined });
    if (typeof r !== 'string') return { ok: true, moves: [{ units: ids, path }] };
    firstError ??= r;
  }
  return { ok: false, error: firstError ?? `${to} is out of reach` };
}

/** Moves that carry the selection to `to`, each validated against the state left by the one before. */
export function resolveMove(state: GameState, intent: MoveIntent, from: SpaceId, to: SpaceId, limit = 60): MoveResolution {
  const gs = groups(state, intent.units);
  if (gs.length === 0) return { ok: false, error: 'select units to move' };
  const moves: { units: UnitId[]; path: SpaceId[] }[] = [];
  let cur = state;
  for (const g of gs) {
    const r = pathFor(cur, g, intent.sbr, from, to, limit);
    if (!r.ok) return r;
    const move = r.moves[0]!;
    const next = apply(cur, { type: 'move', units: move.units, path: move.path, sbr: (intent.sbr && g.some((u) => isAir(u.type))) || undefined });
    if (!next.ok) return { ok: false, error: next.error };
    moves.push(move);
    cur = next.state;
  }
  return { ok: true, moves };
}

export function reachable(state: GameState, intent: MoveIntent, from: SpaceId): Set<SpaceId> {
  const out = new Set<SpaceId>();
  const gs = groups(state, intent.units);
  if (gs.length === 0) return out;
  for (const id of SPACE_IDS) {
    if (id !== from && gs.every((g) => pathFor(state, g, intent.sbr, from, id, 4).ok)) out.add(id);
  }
  return out;
}

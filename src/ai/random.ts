import { STATS, isAir, isLand, isSea, space } from '../engine/data';
import { UNIT_TYPES } from '../engine/types';
import { apply } from '../engine/game';
import { autoCasualties } from '../engine/casualties';
import { battleBlocker } from '../engine/combat';
import { areAllied, canLandAir, enemyUnitsAt, factoryAt, isHostileSea, remainingMove } from '../engine/queries';
import type { Action, GameState, SpaceId, Unit, UnitType } from '../engine/types';

export type Rand = () => number;

const pick = <T>(xs: readonly T[], rand: Rand): T | undefined => xs[Math.floor(rand() * xs.length)];

const legal = (s: GameState, a: Action) => apply(s, a).ok;

/** Shortest paths from a unit's space through spaces its domain may enter, ignoring hostility. */
export function pathsFrom(u: Unit, max: number): Map<SpaceId, SpaceId[]> {
  const paths = new Map<SpaceId, SpaceId[]>([[u.at, [u.at]]]);
  let frontier = [u.at];
  for (let d = 0; d < max; d++) {
    const next: SpaceId[] = [];
    for (const s of frontier)
      for (const n of space(s).neighbors) {
        if (paths.has(n)) continue;
        const water = space(n).water;
        if (isSea(u.type) && !water) continue;
        if (isLand(u.type) && water) continue;
        paths.set(n, [...paths.get(s)!, n]);
        next.push(n);
      }
    frontier = next;
  }
  paths.delete(u.at);
  return paths;
}

export function randomAction(s: GameState, rand: Rand = Math.random): Action {
  const d = s.pending;
  if (d) {
    switch (d.kind) {
      case 'casualties': {
        const b = s.battles.find((x) => x.id === d.battle)!;
        const list = d.side === 'attacker' ? b.attackers : b.defenders;
        const pool = s.units.filter((u) => list.includes(u.id) && !b.submerged.includes(u.id) && !b.doomed.includes(u.id));
        const shuffled = [...pool].sort(() => rand() - 0.5);
        const attempt = autoCasualties(d.groups, shuffled.reverse());
        const action: Action = { type: 'casualties', units: attempt };
        return legal(s, action) ? action : { type: 'casualties', units: autoCasualties(d.groups, pool) };
      }
      case 'submerge':
        return { type: 'submerge', units: d.subs.filter(() => rand() < 0.3) };
      case 'retreat':
        return { type: 'retreat', to: rand() < 0.25 ? (pick(d.options, rand) ?? null) : null };
      case 'bombard':
        return { type: 'bombard', ships: d.ships.filter(() => rand() < 0.8).slice(0, d.max) };
      case 'intercept':
        return { type: 'intercept', units: d.fighters.filter(() => rand() < 0.5) };
      case 'landStranded':
        return {
          type: 'landStranded',
          landings: Object.fromEntries(d.fighters.map((f) => [f, pick(d.options[f]!, rand) ?? null])),
        };
    }
  }
  switch (s.phase) {
    case 'purchase':
      return s.purchases.length === 0 && rand() < 0.9 ? randomPurchase(s, rand) : { type: 'endPhase' };
    case 'combatMove':
      return escapeLoneTransport(s) ?? (rand() < 0.85 ? randomMove(s, rand, true) : { type: 'endPhase' });
    case 'noncombatMove':
      return landAir(s, rand) ?? (rand() < 0.8 ? randomMove(s, rand, false) : { type: 'endPhase' });
    case 'combat': {
      const open = s.battles.filter((b) => !b.resolved && battleBlocker(s, b) === null);
      const b = pick(open, rand);
      if (!b) return { type: 'endPhase' };
      return b.optional && rand() < 0.3 ? { type: 'skipBattle', battle: b.id } : { type: 'startBattle', battle: b.id };
    }
    case 'mobilize':
      return randomPlacement(s, rand) ?? { type: 'endPhase' };
  }
}

function randomPurchase(s: GameState, rand: Rand): Action {
  let budget = s.treasury[s.power];
  const counts = new Map<UnitType, number>();
  for (let i = 0; i < 20 && budget >= 3; i++) {
    const t = pick(UNIT_TYPES, rand)!;
    if (STATS[t].cost > budget) continue;
    const trial = new Map(counts).set(t, (counts.get(t) ?? 0) + 1);
    const action: Action = { type: 'buy', purchases: [...trial].map(([type, count]) => ({ type, count })) };
    if (!legal(s, action)) continue;
    counts.set(t, trial.get(t)!);
    budget -= STATS[t].cost;
  }
  return { type: 'buy', purchases: [...counts].map(([type, count]) => ({ type, count })) };
}

function randomMove(s: GameState, rand: Rand, combat: boolean): Action {
  const movable = s.units.filter(
    (u) => u.owner === s.power && u.type !== 'factory' && (remainingMove(u) > 0 || u.carriedBy !== null),
  );
  for (let attempt = 0; attempt < 12; attempt++) {
    const u = pick(movable, rand);
    if (!u) break;
    const group = s.units
      .filter((x) => x.owner === u.owner && x.type === u.type && x.at === u.at && x.carriedBy === u.carriedBy)
      .slice(0, 1 + Math.floor(rand() * 3))
      .map((x) => x.id);
    const action = candidateMove(s, u, group, rand, combat);
    if (action && legal(s, action)) return action;
  }
  return { type: 'endPhase' };
}

function candidateMove(s: GameState, u: Unit, group: number[], rand: Rand, combat: boolean): Action | null {
  if (u.carriedBy !== null && isLand(u.type)) {
    const target = pick(
      space(u.at).neighbors.filter((n) => !space(n).water),
      rand,
    );
    return target ? { type: 'move', units: group, path: [u.at, target] } : null;
  }
  if (isLand(u.type) && rand() < 0.25) {
    const zone = pick(
      space(u.at).neighbors.filter((n) => space(n).water),
      rand,
    );
    if (zone) return { type: 'move', units: group, path: [u.at, zone] };
  }
  const paths = pathsFrom(u, remainingMove(u));
  let targets = [...paths.keys()];
  if (combat)
    targets = targets.filter(
      (t) => enemyUnitsAt(s, t, s.power).length > 0 || (!space(t).water && !areAllied(s.owner[t]!, s.power)),
    );
  const target = pick(targets, rand);
  if (!target) return null;
  const sbr = combat && u.type === 'bomber' && !!factoryAt(s, target) && rand() < 0.5;
  return { type: 'move', units: group, path: paths.get(target)!, ...(sbr ? { sbr } : {}) };
}

/** Move one stranded aircraft toward the nearest legal landing space. */
function landAir(s: GameState, rand: Rand): Action | null {
  for (const u of s.units) {
    if (u.owner !== s.power || !isAir(u.type) || remainingMove(u) === 0) continue;
    if (!space(u.at).water ? canLandAir(s, u.at, s.power) : u.type === 'fighter' && hasCarrier(s, u.at)) continue;
    const paths = pathsFrom(u, remainingMove(u));
    const options = [...paths.entries()].filter(([t]) =>
      space(t).water ? u.type === 'fighter' && hasCarrier(s, t) : canLandAir(s, t, s.power),
    );
    options.sort((a, b) => a[1].length - b[1].length || rand() - 0.5);
    for (const [, path] of options) {
      const action: Action = { type: 'move', units: [u.id], path };
      if (legal(s, action)) return action;
    }
  }
  return null;
}

const hasCarrier = (s: GameState, zone: SpaceId) =>
  s.units.some((c) => c.at === zone && c.type === 'carrier' && areAllied(c.owner, s.power));

function randomPlacement(s: GameState, rand: Rand): Action | null {
  for (const p of [...s.purchases].sort(() => rand() - 0.5)) {
    const action = placementFor(s, p.type, rand);
    if (action) return action;
  }
  return null;
}

function placementFor(s: GameState, type: UnitType, rand: Rand): Action | null {
  const factories = s.units.filter((u) => u.type === 'factory' && u.owner === s.power).map((u) => u.at);
  const spots =
    type === 'factory'
      ? Object.keys(s.owner).filter((t) => s.owner[t] === s.power)
      : [...factories, ...factories.flatMap((f) => space(f).neighbors.filter((n) => space(n).water))];
  for (const at of [...spots].sort(() => rand() - 0.5)) {
    const action: Action = { type: 'place', unitType: type, at, count: 1 };
    if (legal(s, action)) return action;
  }
  return null;
}

/** Unescorted transports that start beside enemy warships must sail away before combat. */
export function escapeLoneTransport(s: GameState): Action | null {
  for (const t of s.units) {
    if (t.owner !== s.power || t.type !== 'transport' || t.moved > 0 || !isHostileSea(s, t.at, s.power)) continue;
    if (s.units.some((u) => u.at === t.at && u.owner === s.power && STATS[u.type].attack > 0 && u.carriedBy === null)) continue;
    for (const n of space(t.at).neighbors) {
      const action: Action = { type: 'move', units: [t.id], path: [t.at, n] };
      if (space(n).water && !isHostileSea(s, n, s.power) && legal(s, action)) return action;
    }
  }
  return null;
}

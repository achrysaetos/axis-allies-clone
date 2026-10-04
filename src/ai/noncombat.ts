import { STATS, TRANSPORT_CAPACITY, isAir, isLand, isNeutral, isSea, space } from '../engine/data';
import { carrierRoom, isHostileSea, seaPassageOpen } from '../engine/queries';
import type { GameState, Power, SpaceId, Unit } from '../engine/types';
import { Draft, frontDistance, isEnemyLand, isFriendly, mine, ownFactories, safeLanding } from './board';
import { dangerAt } from './eval';
import { paths, seaDist } from './geo';

const GARRISON_DANGER = 0.25;

/** Ferry troops, escort transports, land every aircraft, then march land units toward the front. */
export function planNoncombat(s: GameState): Draft {
  const d = new Draft(s);
  ferry(d);
  escort(d);
  landAir(d);
  advance(d);
  return d;
}

const canSail = (s: GameState, power: Power) => (prev: SpaceId, next: SpaceId) =>
  space(next).water && !isHostileSea(s, next, power) && seaPassageOpen(s, prev, next, power);

const idle = (u: Unit) => !u.movedInCombat && !u.fought && !u.retreated;

const transportsOf = (s: GameState) =>
  mine(s).filter((u) => u.type === 'transport' && idle(u) && u.offloadedTo === null && u.moved < STATS.transport.move);

/** May `u` leave its territory without leaving a factory there likely to fall? */
function canLeave(s: GameState, u: Unit): boolean {
  if (!ownFactories(s, s.power).includes(u.at)) return true;
  const stay = s.units.filter((x) => x.at === u.at && x.owner === s.power && x.id !== u.id && isLand(x.type));
  if (stay.length > 4 && dangerAt(s, u.at, s.power).win < 0.05) return true;
  const without = { ...s, units: s.units.filter((x) => x.id !== u.id) };
  return dangerAt(without, u.at, s.power).win < GARRISON_DANGER;
}

/** Zones next to coasts worth delivering troops to: enemy shores and our own front line. */
function landingGoals(s: GameState, front: Map<SpaceId, number>): Set<SpaceId> {
  const goals = new Set<SpaceId>();
  for (const id of Object.keys(s.owner)) {
    if (isNeutral(id)) continue;
    const useful = isEnemyLand(s, id, s.power) || (front.get(id) ?? 99) <= 1;
    if (!useful) continue;
    for (const z of space(id).neighbors) if (space(z).water) goals.add(z);
  }
  return goals;
}

const nearestGoal = (zone: SpaceId, goals: Set<SpaceId>) => Math.min(99, ...[...goals].map((g) => seaDist(zone, g)));

function ferry(d: Draft): void {
  const front = frontDistance(d.state, d.state.power);
  const goals = landingGoals(d.state, front);
  for (const t0 of transportsOf(d.state)) {
    let t = d.state.units.find((u) => u.id === t0.id)!;
    if (!t || t.offloadedTo !== null) continue;
    if (d.state.units.every((u) => u.carriedBy !== t.id)) {
      if (!pickUp(d, t, goals)) continue;
      t = d.state.units.find((u) => u.id === t0.id)!;
    }
    deliver(d, t, front, goals);
  }
}

/** Sail an empty transport to the nearest coast with spare troops and load them. */
function pickUp(d: Draft, t: Unit, goals: Set<SpaceId>): boolean {
  const s = d.state;
  const reach = paths(t.at, STATS.transport.move - t.moved, canSail(s, s.power), (id) => !isHostileSea(s, id, s.power));
  const zones: [SpaceId, SpaceId[]][] = [[t.at, [t.at]], ...reach];
  let best: { zone: SpaceId; path: SpaceId[]; from: SpaceId; units: Unit[]; score: number } | null = null;
  for (const [zone, path] of zones) {
    for (const land of space(zone).neighbors) {
      if (space(land).water || !isFriendly(s, land, s.power)) continue;
      const units = cargoFrom(s, land);
      if (units.length === 0) continue;
      const score = units.length * 2 - path.length + 1 - nearestGoal(zone, goals) / 2;
      if (!best || score > best.score) best = { zone, path, from: land, units, score };
    }
  }
  if (!best) {
    homeward(d, t, goals);
    return false;
  }
  const mark = d.mark();
  if (best.path.length > 1 && !d.try({ type: 'move', units: [t.id], path: best.path })) return false;
  if (!d.try({ type: 'move', units: best.units.map((u) => u.id), path: [best.from, best.zone], transport: t.id })) {
    d.rollback(mark);
    return false;
  }
  return true;
}

/** Up to a transport's load of idle troops in `land`: a heavy unit plus infantry when possible. */
function cargoFrom(s: GameState, land: SpaceId): Unit[] {
  const pool = s.units.filter((u) => u.at === land && u.owner === s.power && isLand(u.type) && u.type !== 'aaGun' && u.moved === 0 && idle(u) && u.carriedBy === null);
  const picked: Unit[] = [];
  let room = TRANSPORT_CAPACITY;
  const order = ['armour', 'artillery', 'infantry', 'infantry'] as const;
  for (const type of order) {
    const u = pool.find((x) => x.type === type && !picked.includes(x) && (STATS[x.type].transportCost ?? 99) <= room);
    if (!u || !canLeave({ ...s, units: s.units.filter((x) => !picked.includes(x)) }, u)) continue;
    picked.push(u);
    room -= STATS[u.type].transportCost!;
    if (picked.length === 2) break;
  }
  return picked;
}

/** Empty transports with nothing to carry wait next to our factories. */
function homeward(d: Draft, t: Unit, _goals: Set<SpaceId>): void {
  const s = d.state;
  const homes = new Set(ownFactories(s, s.power).flatMap((f) => space(f).neighbors.filter((n) => space(n).water)));
  if (homes.size === 0 || homes.has(t.at)) return;
  const reach = paths(t.at, STATS.transport.move - t.moved, canSail(s, s.power), (id) => !isHostileSea(s, id, s.power));
  const ranked = [...reach].sort((a, b) => nearestGoal(a[0], homes) - nearestGoal(b[0], homes));
  for (const [zone, path] of ranked.slice(0, 3)) {
    if (nearestGoal(zone, homes) >= nearestGoal(t.at, homes)) break;
    if (d.try({ type: 'move', units: [t.id], path })) return;
    void zone;
  }
}

/** Offload at the most forward friendly coast in reach, or sail toward the nearest useful shore. */
function deliver(d: Draft, t: Unit, front: Map<SpaceId, number>, goals: Set<SpaceId>): void {
  const s = d.state;
  const cargo = s.units.filter((u) => u.carriedBy === t.id);
  if (cargo.length === 0) return;
  const reach = paths(t.at, STATS.transport.move - t.moved, canSail(s, s.power), (id) => !isHostileSea(s, id, s.power));
  const zones: [SpaceId, SpaceId[]][] = [[t.at, [t.at]], ...reach];
  const drops: { zone: SpaceId; path: SpaceId[]; land: SpaceId; f: number }[] = [];
  for (const [zone, path] of zones)
    for (const land of space(zone).neighbors)
      if (!space(land).water && !isNeutral(land) && isFriendly(s, land, s.power) && (front.get(land) ?? 99) <= 2)
        drops.push({ zone, path, land, f: front.get(land)! });
  drops.sort((a, b) => a.f - b.f || a.path.length - b.path.length);
  for (const drop of drops) {
    const mark = d.mark();
    if (drop.path.length > 1 && !d.try({ type: 'move', units: [t.id], path: drop.path })) continue;
    if (d.try({ type: 'move', units: cargo.map((u) => u.id), path: [drop.zone, drop.land] })) return;
    d.rollback(mark);
  }
  const ranked = zones.filter(([z]) => !isHostileSea(s, z, s.power)).sort((a, b) => nearestGoal(a[0], goals) - nearestGoal(b[0], goals) || a[1].length - b[1].length);
  for (const [, path] of ranked) {
    if (path.length === 1) return;
    if (d.try({ type: 'move', units: [t.id], path })) return;
  }
}

/** Warships shadow the biggest group of our transports, or stay put. */
function escort(d: Draft): void {
  const s0 = d.state;
  const groups = new Map<SpaceId, number>();
  for (const t of mine(s0).filter((u) => u.type === 'transport')) groups.set(t.at, (groups.get(t.at) ?? 0) + 1);
  if (groups.size === 0) return;
  for (const ship of mine(s0).filter((u) => isSea(u.type) && u.type !== 'transport' && idle(u) && u.moved < STATS[u.type].move)) {
    const s = d.state;
    const reach = paths(ship.at, STATS[ship.type].move - ship.moved, canSail(s, s.power), (id) => !isHostileSea(s, id, s.power));
    const best = [...reach].filter(([z]) => groups.has(z)).sort((a, b) => groups.get(b[0])! - groups.get(a[0])!)[0];
    if (!best || (groups.get(ship.at) ?? 0) >= groups.get(best[0])!) continue;
    d.try({ type: 'move', units: [ship.id], path: best[1] });
  }
}

/** Every aircraft ends on a safe landing: the most forward safe territory, or a carrier with room. */
function landAir(d: Draft): void {
  const front = frontDistance(d.state, d.state.power);
  for (const u0 of mine(d.state).filter((u) => isAir(u.type))) {
    const s = d.state;
    const u = s.units.find((x) => x.id === u0.id)!;
    const left = STATS[u.type].move - u.moved;
    const here = space(u.at).water ? u.type === 'fighter' && carrierRoom(s, u.at, u.owner) >= 0 : safeLanding(s, u, u.at);
    if (left <= 0) continue;
    const reach = paths(u.at, left, (_p, n) => !isNeutral(n), (n) => !isNeutral(n));
    const score = (at: SpaceId) => {
      if (space(at).water) return -3;
      const f = front.get(at) ?? 9;
      return -Math.abs(f - 1) + (ownFactories(s, s.power).includes(at) ? 0.5 : 0);
    };
    const options = [...reach].filter(([at]) => safeLanding(s, u, at)).sort((a, b) => score(b[0]) - score(a[0]) || a[1].length - b[1].length);
    for (const [at, path] of options) {
      if (here && score(at) <= score(u.at)) break;
      if (!space(at).water && dangerAt(s, at, s.power).win > 0.5 && options.length > 1) continue;
      if (d.try({ type: 'move', units: [u.id], path })) break;
    }
  }
}

/** Move idle land units one hop at a time toward the front, keeping factory garrisons. */
function advance(d: Draft): void {
  const front = frontDistance(d.state, d.state.power);
  for (const u0 of mine(d.state).filter((u) => isLand(u.type) && u.type !== 'aaGun')) {
    const s = d.state;
    const u = s.units.find((x) => x.id === u0.id)!;
    if (u.carriedBy !== null || !idle(u) || u.offloadedTo !== null || u.moved >= STATS[u.type].move) continue;
    const here = front.get(u.at) ?? 99;
    if (here <= 1) continue;
    const reach = paths(u.at, STATS[u.type].move - u.moved, (_p, n) => isFriendly(s, n, s.power) && !isNeutral(n), (n) => isFriendly(s, n, s.power));
    const best = [...reach].sort((a, b) => (front.get(a[0]) ?? 99) - (front.get(b[0]) ?? 99) || a[1].length - b[1].length)[0];
    if (!best || (front.get(best[0]) ?? 99) >= here) continue;
    if (!canLeave(s, u)) continue;
    d.try({ type: 'move', units: [u.id], path: best[1] });
  }
}

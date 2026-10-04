import { CAPITAL_OF, STATS, TRANSPORT_CAPACITY, isAir, isLand, isNeutral, isSea, space } from '../engine/data';
import { combatMoveErrors } from '../engine/movement';
import { canLandAir, enemyUnitsAt, isHostileSea, seaPassageOpen } from '../engine/queries';
import type { Action, GameState, Power, SpaceId, Unit, UnitId } from '../engine/types';
import { Draft, enemiesAt, isEnemyLand, isFriendly, mine, ownFactories } from './board';
import { type Combatant, asCombatants, dangerAt, simulate } from './eval';
import { airDist, landDist, paths, seaDist } from './geo';

/** One self-contained way to commit force to a target: a unit walking or flying in, or a loaded transport. */
interface Option {
  units: Unit[];
  /** Units that fight (transport cargo, not the transport). */
  fighters: Combatant[];
  actions: Action[];
  order: number;
  land: boolean;
}

interface Target {
  at: SpaceId;
  kind: 'land' | 'sea';
  /** IPC-equivalent value of taking or clearing the space, beyond the units destroyed. */
  gain: number;
}

const WIN_LAND = 0.8;
const WIN_CAPITAL = 0.6;
const WIN_SEA = 0.7;
const GARRISON_DANGER = 0.25;

const ORDER: Partial<Record<string, number>> = { infantry: 0, artillery: 1, armour: 2, submarine: 3, destroyer: 3, cruiser: 4, battleship: 5, fighter: 6, bomber: 7 };

/** Greedy attack plan: best-value targets first, each with the smallest force that wins often enough. */
export function planCombatMove(s: GameState): Draft {
  const d = new Draft(s);
  const used = new Set<UnitId>(garrison(s));
  for (const target of targets(s)) {
    if (target.kind === 'land' && !isEnemyLand(d.state, target.at, s.power)) continue;
    const force = assemble(d.state, target, used);
    if (!force) continue;
    const mark = d.mark();
    const actions = force.flatMap((o) => o.actions);
    if (!d.tryAll(actions) || combatMoveErrors(d.state).length > 0) {
      d.rollback(mark);
      continue;
    }
    for (const o of force) for (const u of o.units) used.add(u.id);
  }
  return d;
}

/** Units that must stay home so that no factory is likely to fall next turn. */
function garrison(s: GameState): UnitId[] {
  const kept: UnitId[] = [];
  for (const f of ownFactories(s, s.power)) {
    const home = s.units
      .filter((u) => u.at === f && u.owner === s.power && isLand(u.type))
      .sort((a, b) => STATS[a.type].cost / STATS[a.type].defense - STATS[b.type].cost / STATS[b.type].defense);
    // Danger falls as the garrison grows, so binary-search the smallest safe prefix of `home`.
    const safeWith = (k: number) => {
      const keep = new Set(home.slice(0, k).map((u) => u.id));
      return dangerAt(s, f, s.power, [], (x) => x.owner !== s.power || !isLand(x.type) || keep.has(x.id)).win < GARRISON_DANGER;
    };
    let lo = 0;
    let hi = home.length;
    if (!safeWith(hi)) lo = hi;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (safeWith(mid)) hi = mid;
      else lo = mid + 1;
    }
    kept.push(...home.slice(0, lo).map((u) => u.id));
  }
  return kept;
}

function targets(s: GameState): Target[] {
  const power = s.power;
  const out: Target[] = [];
  for (const [at, owner] of Object.entries(s.owner)) {
    if (!isEnemyLand(s, at, power) || isNeutral(at)) continue;
    const def = space(at);
    const capital = def.capital && CAPITAL_OF[def.capital as Power] === at ? 20 + s.treasury[owner] : 0;
    out.push({ at, kind: 'land', gain: def.ipc * 2 + (def.victoryCity ? 6 : 0) + capital });
  }
  const zones = new Set(s.units.filter((u) => space(u.at).water && enemiesAt(s, u.at, power).length > 0).map((u) => u.at));
  for (const at of zones) out.push({ at, kind: 'sea', gain: 0 });
  const worth = new Map(out.map((t) => [t, t.gain + enemiesAt(s, t.at, power).reduce((n, u) => n + STATS[u.type].cost, 0) / 2]));
  return out.sort((a, b) => worth.get(b)! - worth.get(a)!);
}

/** Add options cheapest-first until the attack wins often enough and is worth its expected losses. */
function assemble(s: GameState, t: Target, used: Set<UnitId>): Option[] | null {
  const defenders = asCombatants(enemiesAt(s, t.at, s.power));
  const options = optionsFor(s, t, used, landable(s)).sort((a, b) => a.order - b.order);
  if (t.kind === 'land' && defenders.length === 0) {
    const walker = options.find((o) => o.land && o.units.every((u) => isLand(u.type) || u.type === 'transport'));
    return walker ? [walker] : null;
  }
  if (defenders.length === 0) return null;
  const base: Combatant[] = t.kind === 'sea' ? asCombatants(s.units.filter((u) => u.at === t.at && u.owner === s.power && u.carriedBy === null && u.type !== 'transport')) : [];
  const need = t.kind === 'sea' ? WIN_SEA : t.gain >= 20 ? WIN_CAPITAL : WIN_LAND;
  const chosen: Option[] = [];
  const defPunch = defenders.reduce((n, c) => n + STATS[c.type].defense * STATS[c.type].hitPoints, 0);
  for (const o of options) {
    chosen.push(o);
    const attackers = [...base, ...chosen.flatMap((c) => c.fighters)];
    if (t.kind === 'land' && !chosen.some((c) => c.land)) continue;
    const punch = attackers.reduce((n, c) => n + STATS[c.type].attack, 0);
    if (punch < defPunch * 0.6) continue;
    const odds = simulate({ kind: t.kind, attackers, defenders, trials: 100 });
    if (odds.win < need) continue;
    const net = odds.win * t.gain + odds.defLoss - odds.attLoss;
    return net > 0 ? chosen : null;
  }
  return null;
}

const landable = (s: GameState) => Object.keys(s.owner).filter((id) => canLandAir(s, id, s.power));

function optionsFor(s: GameState, t: Target, used: Set<UnitId>, landing: SpaceId[]): Option[] {
  const power = s.power;
  const out: Option[] = [];
  const free = mine(s).filter((u) => !used.has(u.id) && u.type !== 'factory' && u.type !== 'aaGun' && u.moved < STATS[u.type].move);
  const homeDist = Math.min(99, ...landing.map((l) => airDist(t.at, l)));

  for (const u of free) {
    if (u.carriedBy !== null && !isAir(u.type)) continue;
    const left = STATS[u.type].move - u.moved;
    if (isAir(u.type)) {
      const there = airDist(u.at, t.at);
      if (there === 0 || there + homeDist > left) continue;
      const route = paths(u.at, there, (_p, n) => !isNeutral(n), (n) => !isNeutral(n)).get(t.at);
      if (route) out.push({ units: [u], fighters: asCombatants([u]), actions: [{ type: 'move', units: [u.id], path: route }], order: ORDER[u.type]! + there / 10, land: false });
    } else if (isLand(u.type) && t.kind === 'land' && !space(u.at).water) {
      if (landDist(u.at, t.at) > left) continue;
      const blitzer = u.type === 'armour';
      const route = paths(
        u.at,
        left,
        (_p, n) => !space(n).water && !isNeutral(n),
        (n) => isFriendly(s, n, power) || (blitzer && enemyUnitsAt(s, n, power).length === 0),
      ).get(t.at);
      if (route) out.push({ units: [u], fighters: asCombatants([u]), actions: [{ type: 'move', units: [u.id], path: route }], order: ORDER[u.type]!, land: true });
    } else if (isSea(u.type) && t.kind === 'sea' && u.type !== 'transport' && u.type !== 'carrier') {
      if (seaDist(u.at, t.at) > left) continue;
      const route = paths(u.at, left, (p, n) => space(n).water && seaPassageOpen(s, p, n, power), (n) => !isHostileSea(s, n, power)).get(t.at);
      if (route) out.push({ units: [u], fighters: asCombatants([u]), actions: [{ type: 'move', units: [u.id], path: route }], order: ORDER[u.type]!, land: false });
    }
  }
  if (t.kind === 'land') out.push(...amphibious(s, t, free, used));
  return out;
}

/** A transport that already carries troops, or loads them where it lies, sails to a quiet zone off `t` and lands them. */
function amphibious(s: GameState, t: Target, free: Unit[], used: Set<UnitId>): Option[] {
  const power = s.power;
  const out: Option[] = [];
  const quiet = (z: SpaceId) => !isHostileSea(s, z, power) && !enemyUnitsAt(s, z, power).some((u) => u.type === 'submarine');
  const drops = new Set(space(t.at).neighbors.filter((z) => space(z).water && quiet(z)));
  if (drops.size === 0) return out;
  for (const tr of free.filter((u) => u.type === 'transport' && u.offloadedTo === null)) {
    const route =
      drops.has(tr.at) ? [tr.at] : [...paths(tr.at, STATS.transport.move - tr.moved, (p, n) => space(n).water && seaPassageOpen(s, p, n, power) && quiet(n), quiet)].find(([z]) => drops.has(z))?.[1];
    if (!route) continue;
    const aboard = s.units.filter((u) => u.carriedBy === tr.id);
    if (aboard.some((u) => used.has(u.id))) continue;
    const actions: Action[] = [];
    let cargo = aboard;
    if (cargo.length === 0) {
      if (!quiet(tr.at)) continue;
      const shore = space(tr.at).neighbors.filter((n) => !space(n).water && isFriendly(s, n, power));
      const loadable = free.filter((u) => isLand(u.type) && u.moved === 0 && u.carriedBy === null && shore.includes(u.at) && u.offloadedTo === null);
      const from = shore.map((sh) => [sh, loadable.filter((u) => u.at === sh)] as const).sort((a, b) => b[1].length - a[1].length)[0];
      if (!from || from[1].length === 0) continue;
      cargo = pack(from[1]);
      actions.push({ type: 'move', units: cargo.map((u) => u.id), path: [from[0], tr.at], transport: tr.id });
    }
    if (route.length > 1) actions.push({ type: 'move', units: [tr.id], path: route });
    actions.push({ type: 'move', units: cargo.map((u) => u.id), path: [route[route.length - 1]!, t.at] });
    out.push({ units: [tr, ...cargo], fighters: asCombatants(cargo), actions, order: 2.5, land: true });
  }
  return out;
}

/** Fill one transport: the strongest heavy unit plus infantry. */
function pack(units: Unit[]): Unit[] {
  const sorted = [...units].sort((a, b) => STATS[b.type].attack - STATS[a.type].attack);
  const picked: Unit[] = [];
  let room = TRANSPORT_CAPACITY;
  for (const u of sorted) {
    const cost = STATS[u.type].transportCost ?? 99;
    if (cost > room || (picked.length === 1 && picked[0]!.type !== 'infantry' && u.type !== 'infantry' && room - cost < 0)) continue;
    picked.push(u);
    room -= cost;
    if (picked.length === 2) break;
  }
  return picked;
}

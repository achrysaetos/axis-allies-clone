import { CAPITAL_OF, STATS, TRANSPORT_CAPACITY, isAir, isLand, isNeutral, isSea, space } from '../engine/data';
import { combatMoveErrors } from '../engine/movement';
import { canLandAir, enemyUnitsAt, isHostileSea, seaPassageOpen } from '../engine/queries';
import type { Action, GameState, Power, SpaceId, Unit, UnitId } from '../engine/types';
import { Draft, enemiesAt, garrison, isEnemyLand, isFriendly, mine } from './board';
import { type Combatant, asCombatants, simulate, threatTo } from './eval';
import { airDist, landDist, paths, seaDist } from './geo';

/** One self-contained way to commit force to a target: a unit walking or flying in, or a loaded transport. */
interface Option {
  units: Unit[];
  /** Units that fight (transport cargo, not the transport). */
  combatants: Combatant[];
  actions: Action[];
  order: number;
  land: boolean;
}

interface Target {
  at: SpaceId;
  kind: 'land' | 'sea';
  /** IPC value banked the moment we take it: this turn's income and any plundered treasury. */
  now: number;
  /** Further IPC value of still holding it after the enemy's next turn. */
  held: number;
  capital: boolean;
}

const WIN_LAND = 0.8;
const WIN_CAPITAL = 0.6;
const WIN_SEA = 0.7;

const ORDER: Partial<Record<string, number>> = {
  infantry: 0,
  artillery: 1,
  armour: 2,
  submarine: 3,
  destroyer: 3,
  cruiser: 4,
  battleship: 5,
  fighter: 6,
  bomber: 7,
};

/** Greedy attack plan: best-value targets first, each with the smallest force that wins often enough. */
export function planCombatMove(s: GameState): Draft {
  const d = new Draft(s);
  const used = new Set<UnitId>([...garrison(s), ...evacuate(d)]);
  for (const target of targets(s)) {
    if (target.kind === 'land' && !isEnemyLand(d.state, target.at, s.power)) continue;
    const force = assemble(d.state, target, used);
    if (!force) continue;
    const mark = d.mark();
    const before = new Set(combatMoveErrors(d.state));
    const actions = force.flatMap((o) => o.actions);
    if (!d.tryAll(actions) || combatMoveErrors(d.state).some((e) => !before.has(e))) {
      d.rollback(mark);
      continue;
    }
    for (const o of force) for (const u of o.units) used.add(u.id);
  }
  landCommittedCargo(d, used);
  return d;
}

/**
 * A replan can start midway through an assault it no longer picks, such as after a save is reopened mid-phase:
 * troops that boarded, or a transport that sailed, are bound to land somewhere. Send each at the weakest coast it reaches.
 */
function landCommittedCargo(d: Draft, used: Set<UnitId>): void {
  const boundFor = (s: GameState) =>
    new Set(
      mine(s)
        .filter((t) => t.type === 'transport' && t.offloadedTo === null)
        .filter((t) => {
          const cargo = s.units.filter((u) => u.carriedBy === t.id);
          return cargo.length > 0 && ((t.movedInCombat && !t.escaped) || cargo.some((u) => u.loadedIn === 'combatMove'));
        })
        .map((t) => t.id),
    );
  for (const tr of boundFor(d.state)) {
    const s = d.state;
    if (!boundFor(s).has(tr)) continue;
    const transport = s.units.find((u) => u.id === tr)!;
    const coasts = targets(s)
      .filter((t) => t.kind === 'land')
      .sort((a, b) => enemiesAt(s, a.at, s.power).length - enemiesAt(s, b.at, s.power).length);
    for (const t of coasts) {
      const option = amphibious(s, t, [transport], used)[0];
      if (!option) continue;
      const before = new Set(combatMoveErrors(s));
      const mark = d.mark();
      if (d.tryAll(option.actions) && combatMoveErrors(d.state).every((e) => before.has(e))) break;
      d.rollback(mark);
    }
  }
}

/** Transports caught in a zone with enemy warships sail out before anything else moves; returns the movers. */
function evacuate(d: Draft): UnitId[] {
  const power = d.state.power;
  const moved: UnitId[] = [];
  for (const t of mine(d.state).filter((u) => u.type === 'transport' && u.moved === 0 && isHostileSea(d.state, u.at, power))) {
    const s = d.state;
    const havens = [
      ...paths(
        t.at,
        STATS.transport.move,
        (p, n) => space(n).water && seaPassageOpen(s, p, n, power) && !isHostileSea(s, n, power),
        () => true,
      ),
    ];
    const safety = (z: SpaceId) =>
      s.units.filter((u) => u.at === z && u.owner === power && isSea(u.type)).length - enemyUnitsAt(s, z, power).length;
    havens.sort((a, b) => safety(b[0]) - safety(a[0]) || a[1].length - b[1].length);
    for (const [, path] of havens) {
      const cargo = s.units.filter((u) => u.carriedBy === t.id).map((u) => u.id);
      if (d.try({ type: 'move', units: [t.id], path })) {
        moved.push(t.id, ...cargo);
        break;
      }
    }
  }
  return moved;
}

function targets(s: GameState): Target[] {
  const power = s.power;
  const out: Target[] = [];
  for (const [at, owner] of Object.entries(s.owner)) {
    if (!isEnemyLand(s, at, power) || isNeutral(at)) continue;
    const def = space(at);
    const capital = def.capital !== null && CAPITAL_OF[def.capital as Power] === at;
    out.push({
      at,
      kind: 'land',
      now: def.ipc + (capital ? s.treasury[owner] : 0),
      held: def.ipc + (def.victoryCity ? 6 : 0) + (capital ? 20 : 0),
      capital,
    });
  }
  const zones = new Set(s.units.filter((u) => space(u.at).water && enemiesAt(s, u.at, power).length > 0).map((u) => u.at));
  for (const at of zones) out.push({ at, kind: 'sea', now: 0, held: 0, capital: false });
  const worth = new Map(
    out.map((t) => [t, t.now + t.held + enemiesAt(s, t.at, power).reduce((n, u) => n + STATS[u.type].cost, 0) / 2]),
  );
  return out.sort((a, b) => worth.get(b)! - worth.get(a)!);
}

/** Add options cheapest-first until the attack wins often enough and is worth its expected losses. */
function assemble(s: GameState, t: Target, used: Set<UnitId>): Option[] | null {
  const defenders = asCombatants(enemiesAt(s, t.at, s.power));
  const options = optionsFor(s, t, used, landable(s)).sort((a, b) => a.order - b.order);
  if (t.kind === 'land' && defenders.length === 0) {
    const walker = options.find((o) => o.land && o.units.every((u) => isLand(u.type) || u.type === 'transport'));
    return walker && t.now + holdValue(s, t, walker.combatants, 0) > 0 ? [walker] : null;
  }
  if (defenders.length === 0) return null;
  const base: Combatant[] =
    t.kind === 'sea'
      ? asCombatants(
          s.units.filter((u) => u.at === t.at && u.owner === s.power && u.carriedBy === null && u.type !== 'transport'),
        )
      : [];
  const need = t.kind === 'sea' ? WIN_SEA : t.capital ? WIN_CAPITAL : WIN_LAND;
  const chosen: Option[] = [];
  const defPunch = defenders.reduce((n, c) => n + STATS[c.type].defense * STATS[c.type].hitPoints, 0);
  for (const o of options) {
    chosen.push(o);
    const attackers = [...base, ...chosen.flatMap((c) => c.combatants)];
    if (t.kind === 'land' && !chosen.some((c) => c.land)) continue;
    const punch = attackers.reduce((n, c) => n + STATS[c.type].attack, 0);
    if (punch < defPunch * 0.6) continue;
    const odds = simulate({ kind: t.kind, attackers, defenders, trials: 100 });
    if (odds.win < need) continue;
    const hold =
      t.kind === 'land'
        ? holdValue(
            s,
            t,
            attackers.filter((c) => isLand(c.type)),
            odds.attLoss,
          )
        : 0;
    const net = odds.win * (t.now + hold) + odds.defLoss - odds.attLoss;
    return net > 0 ? chosen : null;
  }
  return null;
}

/**
 * Expected value of still holding `t` after the enemy's turn, given the land units left after the attack.
 * Counting the survivors' likely loss as well made the AI measurably too timid (threatTo over-counts).
 */
function holdValue(s: GameState, t: Target, landAttackers: Combatant[], attLoss: number): number {
  const survivors = [...landAttackers].sort((a, b) => STATS[a.type].cost - STATS[b.type].cost);
  for (let lost = 0; survivors.length > 1 && lost + STATS[survivors[0]!.type].cost <= attLoss;)
    lost += STATS[survivors.shift()!.type].cost;
  const threat = asCombatants(threatTo(s, t.at, s.power).filter((u) => u.at !== t.at));
  if (threat.length === 0) return t.held;
  const counter = simulate({ kind: 'land', attackers: threat, defenders: survivors, trials: 60 });
  return t.held * (1 - counter.win);
}

const landable = (s: GameState) => Object.keys(s.owner).filter((id) => canLandAir(s, id, s.power));

function optionsFor(s: GameState, t: Target, used: Set<UnitId>, landing: SpaceId[]): Option[] {
  const power = s.power;
  const out: Option[] = [];
  const free = mine(s).filter(
    (u) => !used.has(u.id) && u.type !== 'factory' && u.type !== 'aaGun' && u.moved < STATS[u.type].move,
  );
  const homeDist = Math.min(99, ...landing.map((l) => airDist(t.at, l)));

  for (const u of free) {
    if (u.carriedBy !== null && !isAir(u.type)) continue;
    const left = STATS[u.type].move - u.moved;
    if (isAir(u.type)) {
      const there = airDist(u.at, t.at);
      if (there === 0 || there + homeDist > left) continue;
      const route = paths(
        u.at,
        there,
        (_p, n) => !isNeutral(n),
        (n) => !isNeutral(n),
      ).get(t.at);
      if (route)
        out.push({
          units: [u],
          combatants: asCombatants([u]),
          actions: [{ type: 'move', units: [u.id], path: route }],
          order: ORDER[u.type]! + there / 10,
          land: false,
        });
    } else if (isLand(u.type) && t.kind === 'land' && !space(u.at).water) {
      if (landDist(u.at, t.at) > left) continue;
      const blitzer = u.type === 'armour';
      const route = paths(
        u.at,
        left,
        (_p, n) => !space(n).water && !isNeutral(n),
        (n) => isFriendly(s, n, power) || (blitzer && enemyUnitsAt(s, n, power).length === 0),
      ).get(t.at);
      if (route)
        out.push({
          units: [u],
          combatants: asCombatants([u]),
          actions: [{ type: 'move', units: [u.id], path: route }],
          order: ORDER[u.type]!,
          land: true,
        });
    } else if (isSea(u.type) && t.kind === 'sea' && u.type !== 'transport' && u.type !== 'carrier') {
      if (seaDist(u.at, t.at) > left) continue;
      const route = paths(
        u.at,
        left,
        (p, n) => space(n).water && seaPassageOpen(s, p, n, power),
        (n) => !isHostileSea(s, n, power),
      ).get(t.at);
      if (route)
        out.push({
          units: [u],
          combatants: asCombatants([u]),
          actions: [{ type: 'move', units: [u.id], path: route }],
          order: ORDER[u.type]!,
          land: false,
        });
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
    const route = drops.has(tr.at)
      ? [tr.at]
      : [
          ...paths(
            tr.at,
            STATS.transport.move - tr.moved,
            (p, n) => space(n).water && seaPassageOpen(s, p, n, power) && quiet(n),
            quiet,
          ),
        ].find(([z]) => drops.has(z))?.[1];
    if (!route) continue;
    const aboard = s.units.filter((u) => u.carriedBy === tr.id);
    if (aboard.some((u) => used.has(u.id))) continue;
    const actions: Action[] = [];
    let cargo = aboard;
    if (cargo.length === 0) {
      if (!quiet(tr.at)) continue;
      const shore = space(tr.at).neighbors.filter((n) => !space(n).water && isFriendly(s, n, power));
      const loadable = free.filter(
        (u) => isLand(u.type) && u.moved === 0 && u.carriedBy === null && shore.includes(u.at) && u.offloadedTo === null,
      );
      const from = shore
        .map((sh) => [sh, loadable.filter((u) => u.at === sh)] as const)
        .sort((a, b) => b[1].length - a[1].length)[0];
      if (!from || from[1].length === 0) continue;
      cargo = pack(from[1]);
      actions.push({ type: 'move', units: cargo.map((u) => u.id), path: [from[0], tr.at], transport: tr.id });
    }
    if (route.length > 1) actions.push({ type: 'move', units: [tr.id], path: route });
    actions.push({ type: 'move', units: cargo.map((u) => u.id), path: [route[route.length - 1]!, t.at] });
    out.push({ units: [tr, ...cargo], combatants: asCombatants(cargo), actions, order: 2.5, land: true });
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
    if (cost > room) continue;
    picked.push(u);
    room -= cost;
    if (picked.length === 2) break;
  }
  return picked;
}

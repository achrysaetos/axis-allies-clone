import { CARRIER_CAPACITY, STATS, isAir, isLand, isSea, space } from './data';
import {
  airDistances,
  areAllied,
  canLandAir,
  enemyUnitsAt,
  factoryAt,
  hasEnemyDestroyer,
  isFriendlyLand,
  isHostileLand,
  isHostileSea,
  isPassable,
  remainingMove,
  seaDistances,
  seaPassageOpen,
  transportHasRoom,
  unitsAt,
  wasHostileAtTurnStart,
} from './queries';
import { captureTerritory } from './capture';
import type { GameState, Power, SpaceId, Unit, UnitId } from './types';

export type MoveAction = { units: UnitId[]; path: SpaceId[]; sbr?: boolean; transport?: UnitId };

type MoveKind = 'land' | 'sea' | 'air' | 'load' | 'offload';

interface Plan {
  kind: MoveKind;
  units: Unit[];
  transports?: Map<UnitId, UnitId>;
}

const adjacent = (a: SpaceId, b: SpaceId) => space(a).neighbors.includes(b);

/** Enemy units that make a land space contested (factories never fight). */
const enemyDefendersAt = (state: GameState, at: SpaceId, power: Power) =>
  enemyUnitsAt(state, at, power).filter((u) => u.type !== 'factory');

export function planMove(state: GameState, action: MoveAction): Plan | string {
  const { path } = action;
  const combat = state.phase === 'combatMove';
  if (!combat && state.phase !== 'noncombatMove') return 'units can only move during a movement phase';
  if (path.length < 2) return 'a move needs a destination';
  if (new Set(action.units).size !== action.units.length || action.units.length === 0) return 'select units to move';
  for (let i = 1; i < path.length; i++) {
    if (!space(path[i - 1]!).neighbors.includes(path[i]!)) return `${path[i - 1]} is not adjacent to ${path[i]}`;
  }
  const units: Unit[] = [];
  for (const id of action.units) {
    const u = state.units.find((x) => x.id === id);
    if (!u) return `no unit ${id}`;
    if (u.owner !== state.power) return 'you can only move your own units';
    if (u.at !== path[0]) return `unit ${id} is not in ${path[0]}`;
    units.push(u);
  }
  const from = space(path[0]!);
  const to = space(path[path.length - 1]!);
  const allLand = units.every((u) => isLand(u.type));
  const allSea = units.every((u) => isSea(u.type));
  const allAir = units.every((u) => isAir(u.type));
  if (units.some((u) => u.type === 'factory')) return 'industrial complexes cannot move';

  if (allLand && !from.water && to.water) {
    if (path.length !== 2) return 'land units load onto a transport in an adjacent sea zone';
    return planLoad(state, units, path[1]!, action.transport);
  }
  if (allLand && from.water) {
    if (path.length !== 2 || to.water) return 'cargo offloads into one adjacent territory';
    return planOffload(state, units, path[0]!, path[1]!);
  }
  if (allLand) return planLand(state, units, path, combat);
  if (allSea) return planSea(state, units, path, combat);
  if (allAir) return planAir(state, units, path, combat, action.sbr ?? false);
  return 'move land, sea and air units separately';
}

function commonChecks(state: GameState, u: Unit, combat: boolean): string | null {
  if (u.carriedBy !== null && !isAir(u.type)) return 'cargo moves with its transport';
  if (!combat && !isAir(u.type) && (u.movedInCombat || u.fought || u.retreated))
    return 'units that moved in combat or fought cannot make a noncombat move';
  if (isLand(u.type) && u.offloadedTo !== null) return 'units that offloaded this turn cannot move again';
  if (combat && u.type === 'aaGun') return 'antiaircraft artillery cannot move during combat move';
  return null;
}

function planLand(state: GameState, units: Unit[], path: SpaceId[], combat: boolean): Plan | string {
  const power = state.power;
  const steps = path.length - 1;
  for (const u of units) {
    const err = commonChecks(state, u, combat);
    if (err) return err;
    if (remainingMove(u) < steps) return `${u.type} does not have enough movement`;
    if (combat && u.moved > 0 && enemyDefendersAt(state, u.at, power).length > 0) return 'units that entered a battle must stop';
  }
  for (let i = 1; i < path.length; i++) {
    const s = path[i]!;
    if (space(s).water) return 'land units cannot enter sea zones';
    if (!isPassable(s)) return `${s} is neutral and impassable`;
    const last = i === path.length - 1;
    if (!combat) {
      if (!isFriendlyLand(state, s, power)) return 'noncombat moves must stay in friendly territory';
      continue;
    }
    if (last || isFriendlyLand(state, s, power)) continue;
    const blitzable = units.every((u) => u.type === 'armour') && enemyUnitsAt(state, s, power).length === 0;
    if (!blitzable) return `units must stop when entering hostile ${s}`;
  }
  return { kind: 'land', units };
}

function planSea(state: GameState, units: Unit[], path: SpaceId[], combat: boolean): Plan | string {
  const power = state.power;
  const steps = path.length - 1;
  for (const u of units) {
    const err = commonChecks(state, u, combat);
    if (err) return err;
    if (remainingMove(u) < steps) return `${u.type} does not have enough movement`;
    if (u.offloadedTo !== null) return 'a transport cannot move after offloading';
    if (combat && u.moved > 0 && isHostileSea(state, u.at, power) && u.type !== 'submarine')
      return 'units that entered a hostile sea zone must stop';
  }
  const allSubs = units.every((u) => u.type === 'submarine');
  for (let i = 1; i < path.length; i++) {
    const s = path[i]!;
    if (!space(s).water) return 'sea units cannot enter land';
    if (!seaPassageOpen(state, path[i - 1]!, s, power)) return `the passage into ${s} is closed`;
    const last = i === path.length - 1;
    if (allSubs) {
      if (!last && hasEnemyDestroyer(state, s, power)) return 'submarines must stop when entering a zone with an enemy destroyer';
      continue;
    }
    if (isHostileSea(state, s, power)) {
      if (!combat) return 'noncombat moves cannot enter hostile sea zones';
      if (!last) return `sea units must stop when entering hostile ${s}`;
    }
  }
  return { kind: 'sea', units };
}

function planAir(state: GameState, units: Unit[], path: SpaceId[], combat: boolean, sbr: boolean): Plan | string {
  const steps = path.length - 1;
  const dest = path[path.length - 1]!;
  for (const s of path.slice(1)) if (!isPassable(s)) return `air units cannot fly over neutral ${s}`;
  for (const u of units) {
    if (remainingMove(u) < steps) return `${u.type} does not have enough movement`;
    if (!combat && u.sbr && u.moved === 0) return 'bombers on a raid land during noncombat';
  }
  if (sbr) {
    if (!combat) return 'strategic bombing raids are declared during combat move';
    if (units.some((u) => u.type !== 'bomber')) return 'only bombers can raid industrial complexes';
    const f = factoryAt(state, dest);
    if (!f || areAllied(f.owner, state.power)) return 'raids must target an enemy industrial complex';
  }
  if (combat) {
    for (const u of units) {
      if (!airCanStillLand(state, u, dest, remainingMove(u) - steps))
        return `${u.type} would have no possible landing space after attacking ${dest}`;
    }
  } else {
    const ok = space(dest).water
      ? units.every((u) => u.type === 'fighter')
      : canLandAir(state, dest, state.power);
    if (!ok) return `air units cannot land in ${dest}`;
  }
  return { kind: 'air', units };
}

/** Can an air unit at `at` with `left` movement reach any safe landing, assuming every attack succeeds. */
export function airCanStillLand(state: GameState, u: Unit, at: SpaceId, left: number): boolean {
  const power = state.power;
  const reach = airDistances(at, left);
  for (const s of reach.keys()) if (canLandAir(state, s, power)) return true;
  if (u.type !== 'fighter') return false;
  for (const [s] of reach) {
    if (!space(s).water) continue;
    const carriers = state.units.filter((c) => c.type === 'carrier' && areAllied(c.owner, power));
    if (carriers.some((c) => c.at === s)) return true;
    for (const c of carriers) {
      if (c.owner !== power || c.movedInCombat || c.fought) continue;
      if (seaDistances(state, c.at, remainingMove(c), power).has(s)) return true;
    }
    if (state.purchases.some((p) => p.type === 'carrier' && p.count > 0)) {
      const nearOwnFactory = space(s).neighbors.some((n) => {
        const f = factoryAt(state, n);
        return f && f.owner === power && state.ownerAtTurnStart[n] === power && !state.capturedThisTurn.includes(n);
      });
      if (nearOwnFactory) return true;
    }
  }
  return false;
}

function planLoad(state: GameState, units: Unit[], zone: SpaceId, chosen: UnitId | undefined): Plan | string {
  const power = state.power;
  const combat = state.phase === 'combatMove';
  for (const u of units) {
    const err = commonChecks(state, u, combat);
    if (err) return err;
    if (u.moved > 0) return 'land units cannot move before loading';
  }
  if (isHostileSea(state, zone, power)) return 'transports cannot load in a hostile sea zone';
  const candidates = unitsAt(state, zone).filter(
    (t) =>
      t.type === 'transport' &&
      areAllied(t.owner, power) &&
      t.offloadedTo === null &&
      (chosen === undefined || t.id === chosen) &&
      !(t.owner === power && !combat && (t.movedInCombat || t.fought || t.retreated)),
  );
  if (candidates.length === 0) return 'no transport available to load';
  candidates.sort((a, b) => Number(b.owner === power) - Number(a.owner === power) || a.id - b.id);
  const load = new Map<UnitId, number>(candidates.map((t) => [t.id, 0]));
  const assignment = new Map<UnitId, UnitId>();
  const sorted = [...units].sort((a, b) => (STATS[b.type].transportCost ?? 0) - (STATS[a.type].transportCost ?? 0));
  for (const u of sorted) {
    const cost = STATS[u.type].transportCost ?? 99;
    const t = candidates.find((c) => transportHasRoom(state, c.id, (load.get(c.id) ?? 0) + cost));
    if (!t) return 'not enough transport capacity';
    load.set(t.id, (load.get(t.id) ?? 0) + cost);
    assignment.set(u.id, t.id);
  }
  return { kind: 'load', units, transports: assignment };
}

function planOffload(state: GameState, units: Unit[], zone: SpaceId, target: SpaceId): Plan | string {
  const power = state.power;
  const combat = state.phase === 'combatMove';
  if (!isPassable(target)) return `${target} is neutral and impassable`;
  const transports = new Set<UnitId>();
  for (const u of units) {
    if (u.carriedBy === null) return 'only cargo can offload';
    if (u.offloadedTo !== null) return 'cargo is already committed to an offload';
    const t = state.units.find((x) => x.id === u.carriedBy)!;
    if (t.owner !== power && u.loadedIn !== null) return 'cargo on an ally’s transport offloads on a later turn';
    if (t.offloadedTo !== null && t.offloadedTo !== target) return 'a transport can offload into only one territory per turn';
    if (t.retreated) return 'a transport that retreated cannot offload';
    if (t.owner === power && !combat && (t.movedInCombat || t.fought)) return 'this transport already acted in combat';
    transports.add(t.id);
  }
  if (combat) {
    if (!wasHostileAtTurnStart(state, target, power)) return 'combat offloads must be amphibious assaults on hostile territory';
  } else {
    if (isHostileSea(state, zone, power)) return 'transports cannot offload in a hostile sea zone';
    if (!isFriendlyLand(state, target, power)) return 'noncombat offloads must go to friendly territory';
  }
  return { kind: 'offload', units };
}

export function applyMove(draft: GameState, plan: Plan, action: MoveAction): void {
  const combat = draft.phase === 'combatMove';
  const power = draft.power;
  const path = action.path;
  const dest = path[path.length - 1]!;
  const steps = path.length - 1;
  switch (plan.kind) {
    case 'load':
      for (const u of plan.units) {
        u.at = dest;
        u.carriedBy = plan.transports!.get(u.id)!;
        u.moved = STATS[u.type].move;
        u.loadedIn = combat ? 'combatMove' : 'noncombatMove';
        u.movedInCombat ||= combat;
      }
      return;
    case 'offload': {
      for (const u of plan.units) {
        const t = draft.units.find((x) => x.id === u.carriedBy)!;
        t.offloadedTo = dest;
        u.offloadedTo = dest;
        u.moved = STATS[u.type].move;
        if (combat) {
          u.movedInCombat = true;
          t.movedInCombat = true;
        } else {
          u.at = dest;
          u.carriedBy = null;
        }
      }
      return;
    }
    case 'land':
      for (let i = 1; i < path.length; i++) {
        const s = path[i]!;
        const onlyInfrastructure = enemyUnitsAt(draft, s, power).every((u) => u.type === 'factory' || u.type === 'aaGun');
        if (combat && isHostileLand(draft, s, power) && onlyInfrastructure) {
          captureTerritory(draft, s, power);
          if (i < path.length - 1) for (const u of plan.units) u.blitzed = true;
        }
      }
      for (const u of plan.units) {
        u.cameFrom = path[path.length - 2]!;
        u.at = dest;
        u.moved += steps;
        u.movedInCombat ||= combat;
      }
      return;
    case 'sea': {
      boardWaitingFighters(draft, plan.units);
      const moving = new Set(plan.units.map((u) => u.id));
      for (const u of plan.units) {
        if (combat && u.moved === 0 && isHostileSea(draft, u.at, power)) u.escaped = true;
        u.cameFrom = path[path.length - 2]!;
        u.at = dest;
        u.moved += steps;
        u.movedInCombat ||= combat;
      }
      for (const c of draft.units) if (c.carriedBy !== null && moving.has(c.carriedBy)) c.at = dest;
      return;
    }
    case 'air':
      for (const u of plan.units) {
        u.carriedBy = null;
        u.cameFrom = path[path.length - 2]!;
        u.at = dest;
        u.moved += steps;
        u.movedInCombat ||= combat;
        if (action.sbr) u.sbr = true;
      }
      return;
  }
}

/** Fighters still aboard a carrier when it sails become its cargo; to fight they must take off first. */
function boardWaitingFighters(draft: GameState, ships: Unit[]): void {
  for (const c of ships) {
    if (c.type !== 'carrier') continue;
    let room = CARRIER_CAPACITY - draft.units.filter((u) => u.carriedBy === c.id).length;
    for (const f of draft.units) {
      if (room <= 0) break;
      if (f.at !== c.at || f.type !== 'fighter' || f.owner !== c.owner || f.moved > 0 || f.carriedBy !== null) continue;
      f.carriedBy = c.id;
      room -= 1;
    }
  }
}

/** Errors that block ending the combat move phase. */
export function combatMoveErrors(state: GameState): string[] {
  const power = state.power;
  const errors: string[] = [];
  const amphibZones = new Set(
    state.units.filter((u) => u.owner === power && u.carriedBy !== null && u.offloadedTo !== null).map((u) => u.at),
  );
  for (const u of state.units) {
    if (u.owner !== power || !u.movedInCombat) continue;
    if (u.carriedBy !== null && isLand(u.type)) {
      if (u.loadedIn === 'combatMove' && u.offloadedTo === null)
        errors.push(`${u.type} loaded in ${u.at} must make an amphibious assault`);
      continue;
    }
    const enemies = enemyUnitsAt(state, u.at, power);
    if (isLand(u.type)) {
      if (!wasHostileAtTurnStart(state, u.at, power) && !u.blitzed)
        errors.push(`${u.type} in ${u.at} cannot end a combat move in friendly territory`);
    } else if (isAir(u.type)) {
      const target = space(u.at).water ? enemies.length > 0 : wasHostileAtTurnStart(state, u.at, power);
      if (!target) errors.push(`${u.type} in ${u.at} must end its combat move in a space under attack`);
    } else if (enemies.length === 0 && !amphibZones.has(u.at) && !u.escaped) {
      errors.push(`${u.type} in ${u.at} must end its combat move in a sea zone with enemy units`);
    }
  }
  for (const zone of amphibZones) {
    const enemySubs = enemyUnitsAt(state, zone, power).some((u) => u.type === 'submarine');
    const surface = isHostileSea(state, zone, power);
    const warship = unitsAt(state, zone).some((u) => u.owner === power && isSea(u.type) && u.type !== 'transport');
    if (enemySubs && !surface && !warship)
      errors.push(`offloading in ${zone} past enemy submarines needs one of your warships there`);
  }
  for (const zone of new Set(state.units.filter((u) => u.owner === power && isSea(u.type)).map((u) => u.at))) {
    const mine = unitsAt(state, zone).filter((u) => u.owner === power && u.carriedBy === null);
    if (!isHostileSea(state, zone, power)) continue;
    const combatants = mine.filter((u) => STATS[u.type].attack > 0);
    if (combatants.length === 0 && mine.some((u) => u.type === 'transport' && u.movedInCombat))
      errors.push(`transports in ${zone} cannot attack without combat units`);
  }
  return errors;
}

/** Fighters of the moving power left in sea zones that no friendly carrier will cover. */
export function excessFightersAt(state: GameState, zone: SpaceId, power: Power): number {
  const here = unitsAt(state, zone).filter((u) => areAllied(u.owner, power));
  const slots = here.filter((u) => u.type === 'carrier').length * CARRIER_CAPACITY;
  return Math.max(0, here.filter((u) => u.type === 'fighter').length - slots);
}


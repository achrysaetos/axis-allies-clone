import { POWERS } from './types';
import type { Battle, GameState, HitCategory, HitGroup, PendingHits, Power, SpaceId, Unit, UnitId } from './types';
import { STATS, isAir, isLand, space } from './data';
import {
  areAllied,
  enemyUnitsAt,
  factoryAt,
  isFriendlyLand,
  isHostileSea,
  unitsAt,
  wasHostileAtTurnStart,
} from './queries';
import { assignable, autoCasualties, canTake, validateCasualties } from './casualties';
import { captureTerritory } from './capture';
import { roll } from './state';

const find = (s: GameState, id: UnitId) => s.units.find((u) => u.id === id);
const alive = (s: GameState, ids: UnitId[]) => ids.map((id) => find(s, id)).filter((u): u is Unit => u !== undefined);
const isCargo = (u: Unit) => u.carriedBy !== null && isLand(u.type);

export function createBattles(draft: GameState): void {
  const power = draft.power;
  const battles: Battle[] = [];
  const amphibCargo = draft.units.filter((u) => u.owner === power && isCargo(u) && u.offloadedTo !== null);
  const amphibSources = new Set(amphibCargo.map((u) => u.at));
  const amphibTargets = new Set(amphibCargo.map((u) => u.offloadedTo!));
  const add = (spaceId: SpaceId, kind: Battle['kind'], optional: boolean, tier: Battle['tier']) =>
    battles.push(newBattle(draft.battles.length + battles.length + 1, spaceId, kind, power, optional, tier));

  const occupied = new Set(draft.units.filter((u) => u.owner === power && !isCargo(u)).map((u) => u.at));
  for (const id of [...occupied].sort()) {
    const def = space(id);
    const mine = unitsAt(draft, id).filter((u) => u.owner === power && !isCargo(u));
    const enemies = enemyUnitsAt(draft, id, power).filter((u) => !isCargo(u));
    if (def.water) {
      if (enemies.length === 0) continue;
      if (!mine.some((u) => STATS[u.type].attack > 0)) continue;
      const surface = isHostileSea(draft, id, power);
      const onlyTransports = enemies.every((u) => u.type === 'transport');
      const movedWarship = mine.some((u) => u.movedInCombat && u.type !== 'transport');
      const optional = !surface && !(onlyTransports && movedWarship && !amphibSources.has(id));
      add(id, 'sea', optional, amphibSources.has(id) ? 1 : 2);
      continue;
    }
    const raiders = mine.filter((u) => u.sbr);
    if (raiders.length > 0) add(id, 'sbr', false, 0);
    const attackers = mine.filter((u) => !u.sbr && u.movedInCombat);
    const defenders = enemies.filter((u) => u.type !== 'factory');
    if (amphibTargets.has(id)) continue;
    if (attackers.length > 0 && defenders.length > 0 && wasHostileAtTurnStart(draft, id, power)) add(id, 'land', false, 2);
  }
  for (const id of [...amphibTargets].sort()) add(id, 'land', false, 1);
  draft.battles = [...draft.battles, ...battles];
}

function newBattle(id: number, at: SpaceId, kind: Battle['kind'], attacker: Power, optional: boolean, tier: Battle['tier']): Battle {
  return {
    id,
    space: at,
    kind,
    attacker,
    optional,
    tier,
    round: 0,
    step: 'start',
    attackers: [],
    defenders: [],
    seaborne: [],
    doomed: [],
    submerged: [],
    struck: [],
    origins: [],
    queue: [],
    dice: [],
    resolved: false,
    skipped: false,
    winner: null,
  };
}

export function battleBlocker(state: GameState, b: Battle): string | null {
  if (b.resolved) return 'battle already resolved';
  const open = state.battles.filter((x) => !x.resolved && x.id !== b.id);
  if (open.some((x) => x.tier < b.tier)) return 'resolve strategic bombing raids, then amphibious assaults, first';
  if (b.kind === 'land' && b.tier === 1) {
    const sources = new Set(
      state.units.filter((u) => u.owner === b.attacker && u.offloadedTo === b.space && isCargo(u)).map((u) => u.at),
    );
    if (open.some((x) => x.kind === 'sea' && sources.has(x.space))) return 'clear the sea zone before the landing';
  }
  return null;
}

function defendingPower(s: GameState, b: Battle): Power {
  const counts = new Map<Power, number>();
  for (const u of alive(s, b.defenders)) counts.set(u.owner, (counts.get(u.owner) ?? 0) + 1);
  const owner = s.owner[b.space];
  if (owner && counts.has(owner)) return owner;
  let best: Power | undefined;
  for (const p of POWERS) if ((counts.get(p) ?? 0) > (best ? counts.get(best)! : 0)) best = p;
  return best ?? POWERS.find((p) => !areAllied(p, b.attacker))!;
}

const liveAttackers = (s: GameState, b: Battle) => alive(s, b.attackers).filter((u) => !b.submerged.includes(u.id));
const liveDefenders = (s: GameState, b: Battle) => alive(s, b.defenders).filter((u) => !b.submerged.includes(u.id));

function removeUnits(s: GameState, ids: UnitId[]): void {
  const dead = new Set(ids);
  const attackerCarriers = new Set(
    s.units.filter((u) => dead.has(u.id) && u.owner === s.power && u.type === 'carrier').map((u) => u.id),
  );
  for (const u of s.units) {
    if (u.carriedBy === null || !dead.has(u.carriedBy)) continue;
    if (isLand(u.type) || attackerCarriers.has(u.carriedBy)) dead.add(u.id);
    else u.carriedBy = null;
  }
  s.units = s.units.filter((u) => !dead.has(u.id));
}

/** Apply hits to chosen units: a battleship absorbs its first hit; units with no hit points left are casualties. */
function takeHits(s: GameState, b: Battle, chosen: UnitId[], immediate: boolean): void {
  const dead: UnitId[] = [];
  for (const id of chosen) {
    const u = find(s, id)!;
    u.damage += 1;
    if (u.damage >= STATS[u.type].hitPoints) dead.push(id);
  }
  if (immediate) removeUnits(s, dead);
  else b.doomed.push(...dead);
}

function casualtyPool(s: GameState, b: Battle, side: 'attacker' | 'defender'): Unit[] {
  return side === 'attacker' ? liveAttackers(s, b) : liveDefenders(s, b).filter((u) => !b.doomed.includes(u.id));
}

function rollGroup(s: GameState, b: Battle, side: 'attacker' | 'defender', label: string, values: number[]): number {
  if (values.length === 0) return 0;
  const rolls = roll(s, values.length);
  const hits = rolls.filter((r, i) => r <= values[i]!).length;
  b.dice.push({ round: b.round, side, label, rolls, targets: values, hits });
  return hits;
}

function fire(s: GameState, b: Battle, side: 'attacker' | 'defender', firers: Unit[]): HitGroup[] {
  const friendlyDestroyer = (side === 'attacker' ? liveAttackers(s, b) : liveDefenders(s, b)).some(
    (u) => u.type === 'destroyer',
  );
  const infantrySupported =
    side === 'attacker'
      ? Math.min(
          firers.filter((u) => u.type === 'infantry').length,
          firers.filter((u) => u.type === 'artillery').length,
        )
      : 0;
  let supported = 0;
  const byCategory = new Map<HitCategory, number[]>();
  for (const u of firers) {
    let value = side === 'attacker' ? STATS[u.type].attack : STATS[u.type].defense;
    if (u.type === 'infantry' && supported < infantrySupported) {
      value += 1;
      supported += 1;
    }
    if (value <= 0) continue;
    const cat: HitCategory = u.type === 'submarine' ? 'notAir' : isAir(u.type) && !friendlyDestroyer ? 'notSub' : 'any';
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), value]);
  }
  const groups: HitGroup[] = [];
  for (const [category, values] of byCategory) {
    const hits = rollGroup(s, b, side, category, values);
    if (hits > 0) groups.push({ category, hits });
  }
  return groups;
}

function canHit(firers: Unit[], targets: Unit[], side: 'attacker' | 'defender', friendlyDestroyer: boolean): boolean {
  return firers.some((f) => {
    const value = side === 'attacker' ? STATS[f.type].attack : STATS[f.type].defense;
    if (value <= 0) return false;
    const cat: HitCategory = f.type === 'submarine' ? 'notAir' : isAir(f.type) && !friendlyDestroyer ? 'notSub' : 'any';
    return targets.some((t) => canTake(cat, t));
  });
}

export function retreatOptions(s: GameState, b: Battle): SpaceId[] {
  const att = liveAttackers(s, b);
  const movers = att.filter((u) => !isAir(u.type) && !b.seaborne.includes(u.id));
  if (movers.length > 0) {
    return b.origins.filter((o) =>
      space(o).water
        ? !isHostileSea(s, o, b.attacker) && !s.hostileSeaAtTurnStart.includes(o)
        : isFriendlyLand(s, o, b.attacker),
    );
  }
  if (att.some((u) => isAir(u.type))) return [b.space];
  return [];
}

function finish(s: GameState, b: Battle, winner: Battle['winner']): void {
  const att = liveAttackers(s, b);
  if (b.kind === 'land' && winner === 'attacker' && att.some((u) => isLand(u.type) && u.type !== 'aaGun') && s.owner[b.space] !== undefined)
    if (!areAllied(s.owner[b.space]!, b.attacker)) captureTerritory(s, b.space, b.attacker);
  for (const u of [...alive(s, b.attackers), ...alive(s, b.defenders)]) {
    u.fought = true;
    if (u.type === 'battleship') u.damage = 0;
  }
  b.winner = winner;
  b.resolved = true;
  b.step = 'done';
  s.activeBattle = null;
  const airOnly = b.kind === 'land' && winner === 'attacker' && !att.some((u) => isLand(u.type) && u.type !== 'aaGun');
  s.log.push(
    airOnly
      ? `${b.attacker} clears ${b.space} but has no land units left to take it`
      : winner === 'attacker'
      ? `${b.attacker} wins the battle for ${b.space}`
      : winner === 'defender'
        ? `${b.space} holds against ${b.attacker}`
        : `The battle for ${b.space} ends with no winner`,
  );
}

function trivialCasualties(pool: Unit[], q: PendingHits): UnitId[] | null {
  const need = assignable(q.groups, pool);
  if (need.total === 0) return [];
  const eligible = pool.filter((u) => q.groups.some((g) => canTake(g.category, u)));
  const slots = eligible.reduce((n, u) => n + STATS[u.type].hitPoints - u.damage, 0);
  const sameKind = eligible.every((u) => u.type === eligible[0]!.type && u.damage === eligible[0]!.damage);
  if (slots === need.total || sameKind) return autoCasualties(q.groups, pool);
  return null;
}

/** Run the active battle until it needs a decision or ends. */
export function advance(s: GameState): void {
  const b = s.battles.find((x) => x.id === s.activeBattle);
  if (!b) return;
  for (let guard = 0; guard < 10000; guard++) {
    if (s.pending) return;
    if (b.queue.length > 0) {
      const q = b.queue[0]!;
      const pool = casualtyPool(s, b, q.side);
      const forced = trivialCasualties(pool, q);
      if (forced) {
        b.queue.shift();
        takeHits(s, b, forced, q.immediate);
        continue;
      }
      s.pending = {
        kind: 'casualties',
        battle: b.id,
        power: q.side === 'attacker' ? b.attacker : defendingPower(s, b),
        side: q.side,
        groups: q.groups,
        immediate: q.immediate,
        reason: q.reason,
      };
      return;
    }
    if (b.step === 'done') return;
    step(s, b);
  }
  throw new Error('battle did not converge');
}

function step(s: GameState, b: Battle): void {
  switch (b.step) {
    case 'start':
      return start(s, b);
    case 'bombard': {
      b.step = 'aa';
      if (b.kind !== 'land' || b.seaborne.length === 0 || liveDefenders(s, b).length === 0) return;
      const ships = bombardShips(s, b);
      if (ships.length === 0) return;
      s.pending = { kind: 'bombard', battle: b.id, power: b.attacker, ships: ships.map((u) => u.id), max: Math.min(ships.length, b.seaborne.length) };
      return;
    }
    case 'aa': {
      b.step = 'roundStart';
      if (b.kind !== 'land' || !liveDefenders(s, b).some((u) => u.type !== 'aaGun')) return;
      const aa = liveDefenders(s, b).filter((u) => u.type === 'aaGun').length;
      const air = liveAttackers(s, b).filter((u) => isAir(u.type)).length;
      const shots = Math.min(aa * 3, air);
      const hits = rollGroup(s, b, 'defender', 'aa', Array(shots).fill(1));
      if (hits > 0) b.queue.push({ side: 'attacker', groups: [{ category: 'air', hits }], immediate: true, reason: 'aa' });
      return;
    }
    case 'roundStart': {
      if (checkEnd(s, b)) return;
      b.round += 1;
      b.struck = [];
      b.step = b.kind === 'sea' ? 'submergeAttacker' : 'attackerFire';
      return;
    }
    case 'submergeAttacker':
    case 'submergeDefender': {
      const side = b.step === 'submergeAttacker' ? 'attacker' : 'defender';
      b.step = side === 'attacker' ? 'submergeDefender' : 'subStrike';
      const subs = eligibleStrikers(s, b, side);
      if (subs.length > 0)
        s.pending = { kind: 'submerge', battle: b.id, power: side === 'attacker' ? b.attacker : defendingPower(s, b), side, subs: subs.map((u) => u.id) };
      return;
    }
    case 'subStrike': {
      b.step = 'attackerFire';
      const att = eligibleStrikers(s, b, 'attacker');
      const def = eligibleStrikers(s, b, 'defender');
      b.struck = [...att, ...def].map((u) => u.id);
      const aHits = rollGroup(s, b, 'attacker', 'surprise strike', att.map(() => STATS.submarine.attack));
      const dHits = rollGroup(s, b, 'defender', 'surprise strike', def.map(() => STATS.submarine.defense));
      if (aHits > 0) b.queue.push({ side: 'defender', groups: [{ category: 'notAir', hits: aHits }], immediate: true, reason: 'subStrike' });
      if (dHits > 0) b.queue.push({ side: 'attacker', groups: [{ category: 'notAir', hits: dHits }], immediate: true, reason: 'subStrike' });
      return;
    }
    case 'attackerFire': {
      b.step = 'defenderFire';
      const firers = liveAttackers(s, b).filter((u) => !b.struck.includes(u.id));
      const groups = fire(s, b, 'attacker', firers);
      if (groups.length > 0) b.queue.push({ side: 'defender', groups, immediate: false, reason: 'fire' });
      return;
    }
    case 'defenderFire': {
      b.step = 'removeCasualties';
      const firers = liveDefenders(s, b).filter((u) => !b.struck.includes(u.id));
      const groups = fire(s, b, 'defender', firers);
      if (groups.length > 0) b.queue.push({ side: 'attacker', groups, immediate: true, reason: 'fire' });
      return;
    }
    case 'removeCasualties':
      removeUnits(s, b.doomed);
      b.doomed = [];
      b.step = 'endRound';
      return;
    case 'endRound':
      if (checkEnd(s, b)) return;
      b.step = 'retreat';
      return;
    case 'retreat': {
      b.step = 'roundStart';
      const options = retreatOptions(s, b);
      if (options.length > 0) s.pending = { kind: 'retreat', battle: b.id, power: b.attacker, options };
      else if (liveAttackers(s, b).every((u) => u.type === 'transport')) {
        removeUnits(s, liveAttackers(s, b).map((u) => u.id));
      }
      return;
    }
    case 'airBattle':
    case 'interceptorsFire':
    case 'raid':
      return raidStep(s, b);
    case 'done':
      return;
  }
}

function start(s: GameState, b: Battle): void {
  const power = b.attacker;
  if (b.kind === 'sbr') return strategicBombing(s, b);
  if (b.kind === 'land') {
    for (const u of s.units) {
      if (u.owner !== power || !isCargo(u) || u.offloadedTo !== b.space) continue;
      const t = find(s, u.carriedBy!);
      if (t && t.at === u.at && !isHostileSea(s, u.at, power) && !t.retreated) {
        u.cameFrom = u.at;
        u.at = b.space;
        u.carriedBy = null;
        b.seaborne.push(u.id);
      } else u.offloadedTo = null;
    }
  }
  const here = unitsAt(s, b.space);
  b.attackers = here
    .filter((u) => u.owner === power && u.carriedBy === null && !u.sbr && (b.kind === 'sea' || u.movedInCombat || b.seaborne.includes(u.id)))
    .map((u) => u.id);
  b.defenders = here
    .filter((u) => !areAllied(u.owner, power) && u.type !== 'factory' && !isCargo(u) && !u.fought)
    .map((u) => u.id);
  b.origins = [
    ...new Set(
      alive(s, b.attackers)
        .filter((u) => !isAir(u.type) && !b.seaborne.includes(u.id) && u.cameFrom && u.cameFrom !== b.space)
        .map((u) => u.cameFrom!),
    ),
  ];
  if (b.attackers.length === 0) {
    finish(s, b, b.defenders.length > 0 ? 'defender' : 'none');
    return;
  }
  b.step = 'bombard';
}

function bombardShips(s: GameState, b: Battle): Unit[] {
  const sources = new Set(alive(s, b.seaborne).map((u) => u.cameFrom));
  return s.units.filter(
    (u) =>
      u.owner === b.attacker &&
      (u.type === 'battleship' || u.type === 'cruiser') &&
      sources.has(u.at) &&
      !u.fought &&
      !u.bombarded,
  );
}

function eligibleStrikers(s: GameState, b: Battle, side: 'attacker' | 'defender'): Unit[] {
  const own = side === 'attacker' ? liveAttackers(s, b) : liveDefenders(s, b);
  const other = side === 'attacker' ? liveDefenders(s, b) : liveAttackers(s, b);
  if (other.some((u) => u.type === 'destroyer')) return [];
  return own.filter((u) => u.type === 'submarine');
}

function strategicBombing(s: GameState, b: Battle): void {
  b.attackers = s.units.filter((u) => u.at === b.space && u.owner === b.attacker && u.sbr).map((u) => u.id);
  const factory = factoryAt(s, b.space);
  if (!factory || areAllied(factory.owner, b.attacker)) return finish(s, b, 'none');
  b.step = 'airBattle';
  if (!s.options.sbrEscortsInterceptors) return;
  const fighters = s.units.filter((u) => u.at === b.space && u.type === 'fighter' && !areAllied(u.owner, b.attacker) && !u.fought);
  if (fighters.length > 0) s.pending = { kind: 'intercept', battle: b.id, power: fighters[0]!.owner, fighters: fighters.map((u) => u.id) };
}

function raidStep(s: GameState, b: Battle): void {
  switch (b.step) {
    case 'airBattle': {
      b.step = 'interceptorsFire';
      if (b.defenders.length === 0) return;
      const hits = rollGroup(s, b, 'attacker', 'escort fire', liveAttackers(s, b).map(() => 1));
      if (hits > 0) b.queue.push({ side: 'defender', groups: [{ category: 'air', hits }], immediate: true, reason: 'fire' });
      return;
    }
    case 'interceptorsFire': {
      b.step = 'raid';
      const hits = rollGroup(s, b, 'defender', 'interceptor fire', liveDefenders(s, b).map(() => 2));
      if (hits > 0) b.queue.push({ side: 'attacker', groups: [{ category: 'air', hits }], immediate: true, reason: 'fire' });
      return;
    }
    case 'raid':
      return bomb(s, b);
  }
}

function bomb(s: GameState, b: Battle): void {
  const factory = factoryAt(s, b.space)!;
  for (const u of liveAttackers(s, b)) if (u.type === 'fighter') u.retreated = true;
  const bombers = liveAttackers(s, b).filter((u) => u.type === 'bomber');
  const aaRolls = roll(s, bombers.length);
  b.dice.push({ round: 0, side: 'defender', label: 'factory air defense', rolls: aaRolls, targets: aaRolls.map(() => 1), hits: aaRolls.filter((r) => r === 1).length });
  const shotDown = bombers.filter((_, i) => aaRolls[i] === 1).map((u) => u.id);
  removeUnits(s, shotDown);
  const survivors = bombers.length - shotDown.length;
  const dmgRolls = roll(s, survivors);
  const total = dmgRolls.reduce((a, c) => a + c, 0);
  const cap = 2 * space(b.space).ipc;
  const applied = Math.min(total, cap - factory.damage);
  factory.damage += applied;
  b.dice.push({ round: 0, side: 'attacker', label: 'bombing damage', rolls: dmgRolls, targets: [], hits: applied });
  s.log.push(`${b.attacker} bombs ${b.space} for ${applied} damage, losing ${shotDown.length} bomber${shotDown.length === 1 ? '' : 's'}`);
  finish(s, b, survivors > 0 ? 'attacker' : 'defender');
}

/** Condition A, defenseless transports and stalemates. Returns true once the battle has ended. */
function checkEnd(s: GameState, b: Battle): boolean {
  let att = liveAttackers(s, b);
  let def = liveDefenders(s, b);
  if (b.kind === 'land' && def.length > 0 && def.every((u) => u.type === 'aaGun') && att.length > 0) {
    removeUnits(s, def.map((u) => u.id));
    def = [];
  }
  const attDestroyer = att.some((u) => u.type === 'destroyer');
  const defDestroyer = def.some((u) => u.type === 'destroyer');
  if (b.kind === 'sea' && def.length > 0 && att.length > 0) {
    const defCombat = def.filter((u) => u.type !== 'transport');
    const attCombat = att.filter((u) => u.type !== 'transport');
    const attackerHitsCombat = canHit(att, defCombat, 'attacker', attDestroyer);
    const defenderHitsCombat = canHit(defCombat, attCombat, 'defender', defDestroyer);
    if (!attackerHitsCombat && !defenderHitsCombat) {
      const transports = def.filter((u) => u.type === 'transport');
      if (transports.length > 0 && canHit(att, transports, 'attacker', attDestroyer)) {
        removeUnits(s, transports.map((u) => u.id));
        def = liveDefenders(s, b);
      }
    }
  }
  att = liveAttackers(s, b);
  if (att.length === 0 || def.length === 0) {
    finish(s, b, def.length === 0 && att.length > 0 ? 'attacker' : def.length > 0 ? 'defender' : 'none');
    return true;
  }
  const attackerCanHit = canHit(att, def, 'attacker', attDestroyer);
  const defenderCanHit = canHit(def, att, 'defender', defDestroyer);
  if (!attackerCanHit && !defenderCanHit) {
    finish(s, b, 'none');
    return true;
  }
  return false;
}

export function applyDecision(s: GameState, action: { type: string } & Record<string, unknown>): string | null {
  const d = s.pending;
  if (!d) return 'nothing to decide';
  const b = 'battle' in d ? s.battles.find((x) => x.id === d.battle) : undefined;
  switch (d.kind) {
    case 'casualties': {
      if (action.type !== 'casualties') return 'choose casualties';
      const chosen = action.units as UnitId[];
      const pool = casualtyPool(s, b!, d.side);
      const err = validateCasualties(d.groups, pool, chosen);
      if (err) return err;
      b!.queue.shift();
      s.pending = null;
      takeHits(s, b!, chosen, d.immediate);
      return null;
    }
    case 'submerge': {
      if (action.type !== 'submerge') return 'choose which submarines submerge';
      const ids = action.units as UnitId[];
      if (ids.some((id) => !d.subs.includes(id))) return 'only eligible submarines can submerge';
      b!.submerged.push(...ids);
      s.pending = null;
      return null;
    }
    case 'retreat': {
      if (action.type !== 'retreat') return 'decide whether to retreat';
      const to = action.to as SpaceId | null;
      s.pending = null;
      if (to === null) return null;
      if (!d.options.includes(to)) return 'not a legal retreat destination';
      retreat(s, b!, to);
      return null;
    }
    case 'bombard': {
      if (action.type !== 'bombard') return 'choose bombarding ships';
      const ids = action.ships as UnitId[];
      if (ids.length > d.max || ids.some((id) => !d.ships.includes(id))) return `at most ${d.max} eligible ships may bombard`;
      s.pending = null;
      const ships = alive(s, ids);
      for (const u of ships) {
        u.bombarded = true;
        u.fought = true;
      }
      const hits = rollGroup(s, b!, 'attacker', 'bombardment', ships.map((u) => STATS[u.type].attack));
      if (hits > 0) b!.queue.push({ side: 'defender', groups: [{ category: 'any', hits }], immediate: false, reason: 'bombard' });
      return null;
    }
    case 'intercept': {
      if (action.type !== 'intercept') return 'choose interceptors';
      const ids = action.units as UnitId[];
      if (ids.some((id) => !d.fighters.includes(id))) return 'only fighters in the raided territory can intercept';
      b!.defenders = ids;
      s.pending = null;
      return null;
    }
    case 'landStranded':
      return 'stranded fighters are handled by the turn engine';
  }
}

function retreat(s: GameState, b: Battle, to: SpaceId): void {
  const att = liveAttackers(s, b);
  const leaving = att.filter((u) => !b.seaborne.includes(u.id));
  for (const u of leaving) {
    u.retreated = true;
    u.fought = true;
    if (isAir(u.type) || to === b.space) continue;
    u.at = to;
    if (u.type === 'battleship') u.damage = 0;
  }
  const moved = new Set(leaving.filter((u) => !isAir(u.type) && to !== b.space).map((u) => u.id));
  for (const c of s.units) {
    if (c.carriedBy !== null && moved.has(c.carriedBy)) {
      c.at = to;
      c.offloadedTo = null;
    }
  }
  b.attackers = b.attackers.filter((id) => !leaving.some((u) => u.id === id));
  s.log.push(`${b.attacker} retreats from ${b.space}`);
  if (liveAttackers(s, b).length === 0) finish(s, b, 'defender');
}


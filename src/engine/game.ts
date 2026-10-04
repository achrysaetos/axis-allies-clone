import { CAPITAL_OF, CARRIER_CAPACITY, STATS, VICTORY_THRESHOLD, isAir, isLand, isSea, space } from './data';
import { POWERS } from './types';
import type { Action, Decision, GameState, Power, Purchase, Result, SpaceId, Unit, UnitId, UnitType } from './types';
import {
  areAllied,
  canLandAir,
  capitalHeld,
  carrierRoom,
  factoryAt,
  income,
  unitsAt,
  victoryCities,
} from './queries';
import { applyMove, combatMoveErrors, planMove } from './movement';
import { advance, applyDecision, battleBlocker, createBattles } from './combat';
import { freshUnit } from './state';

const LOG_LIMIT = 300;

export function apply(state: GameState, action: Action): Result {
  if (state.winner) return { ok: false, error: 'the game is over' };
  const draft = structuredClone(state);
  const error = reduce(draft, action);
  if (error) return { ok: false, error };
  if (draft.log.length > LOG_LIMIT) draft.log = draft.log.slice(-LOG_LIMIT);
  return { ok: true, state: draft };
}

/** Who must act next: the pending decision's owner, or the power whose turn it is. */
export const actingPower = (s: GameState): Power => s.pending?.power ?? s.power;

function reduce(s: GameState, a: Action): string | null {
  if (s.pending) {
    if (s.pending.kind === 'landStranded') {
      if (a.type !== 'landStranded') return 'land the stranded fighters first';
      return landStranded(s, a.landings);
    }
    const err = applyDecision(s, a as Action & Record<string, unknown>);
    if (err) return err;
    advance(s);
    return null;
  }
  switch (a.type) {
    case 'buy':
      return buy(s, a.purchases);
    case 'repair':
      return repair(s, a.factory, a.amount);
    case 'move': {
      const plan = planMove(s, a);
      if (typeof plan === 'string') return plan;
      applyMove(s, plan, a);
      return null;
    }
    case 'endPhase':
      return endPhase(s);
    case 'startBattle': {
      if (s.phase !== 'combat') return 'not in the combat phase';
      const b = s.battles.find((x) => x.id === a.battle);
      if (!b) return 'no such battle';
      const block = battleBlocker(s, b);
      if (block) return block;
      s.activeBattle = b.id;
      advance(s);
      return null;
    }
    case 'skipBattle': {
      const b = s.battles.find((x) => x.id === a.battle);
      if (s.phase !== 'combat' || !b || b.resolved) return 'no such open battle';
      if (!b.optional) return 'this battle cannot be skipped';
      b.resolved = true;
      b.skipped = true;
      b.step = 'done';
      return null;
    }
    case 'place':
      return place(s, a.unitType, a.at, a.count);
    default:
      return `cannot ${a.type} now`;
  }
}

function eligibleFactories(s: GameState, power: Power): SpaceId[] {
  return s.units
    .filter(
      (u) =>
        u.type === 'factory' &&
        u.owner === power &&
        s.owner[u.at] === power &&
        s.ownerAtTurnStart[u.at] === power &&
        !s.capturedThisTurn.includes(u.at),
    )
    .map((u) => u.at);
}

const productionLeft = (s: GameState, at: SpaceId) => {
  const f = factoryAt(s, at);
  return f ? Math.max(0, space(at).ipc - f.damage - (s.placements[at] ?? 0)) : 0;
};

const costOf = (ps: Purchase[]) => ps.reduce((n, p) => n + STATS[p.type].cost * p.count, 0);

function buy(s: GameState, purchases: Purchase[]): string | null {
  if (s.phase !== 'purchase') return 'units are bought in the purchase phase';
  if (!capitalHeld(s, s.power)) return 'a power without its capital cannot buy units';
  if (purchases.some((p) => !Number.isInteger(p.count) || p.count < 0)) return 'invalid purchase count';
  const clean = purchases.filter((p) => p.count > 0);
  if (costOf(clean) > s.treasury[s.power]) return 'not enough IPCs';
  const factories = eligibleFactories(s, s.power);
  const capacity = factories.reduce((n, f) => n + productionLeft(s, f), 0);
  const coastal = factories
    .filter((f) => space(f).neighbors.some((n) => space(n).water))
    .reduce((n, f) => n + productionLeft(s, f), 0);
  const units = clean.filter((p) => p.type !== 'factory').reduce((n, p) => n + p.count, 0);
  const naval = clean.filter((p) => isSea(p.type)).reduce((n, p) => n + p.count, 0);
  if (units > capacity) return `your industrial complexes can mobilize only ${capacity} units`;
  if (naval > coastal) return `your coastal industrial complexes can mobilize only ${coastal} sea units`;
  s.purchases = clean;
  return null;
}

function repair(s: GameState, factory: UnitId, amount: number): string | null {
  if (s.phase !== 'purchase') return 'repairs happen in the purchase phase';
  const f = s.units.find((u) => u.id === factory);
  if (!f || f.type !== 'factory' || f.owner !== s.power) return 'not your industrial complex';
  if (!Number.isInteger(amount) || amount < 1 || amount > f.damage) return 'invalid repair amount';
  if (amount + costOf(s.purchases) > s.treasury[s.power]) return 'not enough IPCs';
  f.damage -= amount;
  s.treasury[s.power] -= amount;
  return null;
}

function endPhase(s: GameState): string | null {
  switch (s.phase) {
    case 'purchase':
      s.treasury[s.power] -= costOf(s.purchases);
      s.phase = 'combatMove';
      return null;
    case 'combatMove': {
      const errors = combatMoveErrors(s);
      if (errors.length > 0) return errors[0]!;
      createBattles(s);
      s.phase = 'combat';
      if (s.battles.every((b) => b.resolved)) enterNoncombat(s);
      return null;
    }
    case 'combat':
      if (s.battles.some((b) => !b.resolved)) return 'resolve every battle first';
      enterNoncombat(s);
      return null;
    case 'noncombatMove':
      s.phase = 'mobilize';
      return null;
    case 'mobilize':
      endTurn(s);
      return null;
  }
}

function enterNoncombat(s: GameState): void {
  s.phase = 'noncombatMove';
  s.pending = nextStranded(s);
}

/** Defending fighters whose carriers sank must land within one space before noncombat moves. */
function nextStranded(s: GameState): Decision | null {
  for (const zone of new Set(s.units.filter((u) => u.type === 'fighter' && space(u.at).water).map((u) => u.at))) {
    const enemySide = s.units.filter((u) => u.at === zone && !areAllied(u.owner, s.power));
    const fighters = enemySide.filter((u) => u.type === 'fighter').sort((a, b) => b.id - a.id);
    const excess = fighters.length - enemySide.filter((u) => u.type === 'carrier').length * CARRIER_CAPACITY;
    if (excess <= 0) continue;
    const stranded = fighters.slice(0, excess);
    const owner = POWERS.find((p) => stranded.some((f) => f.owner === p))!;
    const mine = stranded.filter((f) => f.owner === owner);
    const options: Record<UnitId, SpaceId[]> = {};
    for (const f of mine) options[f.id] = landingOptions(s, f);
    const doomed = mine.filter((f) => options[f.id]!.length === 0).map((f) => f.id);
    if (doomed.length > 0) {
      s.units = s.units.filter((u) => !doomed.includes(u.id));
      s.log.push(`${doomed.length} stranded ${owner} fighters are lost in ${zone}`);
      return nextStranded(s);
    }
    return { kind: 'landStranded', power: owner, fighters: mine.map((f) => f.id), options };
  }
  return null;
}

function landingOptions(s: GameState, f: Unit): SpaceId[] {
  return space(f.at).neighbors.filter((n) => {
    if (space(n).water) return carrierRoom(s, n, f.owner) > 0;
    const o = s.owner[n];
    return o !== undefined && areAllied(o, f.owner);
  });
}

function landStranded(s: GameState, landings: Record<UnitId, SpaceId | null>): string | null {
  const d = s.pending as Extract<Decision, { kind: 'landStranded' }>;
  for (const id of d.fighters) {
    const dest = landings[id] ?? null;
    if (dest !== null && !d.options[id]!.includes(dest)) return `fighter ${id} cannot land in ${dest}`;
  }
  for (const id of d.fighters) {
    const dest = landings[id] ?? null;
    const f = s.units.find((u) => u.id === id)!;
    if (dest === null || (space(dest).water && carrierRoom(s, dest, f.owner) <= 0)) {
      s.units = s.units.filter((u) => u.id !== id);
      continue;
    }
    f.at = dest;
    f.carriedBy = null;
  }
  s.pending = nextStranded(s);
  return null;
}

function place(s: GameState, type: UnitType, at: SpaceId, count: number): string | null {
  if (s.phase !== 'mobilize') return 'units are mobilized in the mobilize phase';
  const p = s.purchases.find((x) => x.type === type);
  if (!p || p.count < count || count < 1 || !Number.isInteger(count)) return `you have no ${type} to place`;
  const power = s.power;
  const factories = eligibleFactories(s, power);
  const def = space(at);
  if (type === 'factory') {
    if (count !== 1) return 'place one industrial complex at a time';
    if (def.water || def.ipc < 1) return 'industrial complexes need a territory worth at least 1 IPC';
    if (s.owner[at] !== power || s.ownerAtTurnStart[at] !== power || s.capturedThisTurn.includes(at))
      return 'industrial complexes go in territories you controlled since the start of the turn';
    if (factoryAt(s, at)) return 'only one industrial complex per territory';
  } else if (def.water) {
    if (isLand(type) || type === 'bomber') return `${type} cannot be placed at sea`;
    const sources = def.neighbors.filter((n) => factories.includes(n));
    const room = sources.reduce((n, f) => n + productionLeft(s, f), 0);
    if (room < count) return `no industrial complex next to ${at} can mobilize ${count} more units`;
    if (type === 'fighter') {
      const carriers = unitsAt(s, at).filter((u) => u.type === 'carrier' && u.owner === power).length;
      const fighters = unitsAt(s, at).filter((u) => u.type === 'fighter' && u.owner === power).length;
      if (carriers * CARRIER_CAPACITY - fighters < count) return 'new fighters need room on your own carriers';
    }
    let left = count;
    for (const f of [...sources].sort((a, b) => productionLeft(s, b) - productionLeft(s, a))) {
      const use = Math.min(left, productionLeft(s, f));
      s.placements[f] = (s.placements[f] ?? 0) + use;
      left -= use;
    }
  } else {
    if (isSea(type)) return 'sea units are placed in sea zones';
    if (!factories.includes(at)) return `you cannot mobilize units in ${at}`;
    if (productionLeft(s, at) < count) return `${at} can mobilize only ${productionLeft(s, at)} more units`;
    s.placements[at] = (s.placements[at] ?? 0) + count;
  }
  p.count -= count;
  s.purchases = s.purchases.filter((x) => x.count > 0);
  for (let i = 0; i < count; i++) s.units.push(freshUnit(s.nextUnitId++, type, power, at));
  return null;
}

/** Air units that end the turn without a legal landing are destroyed. */
function crashAir(s: GameState): void {
  const power = s.power;
  const dead = new Set<UnitId>();
  for (const u of s.units) {
    if (u.owner !== power || !isAir(u.type)) continue;
    if (!space(u.at).water) {
      if (!canLandAir(s, u.at, power)) dead.add(u.id);
    } else if (u.type === 'bomber') dead.add(u.id);
  }
  for (const zone of new Set(s.units.filter((u) => u.owner === power && u.type === 'fighter').map((u) => u.at))) {
    if (!space(zone).water) continue;
    const excess = -carrierRoom(s, zone, power);
    if (excess <= 0) continue;
    const mine = s.units.filter((u) => u.at === zone && u.owner === power && u.type === 'fighter');
    for (const f of mine.slice(0, excess)) dead.add(f.id);
  }
  if (dead.size > 0) s.log.push(`${dead.size} ${power} air units had nowhere to land and were lost`);
  s.units = s.units.filter((u) => !dead.has(u.id));
}

/** Guest fighters ride an ally's carrier as cargo until they fly off on their own turn. */
function bindGuestFighters(s: GameState): void {
  const power = s.power;
  for (const zone of new Set(s.units.filter((u) => u.owner === power && u.type === 'fighter').map((u) => u.at))) {
    if (!space(zone).water) continue;
    const here = unitsAt(s, zone);
    const mine = here.filter((u) => u.owner === power && u.type === 'fighter');
    for (const f of mine) f.carriedBy = null;
    let overflow = mine.length - here.filter((u) => u.owner === power && u.type === 'carrier').length * CARRIER_CAPACITY;
    for (const c of here.filter((u) => u.type === 'carrier' && u.owner !== power)) {
      const ownersFighters = here.filter((u) => u.type === 'fighter' && u.owner === c.owner && u.carriedBy === null).length;
      const ownersCarriers = here.filter((u) => u.type === 'carrier' && u.owner === c.owner);
      const freeOnOwner = ownersCarriers.length * CARRIER_CAPACITY - ownersFighters - here.filter((u) => u.carriedBy !== null && ownersCarriers.some((oc) => oc.id === u.carriedBy)).length;
      let free = Math.min(CARRIER_CAPACITY - here.filter((u) => u.carriedBy === c.id).length, freeOnOwner);
      for (const f of mine) {
        if (overflow <= 0 || free <= 0) break;
        if (f.carriedBy !== null) continue;
        f.carriedBy = c.id;
        overflow -= 1;
        free -= 1;
      }
    }
  }
}

function endTurn(s: GameState): void {
  const power = s.power;
  s.treasury[power] += costOf(s.purchases);
  s.purchases = [];
  crashAir(s);
  bindGuestFighters(s);
  if (capitalHeld(s, power)) {
    const gained = income(s, power);
    s.treasury[power] += gained;
    s.log.push(`${power} collects ${gained} IPCs`);
  } else s.log.push(`${power} cannot collect income without ${CAPITAL_OF[power]}`);

  if (power === 'Americans') {
    const t = VICTORY_THRESHOLD[s.options.victory];
    if (victoryCities(s, 'Axis') >= t.Axis) s.winner = 'Axis';
    else if (victoryCities(s, 'Allies') >= t.Allies) s.winner = 'Allies';
    if (s.winner) s.log.push(`${s.winner} win with ${victoryCities(s, s.winner)} victory cities`);
  }
  const next = POWERS[(POWERS.indexOf(power) + 1) % POWERS.length]!;
  if (next === 'Russians') s.round += 1;
  s.power = next;
  s.phase = 'purchase';
  startTurn(s);
}

function startTurn(s: GameState): void {
  s.ownerAtTurnStart = { ...s.owner };
  s.capturedThisTurn = [];
  s.battles = [];
  s.activeBattle = null;
  s.placements = {};
  for (const u of s.units) {
    u.moved = 0;
    u.turnStart = u.at;
    u.cameFrom = null;
    u.loadedIn = null;
    u.offloadedTo = null;
    u.movedInCombat = false;
    u.fought = false;
    u.bombarded = false;
    u.sbr = false;
    u.retreated = false;
    u.blitzed = false;
    u.escaped = false;
  }
}


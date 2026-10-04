import { STATS, isAir, isLand, space } from '../engine/data';
import { areAllied } from '../engine/queries';
import type { GameState, Power, SpaceId, Unit, UnitType } from '../engine/types';
import { airDist, landDist, seaDist, seaNeighbors } from './geo';

export interface Combatant {
  type: UnitType;
  damage: number;
}

export interface BattleSpec {
  kind: 'land' | 'sea';
  attackers: Combatant[];
  defenders: Combatant[];
  /** Attack values of ships bombarding before the first round of an amphibious assault. */
  bombard?: number[];
  trials?: number;
}

export interface Odds {
  /** Attacker clears the space (and, on land, has a land unit left to take it). */
  win: number;
  /** Expected IPC value the attacker / defender loses. */
  attLoss: number;
  defLoss: number;
}

type Category = 'any' | 'notAir' | 'notSub' | 'air';

interface Piece {
  type: UnitType;
  hp: number;
  rank: number;
}

const rankOf = (c: Combatant) => (c.type === 'transport' ? 1000 : STATS[c.type].cost + (c.type === 'carrier' ? 0.5 : 0));

const canTake = (cat: Category, t: UnitType) =>
  cat === 'any' || (cat === 'air' ? isAir(t) : cat === 'notAir' ? !isAir(t) : t !== 'submarine');

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 4294967296;
  };
}

const pieces = (cs: Combatant[]): Piece[] =>
  cs
    .filter((c) => c.type !== 'factory')
    .map((c) => ({ type: c.type, hp: STATS[c.type].hitPoints - c.damage, rank: rankOf(c) }))
    .sort((a, b) => a.rank - b.rank);

/** Take one hit of `cat`: an undamaged battleship soaks it first, then the cheapest eligible unit dies. */
function hit(side: Piece[], cat: Category): boolean {
  const soak = side.find((f) => f.hp > 1 && canTake(cat, f.type));
  const victim = soak ?? side.find((f) => f.hp > 0 && canTake(cat, f.type));
  if (!victim) return false;
  victim.hp -= 1;
  return true;
}

const live = (side: Piece[]) => side.filter((f) => f.hp > 0);

function category(f: Piece, friendlyDestroyer: boolean): Category {
  if (f.type === 'submarine') return 'notAir';
  if (isAir(f.type) && !friendlyDestroyer) return 'notSub';
  return 'any';
}

/** Hits by category for one volley. */
function volley(firers: Piece[], attacking: boolean, rand: () => number): Map<Category, number> {
  const destroyer = firers.some((f) => f.type === 'destroyer');
  let support = attacking ? Math.min(firers.filter((f) => f.type === 'artillery').length, firers.filter((f) => f.type === 'infantry').length) : 0;
  const out = new Map<Category, number>();
  for (const f of firers) {
    let v = attacking ? STATS[f.type].attack : STATS[f.type].defense;
    if (f.type === 'infantry' && support > 0) {
      v += 1;
      support -= 1;
    }
    if (v > 0 && rand() * 6 < v) {
      const c = category(f, destroyer);
      out.set(c, (out.get(c) ?? 0) + 1);
    }
  }
  return out;
}

function applyHits(side: Piece[], hits: Map<Category, number>): void {
  for (const cat of ['air', 'notAir', 'notSub', 'any'] as Category[]) for (let i = 0; i < (hits.get(cat) ?? 0); i++) hit(side, cat);
}

const canHitAny = (firers: Piece[], targets: Piece[], attacking: boolean) => {
  const destroyer = firers.some((f) => f.type === 'destroyer');
  return firers.some((f) => (attacking ? STATS[f.type].attack : STATS[f.type].defense) > 0 && targets.some((t) => canTake(category(f, destroyer), t.type)));
};

const lossValue = (start: Piece[], end: Piece[]) =>
  start.reduce((n, f, i) => n + (end[i]!.hp <= 0 ? STATS[f.type].cost : 0), 0);

/** Monte Carlo estimate of a battle fought to the end with cheapest-first casualties and no retreat. */
export function simulate(spec: BattleSpec): Odds {
  const trials = spec.trials ?? 120;
  const baseA = pieces(spec.attackers);
  const baseD = pieces(spec.defenders);
  const rand = rng(baseA.length * 7919 + baseD.length * 104729 + 17);
  let wins = 0;
  let attLoss = 0;
  let defLoss = 0;
  for (let t = 0; t < trials; t++) {
    const att = baseA.map((f) => ({ ...f }));
    const def = baseD.map((f) => ({ ...f }));
    fight(spec, att, def, rand);
    const a = live(att);
    const d = live(def);
    if (d.length === 0 && a.length > 0 && (spec.kind === 'sea' || a.some((f) => isLand(f.type)))) wins++;
    attLoss += lossValue(baseA, att);
    defLoss += lossValue(baseD, def);
  }
  return { win: wins / trials, attLoss: attLoss / trials, defLoss: defLoss / trials };
}

function fight(spec: BattleSpec, att: Piece[], def: Piece[], rand: () => number): void {
  if (spec.kind === 'land') {
    const d = live(def);
    if (d.length > 0 && d.some((f) => f.type !== 'aaGun')) {
      const shots = Math.min(3 * d.filter((f) => f.type === 'aaGun').length, att.filter((f) => isAir(f.type)).length);
      for (let i = 0; i < shots; i++) if (rand() * 6 < 1) hit(att, 'air');
    }
    let bombardHits = 0;
    for (const v of spec.bombard ?? []) if (rand() * 6 < v) bombardHits++;
    for (let i = 0; i < bombardHits; i++) hit(def, 'any');
  }
  for (let round = 0; round < 15; round++) {
    let a = live(att);
    let d = live(def);
    if (spec.kind === 'land' && d.length > 0 && d.every((f) => f.type === 'aaGun')) {
      for (const f of d) f.hp = 0;
      return;
    }
    if (spec.kind === 'sea' && a.length > 0 && d.length > 0) {
      const dCombat = d.filter((f) => f.type !== 'transport');
      if (!canHitAny(a, dCombat, true) && !canHitAny(dCombat, a, false) && canHitAny(a, d, true)) {
        for (const f of d) f.hp = 0;
        return;
      }
    }
    if (a.length === 0 || d.length === 0) return;
    if (!canHitAny(a, d, true) && !canHitAny(d, a, false)) return;
    let struck: Piece[] = [];
    if (spec.kind === 'sea') {
      const aSubs = d.some((f) => f.type === 'destroyer') ? [] : a.filter((f) => f.type === 'submarine');
      const dSubs = a.some((f) => f.type === 'destroyer') ? [] : d.filter((f) => f.type === 'submarine');
      struck = [...aSubs, ...dSubs];
      const aHits = aSubs.filter(() => rand() * 6 < STATS.submarine.attack).length;
      const dHits = dSubs.filter(() => rand() * 6 < STATS.submarine.defense).length;
      for (let i = 0; i < aHits; i++) hit(def, 'notAir');
      for (let i = 0; i < dHits; i++) hit(att, 'notAir');
      a = live(att);
      d = live(def);
    }
    const aHits = volley(a.filter((f) => !struck.includes(f)), true, rand);
    const dHits = volley(d.filter((f) => !struck.includes(f)), false, rand);
    applyHits(def, aHits);
    applyHits(att, dHits);
  }
}

export const asCombatants = (us: Unit[]): Combatant[] =>
  us.filter((u) => u.type !== 'factory').map((u) => ({ type: u.type, damage: u.damage }));

/** Enemy units of `power` that could plausibly attack `target` on their next turn. */
export function threatTo(s: GameState, target: SpaceId, power: Power): Unit[] {
  const coastZones = seaNeighbors(target);
  const out: Unit[] = [];
  for (const u of s.units) {
    if (areAllied(u.owner, power) || u.type === 'factory' || u.type === 'aaGun') continue;
    if (u.carriedBy !== null && isLand(u.type)) {
      const t = s.units.find((x) => x.id === u.carriedBy);
      if (t && coastZones.some((z) => seaDist(t.at, z) <= 2)) out.push(u);
      continue;
    }
    if (isLand(u.type)) {
      if (!space(u.at).water && landDist(u.at, target) <= STATS[u.type].move) out.push(u);
    } else if (isAir(u.type)) {
      if (airDist(u.at, target) <= (u.type === 'fighter' ? 3 : 4)) out.push(u);
    }
  }
  return out;
}

/** Probability that the strongest plausible enemy strike takes `target` from its current defenders. */
export function dangerAt(
  s: GameState,
  target: SpaceId,
  power: Power,
  extraDefenders: Combatant[] = [],
  keep: (u: Unit) => boolean = () => true,
): Odds {
  const attackers = asCombatants(threatTo(s, target, power));
  const defenders = [
    ...asCombatants(s.units.filter((u) => u.at === target && areAllied(u.owner, power) && u.carriedBy === null && keep(u))),
    ...extraDefenders,
  ];
  if (attackers.length === 0) return { win: 0, attLoss: 0, defLoss: 0 };
  return simulate({ kind: space(target).water ? 'sea' : 'land', attackers, defenders, trials: 80 });
}

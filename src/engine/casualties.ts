import { STATS, isAir } from './data';
import type { HitCategory, HitGroup, Unit, UnitId } from './types';

export function canTake(category: HitCategory, u: Unit): boolean {
  switch (category) {
    case 'any':
      return true;
    case 'air':
      return isAir(u.type);
    case 'notAir':
      return !isAir(u.type);
    case 'notSub':
      return u.type !== 'submarine';
  }
}

interface Slot {
  unit: Unit;
}

const hitsOf = (groups: HitGroup[]): HitCategory[] => groups.flatMap((g) => Array<HitCategory>(g.hits).fill(g.category));

const slotsOf = (units: Unit[]): Slot[] =>
  units.flatMap((u) => Array<Slot>(Math.max(0, STATS[u.type].hitPoints - u.damage)).fill({ unit: u }));

/** Maximum bipartite matching of hits to slots; returns hit index -> slot index. */
function match(hits: HitCategory[], slots: Slot[], seed: number[] = []): number[] {
  const slotOwner = new Array<number>(slots.length).fill(-1);
  const hitSlot = new Array<number>(hits.length).fill(-1);
  const tryHit = (h: number, seen: boolean[]): boolean => {
    for (let s = 0; s < slots.length; s++) {
      if (seen[s] || !canTake(hits[h]!, slots[s]!.unit)) continue;
      seen[s] = true;
      if (slotOwner[s] === -1 || tryHit(slotOwner[s]!, seen)) {
        slotOwner[s] = h;
        hitSlot[h] = s;
        return true;
      }
    }
    return false;
  };
  const order = [...seed, ...hits.map((_, i) => i).filter((i) => !seed.includes(i))];
  for (const h of order) tryHit(h, new Array<boolean>(slots.length).fill(false));
  return hitSlot;
}

const matched = (m: number[]) => m.filter((s) => s !== -1).length;

/** Most hits that can be assigned, and most that can land on non-transports. */
export function assignable(groups: HitGroup[], pool: Unit[]): { total: number; nonTransport: number } {
  const hits = hitsOf(groups);
  return {
    total: matched(match(hits, slotsOf(pool))),
    nonTransport: matched(match(hits, slotsOf(pool.filter((u) => u.type !== 'transport')))),
  };
}

/** A legal casualty list assigns the most hits possible, and transports only when nothing else can take them. */
export function validateCasualties(groups: HitGroup[], pool: Unit[], chosen: UnitId[]): string | null {
  const byId = new Map(pool.map((u) => [u.id, u]));
  const counts = new Map<UnitId, number>();
  for (const id of chosen) {
    const u = byId.get(id);
    if (!u) return `unit ${id} is not an eligible casualty`;
    const c = (counts.get(id) ?? 0) + 1;
    if (c > STATS[u.type].hitPoints - u.damage) return `unit ${id} cannot take ${c} hits`;
    counts.set(id, c);
  }
  const need = assignable(groups, pool);
  if (chosen.length !== need.total) return `must assign exactly ${need.total} hits`;
  const chosenSlots: Slot[] = chosen.map((id) => ({ unit: byId.get(id)! }));
  if (matched(match(hitsOf(groups), chosenSlots)) !== chosen.length) return 'casualties do not match the hits scored';
  const nonTransport = chosen.filter((id) => byId.get(id)!.type !== 'transport').length;
  if (nonTransport !== need.nonTransport) return 'transports can only be chosen when no other unit can take the hit';
  return null;
}

/** Cheapest legal casualties: first absorb with undamaged battleships, then the lowest cost units. */
export function autoCasualties(groups: HitGroup[], pool: Unit[]): UnitId[] {
  const rank = (u: Unit) => {
    if (u.type === 'battleship' && u.damage === 0) return -1;
    if (u.type === 'transport') return 1000;
    return STATS[u.type].cost + (u.type === 'carrier' ? 0.5 : 0);
  };
  const sorted = [...pool].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  const hits = hitsOf(groups);
  const nonT = slotsOf(sorted.filter((u) => u.type !== 'transport'));
  const hitOrder = hits
    .map((h, i) => [h, i] as const)
    .sort((a, b) => specificity(a[0]) - specificity(b[0]))
    .map(([, i]) => i);
  const first = match(hits, nonT, hitOrder);
  const chosen: UnitId[] = [];
  const unassigned: number[] = [];
  first.forEach((s, h) => (s === -1 ? unassigned.push(h) : chosen.push(nonT[s]!.unit.id)));
  const transports = sorted.filter((u) => u.type === 'transport');
  for (const h of unassigned) {
    const t = transports.find((u) => canTake(hits[h]!, u) && !chosen.includes(u.id));
    if (t) chosen.push(t.id);
  }
  return preferCheap(chosen, groups, pool, rank);
}

const specificity = (c: HitCategory) => ({ air: 0, notAir: 1, notSub: 2, any: 3 })[c];

/** Swap expensive picks for cheaper equivalents while the list stays legal. */
function preferCheap(chosen: UnitId[], groups: HitGroup[], pool: Unit[], rank: (u: Unit) => number): UnitId[] {
  const byId = new Map(pool.map((u) => [u.id, u]));
  const result = [...chosen];
  const candidates = [...pool].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  for (let i = 0; i < result.length; i++) {
    const current = byId.get(result[i]!)!;
    for (const c of candidates) {
      if (rank(c) >= rank(current)) break;
      const used = result.filter((id) => id === c.id).length;
      if (used >= STATS[c.type].hitPoints - c.damage) continue;
      const trial = [...result];
      trial[i] = c.id;
      if (validateCasualties(groups, pool, trial) === null) {
        result[i] = c.id;
        break;
      }
    }
  }
  return result;
}

import { STATS, space } from '../engine/data';
import { apply } from '../engine/game';
import { capitalHeld } from '../engine/queries';
import type { Action, GameState, Power, Purchase, UnitType } from '../engine/types';
import { mine, ownFactories, productionLeft } from './board';
import { dangerAt } from './eval';

interface Doctrine {
  /** Relative weights of land units bought after defense and navy. */
  land: Partial<Record<UnitType, number>>;
  /** Transports this power wants afloat to ferry troops. */
  transports: number;
  /** Fighters this power wants in total. */
  fighters: number;
}

const DOCTRINE: Record<Power, Doctrine> = {
  Russians: { land: { infantry: 6, artillery: 2, armour: 2 }, transports: 0, fighters: 2 },
  Germans: { land: { infantry: 5, artillery: 3, armour: 3 }, transports: 0, fighters: 6 },
  British: { land: { infantry: 4, artillery: 2, armour: 2 }, transports: 4, fighters: 5 },
  Japanese: { land: { infantry: 5, artillery: 2, armour: 2 }, transports: 5, fighters: 6 },
  Americans: { land: { infantry: 4, artillery: 2, armour: 2 }, transports: 6, fighters: 6 },
};

const MAX_TRANSPORTS_PER_TURN = 2;

/** Repair bombing damage, then buy: emergency infantry, transports and escorts, a fighter, then the land mix. */
export function purchaseAction(s: GameState): Action {
  const power = s.power;
  if (s.purchases.length > 0 || !capitalHeld(s, power)) return { type: 'endPhase' };
  const damaged = s.units.find((u) => u.type === 'factory' && u.owner === power && u.damage > 0);
  if (damaged && s.treasury[power] > 0) {
    const r: Action = { type: 'repair', factory: damaged.id, amount: Math.min(damaged.damage, s.treasury[power]) };
    if (apply(s, r).ok) return r;
  }
  const buy = shoppingList(s, power);
  return buy.length > 0 ? { type: 'buy', purchases: buy } : { type: 'endPhase' };
}

function shoppingList(s: GameState, power: Power): Purchase[] {
  const doctrine = DOCTRINE[power];
  const factories = ownFactories(s, power);
  let slots = factories.reduce((n, f) => n + productionLeft(s, f), 0);
  let seaSlots = factories
    .filter((f) => space(f).neighbors.some((n) => space(n).water))
    .reduce((n, f) => n + productionLeft(s, f), 0);
  let budget = s.treasury[power];
  const counts = new Map<UnitType, number>();
  const add = (t: UnitType, n = 1): boolean => {
    const naval = STATS[t].domain === 'sea';
    if (STATS[t].cost * n > budget || n > slots || (naval && n > seaSlots)) return false;
    counts.set(t, (counts.get(t) ?? 0) + n);
    budget -= STATS[t].cost * n;
    slots -= n;
    if (naval) seaSlots -= n;
    return true;
  };

  for (const f of factories) {
    let extra = 0;
    const room = productionLeft(s, f);
    while (extra < room && dangerAt(s, f, power, Array(extra).fill({ type: 'infantry', damage: 0 })).win > 0.25) {
      if (!add('infantry')) break;
      extra++;
    }
  }

  const own = mine(s, power);
  const transports = own.filter((u) => u.type === 'transport').length;
  const warships = own.filter((u) => ['destroyer', 'cruiser', 'battleship', 'carrier'].includes(u.type)).length;
  const wantedTransports = Math.min(MAX_TRANSPORTS_PER_TURN, doctrine.transports - transports);
  for (let i = 0; i < wantedTransports; i++) {
    // Transports only pay off with cargo to carry: keep enough budget for a load.
    if (budget < STATS.transport.cost + 7) break;
    add('transport');
  }
  if (doctrine.transports > 0 && warships < Math.ceil((transports + (counts.get('transport') ?? 0)) / 2) && budget >= 20)
    add('destroyer');

  const fighters = own.filter((u) => u.type === 'fighter').length;
  if (fighters < doctrine.fighters && budget >= 25) add('fighter');

  const weights = Object.entries(doctrine.land) as [UnitType, number][];
  const total = weights.reduce((n, [, w]) => n + w, 0);
  for (let guard = 0; guard < 40 && budget >= STATS.infantry.cost && slots > 0; guard++) {
    const bought = weights.reduce((n, [t]) => n + (counts.get(t) ?? 0), 0) + 1;
    const [type] = weights.reduce<[UnitType, number]>(
      (best, [t, w]) => {
        const deficit = (w / total) * bought - (counts.get(t) ?? 0);
        return deficit > best[1] ? [t, deficit] : best;
      },
      ['infantry', -Infinity],
    );
    if (!add(type) && !add('infantry')) break;
  }
  return [...counts].map(([type, count]) => ({ type, count }));
}

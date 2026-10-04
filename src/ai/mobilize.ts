import { STATS, space } from '../engine/data';
import { apply } from '../engine/game';
import { areAllied } from '../engine/queries';
import type { Action, GameState, SpaceId } from '../engine/types';
import { capitalOf, frontDistance, ownFactories, productionLeft } from './board';
import { dangerAt } from './eval';

/** Place ships where our fleet already is, then land units at threatened factories, else nearest the front. */
export function mobilizeAction(s: GameState): Action {
  const power = s.power;
  const factories = ownFactories(s, power).filter((f) => productionLeft(s, f) > 0);
  const order = [...s.purchases].sort((a, b) => Number(STATS[b.type].domain === 'sea') - Number(STATS[a.type].domain === 'sea'));
  for (const p of order) {
    const spots = STATS[p.type].domain === 'sea' ? seaSpots(s, factories) : landSpots(s, factories);
    for (const at of spots) {
      const room = STATS[p.type].domain === 'sea' ? p.count : Math.min(p.count, productionLeft(s, at));
      for (let n = room; n >= 1; n--) {
        const a: Action = { type: 'place', unitType: p.type, at, count: n };
        if (apply(s, a).ok) return a;
      }
    }
  }
  return { type: 'endPhase' };
}

function seaSpots(s: GameState, factories: SpaceId[]): SpaceId[] {
  const zones = [...new Set(factories.flatMap((f) => space(f).neighbors.filter((n) => space(n).water)))];
  const score = (z: SpaceId) =>
    s.units.filter((u) => u.at === z).reduce((n, u) => n + (areAllied(u.owner, s.power) ? (u.owner === s.power ? 3 : 1) : -100), 0);
  return zones.sort((a, b) => score(b) - score(a));
}

function landSpots(s: GameState, factories: SpaceId[]): SpaceId[] {
  const front = frontDistance(s, s.power);
  const scored = factories.map((f) => {
    const danger = dangerAt(s, f, s.power).win;
    const closeness = -(front.get(f) ?? 10);
    return { f, score: (danger > 0.2 ? 100 * danger : 0) + closeness + (f === capitalOf(s.power) ? 0.5 : 0) };
  });
  return scored.sort((a, b) => b.score - a.score).map((x) => x.f);
}

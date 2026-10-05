import { describe, expect, it } from 'vitest';
import { freshUnit } from '../src/engine/state';
import type { GameState, UnitType } from '../src/engine/types';
import { expectedDamage, forecasts } from '../src/ui/odds';
import { ids, move, scenario } from './helpers';
import type { Placement } from './helpers';

function landing(withBattleship: boolean): GameState {
  const s = scenario({
    power: 'British',
    units: [
      ['British', 'transport', '8 Sea Zone'],
      ['Germans', 'infantry', 'France', 2],
      ...(withBattleship ? [['British', 'battleship', '8 Sea Zone'] as Placement] : []),
    ],
  });
  const t = s.units.find((u) => u.type === 'transport')!;
  for (const type of ['infantry', 'armour'] as UnitType[]) {
    const u = freshUnit(s.nextUnitId++, type, 'British', '8 Sea Zone');
    u.carriedBy = t.id;
    s.units.push(u);
  }
  return move(
    s,
    [...ids(s, 'British', 'infantry', '8 Sea Zone'), ...ids(s, 'British', 'armour', '8 Sea Zone')],
    ['8 Sea Zone', 'France'],
  );
}

describe('attack forecasts', () => {
  it('forecast each committed attack, counting shore bombardment for landings', () => {
    const plain = forecasts(landing(false));
    const supported = forecasts(landing(true));
    expect(plain.map((f) => f.space)).toEqual(['France']);
    expect(supported[0]!.win).toBeGreaterThan(plain[0]!.win + 0.1);
  });

  it('an attack with planes and one tank counts on keeping the tank alive to take the space', () => {
    let s = scenario({
      units: [
        ['Germans', 'armour', 'West Russia', 2],
        ['Germans', 'fighter', 'West Russia', 4],
        ['Germans', 'bomber', 'West Russia'],
        ['Russians', 'infantry', 'Archangel'],
        ['Russians', 'artillery', 'Archangel'],
        ['Russians', 'fighter', 'Archangel'],
      ],
    });
    for (const t of ['armour', 'fighter', 'bomber'] as UnitType[])
      s = move(s, ids(s, 'Germans', t, 'West Russia'), ['West Russia', 'Archangel']);
    expect(forecasts(s).find((f) => f.space === 'Archangel')!.win).toBeGreaterThan(0.9);
  });

  it('a warship that fought at sea this turn adds no bombardment to the forecast', () => {
    const s = landing(true);
    for (const u of s.units) if (u.type === 'battleship') u.fought = true;
    expect(forecasts(s)[0]!.win).toBeCloseTo(forecasts(landing(false))[0]!.win, 6);
  });
});

describe('raid damage forecast', () => {
  it('averages capped damage per outcome rather than capping the average', () => {
    expect(expectedDamage(1, 100)).toBeCloseTo((5 / 6) * 3.5, 6);
    // One bomber against a cap of 4: rolls of 5 and 6 count as 4.
    expect(expectedDamage(1, 4)).toBeCloseTo((5 / 6) * ((1 + 2 + 3 + 4 + 4 + 4) / 6), 6);
    expect(expectedDamage(3, 4)).toBeLessThan(4);
  });
});

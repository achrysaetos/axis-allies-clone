import { describe, expect, it } from 'vitest';
import { freshUnit } from '../src/engine/state';
import type { GameState, UnitType } from '../src/engine/types';
import { forecasts } from '../src/ui/odds';
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
});

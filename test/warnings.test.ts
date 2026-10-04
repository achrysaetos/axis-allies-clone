import { describe, expect, it } from 'vitest';
import { endPhaseWarnings } from '../src/ui/warnings';
import { ids, move, ok, scenario } from './helpers';

describe('end of phase warnings', () => {
  it('warns when a plane would be lost for lack of a landing', () => {
    let s = scenario({ power: 'Germans', units: [['Germans', 'armour', 'West Russia'], ['Germans', 'fighter', 'West Russia']] });
    s = move(s, ids(s, 'Germans', 'fighter', 'West Russia'), ['West Russia', 'Caucasus']);
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    s = ok(s, { type: 'endPhase' });
    expect(endPhaseWarnings(s)).toEqual([expect.stringMatching(/^1 fighter in Caucasus has nowhere to land/)]);
    expect(endPhaseWarnings(ok(s, { type: 'endPhase' }))).toEqual([]);
    s = move(s, ids(s, 'Germans', 'fighter', 'Caucasus'), ['Caucasus', 'West Russia']);
    expect(endPhaseWarnings(s)).toEqual([]);
  });

  it('warns about unplaced units and an empty purchase', () => {
    const mob = scenario({ phase: 'mobilize', units: [['Germans', 'factory', 'Germany']] });
    mob.purchases = [{ type: 'infantry', count: 2 }];
    expect(endPhaseWarnings(mob)).toEqual([expect.stringMatching(/^2 units you bought are not placed/)]);
    const buy = scenario({ phase: 'purchase', units: [], treasury: { Germans: 12 } });
    expect(endPhaseWarnings(buy)).toEqual([expect.stringMatching(/12 IPCs will carry over/)]);
  });
});

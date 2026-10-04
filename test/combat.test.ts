import { describe, expect, it } from 'vitest';
import { validateCasualties } from '../src/engine/casualties';
import { capitalHeld, income } from '../src/engine/queries';
import { freshUnit } from '../src/engine/state';
import type { GameState, Power, SpaceId, UnitType } from '../src/engine/types';
import { autoResolve, count, fails, fight, ids, move, ok, scenario } from './helpers';

const battleIn = (s: GameState, space: SpaceId) => s.battles.find((b) => b.space === space)!;

function load(s: GameState, owner: Power, transportAt: SpaceId, cargo: UnitType[]): void {
  const t = s.units.find((u) => u.owner === owner && u.type === 'transport' && u.at === transportAt)!;
  for (const type of cargo) {
    const u = freshUnit(s.nextUnitId++, type, owner, transportAt);
    u.carriedBy = t.id;
    s.units.push(u);
  }
}

describe('general combat (p.16-19)', () => {
  it('artillery raises one attacking infantry to 2', () => {
    let s = scenario({
      units: [['Germans', 'infantry', 'West Russia', 2], ['Germans', 'artillery', 'West Russia'], ['Russians', 'infantry', 'Archangel']],
      dice: [2, 2, 6, 6],
    });
    s = move(s, [...ids(s, 'Germans', 'infantry', 'West Russia'), ...ids(s, 'Germans', 'artillery', 'West Russia')], ['West Russia', 'Archangel']);
    s = fight(s, 'Archangel');
    expect(battleIn(s, 'Archangel').dice[0]).toMatchObject({ side: 'attacker', rolls: [2, 2, 6], hits: 1 });
    expect(s.owner['Archangel']).toBe('Germans');
  });

  it('defending casualties fire back before they are removed', () => {
    let s = scenario({ units: [['Germans', 'armour', 'West Russia'], ['Russians', 'infantry', 'Archangel']], dice: [1, 2] });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Archangel']);
    s = fight(s, 'Archangel');
    expect(count(s, 'Germans', 'armour', 'Archangel')).toBe(0);
    expect(count(s, 'Russians', 'infantry', 'Archangel')).toBe(0);
    expect(s.owner['Archangel']).toBe('Russians');
    expect(battleIn(s, 'Archangel').winner).toBe('none');
  });

  it('antiaircraft fires min(3 per gun, attacking aircraft) shots that hit on 1', () => {
    const run = (guns: number) => {
      let s = scenario({
        units: [['Germans', 'fighter', 'West Russia', 5], ['Russians', 'infantry', 'Caucasus'], ['Russians', 'aaGun', 'Caucasus', guns]],
        dice: [1, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
      });
      s = move(s, ids(s, 'Germans', 'fighter', 'West Russia'), ['West Russia', 'Caucasus']);
      s = fight(s, 'Caucasus', { retreat: 'Caucasus' });
      return s;
    };
    const one = run(1);
    expect(battleIn(one, 'Caucasus').dice[0]).toMatchObject({ label: 'aa', hits: 1 });
    expect(battleIn(one, 'Caucasus').dice[0]!.rolls).toHaveLength(3);
    expect(count(one, 'Germans', 'fighter', 'Caucasus')).toBe(4);
    expect(battleIn(run(2), 'Caucasus').dice[0]!.rolls).toHaveLength(5);
  });

  it('antiaircraft alone in an attacked territory is destroyed without firing', () => {
    let s = scenario({ units: [['Germans', 'armour', 'West Russia'], ['Germans', 'fighter', 'West Russia'], ['Russians', 'aaGun', 'Caucasus']] });
    s = move(s, ids(s, 'Germans', 'fighter', 'West Russia'), ['West Russia', 'Caucasus']);
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    expect(count(s, 'Russians', 'aaGun', 'Caucasus')).toBe(0);
    expect(s.owner['Caucasus']).toBe('Germans');
  });

  it('battleships absorb one hit and are repaired after the battle', () => {
    let s = scenario({
      power: 'British',
      units: [['British', 'destroyer', '8 Sea Zone', 2], ['Germans', 'battleship', '13 Sea Zone']],
      dice: [1, 6, 6],
    });
    s = move(s, ids(s, 'British', 'destroyer', '8 Sea Zone'), ['8 Sea Zone', '13 Sea Zone']);
    s = fight(s, '13 Sea Zone', { retreat: '8 Sea Zone' });
    const bb = s.units.find((u) => u.type === 'battleship')!;
    expect(bb.damage).toBe(0);
    expect(count(s, 'British', 'destroyer', '8 Sea Zone')).toBe(2);
  });

  it('attackers retreat together to a space they came from; aircraft stay to land later', () => {
    let s = scenario({
      units: [['Germans', 'armour', 'West Russia'], ['Germans', 'fighter', 'West Russia'], ['Russians', 'infantry', 'Archangel', 3]],
      dice: [6, 6, 6, 6, 6],
    });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Archangel']);
    s = move(s, ids(s, 'Germans', 'fighter', 'West Russia'), ['West Russia', 'Archangel']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, 'Archangel').id });
    expect(s.pending).toMatchObject({ kind: 'retreat', options: ['West Russia'] });
    s = ok(s, { type: 'retreat', to: 'West Russia' });
    expect(count(s, 'Germans', 'armour', 'West Russia')).toBe(1);
    expect(count(s, 'Germans', 'fighter', 'Archangel')).toBe(1);
    expect(battleIn(s, 'Archangel').resolved).toBe(true);
  });
});

describe('sea combat and submarines (p.16-17, 29-30)', () => {
  it('submarine surprise strike casualties are removed before they can fire; transports are chosen last', () => {
    let s = scenario({
      units: [['Germans', 'submarine', '12 Sea Zone'], ['British', 'cruiser', '13 Sea Zone'], ['British', 'transport', '13 Sea Zone']],
      dice: [2],
    });
    s = move(s, ids(s, 'Germans', 'submarine', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
    s = fight(s, '13 Sea Zone');
    const b = battleIn(s, '13 Sea Zone');
    expect(b.dice).toHaveLength(1);
    expect(count(s, 'British', 'cruiser', '13 Sea Zone')).toBe(0);
    expect(count(s, 'British', 'transport', '13 Sea Zone')).toBe(0);
    expect(b.winner).toBe('attacker');
  });

  it('a destroyer cancels the surprise strike', () => {
    let s = scenario({
      units: [['Germans', 'submarine', '12 Sea Zone'], ['British', 'destroyer', '13 Sea Zone']],
      dice: [2, 6],
    });
    s = move(s, ids(s, 'Germans', 'submarine', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
    s = fight(s, '13 Sea Zone');
    const b = battleIn(s, '13 Sea Zone');
    expect(b.dice[0]).toMatchObject({ label: 'notAir', rolls: [2] });
    expect(b.dice[1]).toMatchObject({ side: 'defender', rolls: [6] });
  });

  it('submarines can submerge instead of fighting', () => {
    let s = scenario({ power: 'British', units: [['British', 'cruiser', '12 Sea Zone'], ['Germans', 'submarine', '13 Sea Zone']] });
    s = move(s, ids(s, 'British', 'cruiser', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    const b = battleIn(s, '13 Sea Zone');
    expect(b.optional).toBe(true);
    s = ok(s, { type: 'startBattle', battle: b.id });
    expect(s.pending).toMatchObject({ kind: 'submerge', side: 'defender' });
    s = autoResolve(s, { submerge: true });
    expect(battleIn(s, '13 Sea Zone').resolved).toBe(true);
    expect(count(s, 'Germans', 'submarine', '13 Sea Zone')).toBe(1);
  });

  it('aircraft cannot hit submarines without a friendly destroyer, so the battle stalls', () => {
    let s = scenario({ power: 'British', units: [['British', 'fighter', 'United Kingdom'], ['Germans', 'submarine', '6 Sea Zone']] });
    s = move(s, ids(s, 'British', 'fighter', 'United Kingdom'), ['United Kingdom', '6 Sea Zone']);
    s = fight(s, '6 Sea Zone');
    expect(battleIn(s, '6 Sea Zone').winner).toBe('none');
    expect(count(s, 'Germans', 'submarine', '6 Sea Zone')).toBe(1);
  });

  it('defenseless transports are destroyed outright', () => {
    let s = scenario({ power: 'British', units: [['British', 'fighter', 'United Kingdom'], ['Germans', 'transport', '6 Sea Zone', 3]] });
    s = move(s, ids(s, 'British', 'fighter', 'United Kingdom'), ['United Kingdom', '6 Sea Zone']);
    s = fight(s, '6 Sea Zone');
    expect(count(s, 'Germans', 'transport', '6 Sea Zone')).toBe(0);
    expect(battleIn(s, '6 Sea Zone').dice).toHaveLength(0);
  });
});

describe('casualty selection (p.17)', () => {
  const s = scenario({ units: [['British', 'destroyer', '13 Sea Zone'], ['British', 'carrier', '13 Sea Zone'], ['British', 'fighter', '13 Sea Zone'], ['British', 'transport', '13 Sea Zone']] });
  const pool = s.units;
  const [destroyer, carrier, fighter, transport] = pool.map((u) => u.id) as [number, number, number, number];

  it('as many hits as possible must be assigned', () => {
    const groups = [{ category: 'any' as const, hits: 1 }, { category: 'notAir' as const, hits: 2 }];
    expect(validateCasualties(groups, pool, [fighter, destroyer, carrier])).toBeNull();
    expect(validateCasualties(groups, pool, [destroyer, carrier, transport])).toMatch(/transports/);
    expect(validateCasualties(groups, pool, [destroyer, carrier])).toMatch(/exactly 3/);
  });

  it('transports are only chosen when no other unit can take the hit', () => {
    expect(validateCasualties([{ category: 'any', hits: 1 }], pool, [transport])).toMatch(/transports/);
    expect(validateCasualties([{ category: 'notAir', hits: 3 }], pool, [destroyer, carrier, transport])).toBeNull();
  });
});

describe('capture, liberation and capitals (p.18-19)', () => {
  it('capturing a capital takes the treasury and stops the owner buying and collecting income', () => {
    let s = scenario({ units: [['Germans', 'armour', 'West Russia']], treasury: { Russians: 18, Germans: 0 } });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Russia']);
    expect(s.treasury.Germans).toBe(18);
    expect(s.treasury.Russians).toBe(0);
    expect(capitalHeld(s, 'Russians')).toBe(false);
    s.power = 'Russians';
    s.phase = 'purchase';
    fails(s, { type: 'buy', purchases: [{ type: 'infantry', count: 1 }] }, /capital/);
  });

  it('liberating an ally’s territory returns it to the original controller', () => {
    let s = scenario({ power: 'British', owners: { Persia: 'British', Caucasus: 'Germans' }, units: [['British', 'armour', 'Persia']] });
    s = move(s, ids(s, 'British', 'armour', 'Persia'), ['Persia', 'Caucasus']);
    expect(s.owner['Caucasus']).toBe('Russians');
  });

  it('if the ally’s capital is held by the enemy, the liberator keeps the territory', () => {
    let s = scenario({ power: 'British', owners: { Caucasus: 'Germans', Russia: 'Germans' }, units: [['British', 'armour', 'Persia']] });
    s = move(s, ids(s, 'British', 'armour', 'Persia'), ['Persia', 'Caucasus']);
    expect(s.owner['Caucasus']).toBe('British');
  });

  it('liberating a capital returns that power’s territories held by friends', () => {
    let s = scenario({ power: 'British', owners: { Caucasus: 'British', Russia: 'Germans' }, units: [['British', 'armour', 'Caucasus']] });
    s = move(s, ids(s, 'British', 'armour', 'Caucasus'), ['Caucasus', 'Russia']);
    expect(s.owner['Russia']).toBe('Russians');
    expect(s.owner['Caucasus']).toBe('Russians');
  });
});

describe('strategic bombing (p.14, 25, 27)', () => {
  it('the complex fires at each bomber; damage caps at twice the territory value', () => {
    let s = scenario({ power: 'British', units: [['British', 'bomber', 'United Kingdom', 3], ['Germans', 'factory', 'Germany']], dice: [1, 6, 6, 6, 6] });
    s.units.find((u) => u.type === 'factory')!.damage = 10;
    s = move(s, ids(s, 'British', 'bomber', 'United Kingdom'), ['United Kingdom', '6 Sea Zone', '5 Sea Zone', 'Germany'], { sbr: true });
    s = fight(s, 'Germany');
    expect(count(s, 'British', 'bomber', 'Germany')).toBe(2);
    expect(s.units.find((u) => u.type === 'factory')!.damage).toBe(20);
  });

  it('a damaged complex mobilizes fewer units and repairs cost 1 IPC each', () => {
    let s = scenario({ phase: 'purchase', units: [['Germans', 'factory', 'Germany']], treasury: { Germans: 30 } });
    const f = s.units[0]!;
    f.damage = 8;
    fails(s, { type: 'buy', purchases: [{ type: 'infantry', count: 3 }] }, /only 2/);
    s = ok(s, { type: 'repair', factory: f.id, amount: 3 });
    expect(s.treasury.Germans).toBe(27);
    ok(s, { type: 'buy', purchases: [{ type: 'infantry', count: 5 }] });
  });
});

describe('amphibious assaults (p.13-15)', () => {
  function assault(extraDefenders: [Power, UnitType, SpaceId][] = [], dice: number[] = []) {
    const s = scenario({
      power: 'British',
      units: [
        ['British', 'transport', '8 Sea Zone'],
        ['British', 'battleship', '8 Sea Zone'],
        ['British', 'cruiser', '8 Sea Zone'],
        ['Germans', 'infantry', 'France'],
        ...extraDefenders,
      ],
      dice,
    });
    load(s, 'British', '8 Sea Zone', ['infantry']);
    return move(s, ids(s, 'British', 'infantry', '8 Sea Zone'), ['8 Sea Zone', 'France']);
  }

  it('bombardment is limited to one ship per seaborne land unit and its casualties still fire', () => {
    let s = assault([], [4, 1, 1]);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, 'France').id });
    expect(s.pending).toMatchObject({ kind: 'bombard', max: 1 });
    fails(s, { type: 'bombard', ships: (s.pending as { ships: number[] }).ships });
    s = autoResolve(s);
    const b = battleIn(s, 'France');
    expect(b.dice.map((d) => d.label)).toEqual(['bombardment', 'any', 'any']);
    expect(count(s, 'British', 'infantry', 'France')).toBe(0);
    expect(s.owner['France']).toBe('Germans');
  });

  it('a defended sea zone must be cleared first, and then ships there cannot bombard', () => {
    let s = assault([['Germans', 'destroyer', '8 Sea Zone']], [1, 6, 6]);
    s = ok(s, { type: 'endPhase' });
    const land = battleIn(s, 'France');
    fails(s, { type: 'startBattle', battle: land.id }, /sea zone/);
    s = ok(s, { type: 'startBattle', battle: battleIn(s, '8 Sea Zone').id });
    s = autoResolve(s);
    s.scriptedDice = [1, 6];
    s = ok(s, { type: 'startBattle', battle: land.id });
    s = autoResolve(s);
    expect(battleIn(s, 'France').dice[0]!.label).not.toBe('bombardment');
    expect(s.owner['France']).toBe('British');
  });

  it('seaborne units cannot retreat', () => {
    let s = assault([['Germans', 'infantry', 'France']], [6, 6, 6, 6]);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, 'France').id });
    s = ok(s, { type: 'bombard', ships: [] });
    expect(s.pending?.kind).not.toBe('retreat');
  });
});

describe('mobilization and income (p.22-23)', () => {
  it('units appear only at complexes held since the start of the turn, within production', () => {
    let s = scenario({ phase: 'purchase', units: [['Germans', 'factory', 'Italy'], ['Germans', 'factory', 'Germany']], treasury: { Germans: 100 } });
    s = ok(s, { type: 'buy', purchases: [{ type: 'infantry', count: 4 }, { type: 'destroyer', count: 1 }] });
    s.phase = 'mobilize';
    fails(s, { type: 'place', unitType: 'infantry', at: 'Italy', count: 4 }, /only 3/);
    s = ok(s, { type: 'place', unitType: 'infantry', at: 'Italy', count: 2 });
    fails(s, { type: 'place', unitType: 'destroyer', at: 'Italy', count: 1 }, /sea zones/);
    s = ok(s, { type: 'place', unitType: 'destroyer', at: '15 Sea Zone', count: 1 });
    fails(s, { type: 'place', unitType: 'infantry', at: 'Italy', count: 1 }, /only 0/);
    s = ok(s, { type: 'place', unitType: 'infantry', at: 'Germany', count: 2 });
    expect(count(s, 'Germans', 'infantry', 'Italy')).toBe(2);
    expect(count(s, 'Germans', 'destroyer', '15 Sea Zone')).toBe(1);
  });

  it('a captured complex cannot be used until next turn', () => {
    let s = scenario({ units: [['Germans', 'armour', 'West Russia'], ['Russians', 'factory', 'Caucasus']] });
    s.purchases = [{ type: 'infantry', count: 1 }];
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    expect(s.units.find((u) => u.type === 'factory')!.owner).toBe('Germans');
    s = ok(ok(s, { type: 'endPhase' }), { type: 'endPhase' });
    fails(s, { type: 'place', unitType: 'infantry', at: 'Caucasus', count: 1 });
  });

  it('new fighters may launch from an own carrier next to a complex', () => {
    let s = scenario({ phase: 'mobilize', units: [['Germans', 'factory', 'Italy'], ['Germans', 'carrier', '15 Sea Zone']] });
    s.purchases = [{ type: 'fighter', count: 3 }];
    s = ok(s, { type: 'place', unitType: 'fighter', at: '15 Sea Zone', count: 2 });
    fails(s, { type: 'place', unitType: 'fighter', at: '15 Sea Zone', count: 1 }, /carriers/);
  });

  it('income is collected at the end of the turn', () => {
    let s = scenario({ phase: 'mobilize', treasury: { Germans: 0 }, units: [] });
    s = ok(s, { type: 'endPhase' });
    expect(s.treasury.Germans).toBe(income(s, 'Germans'));
    expect(s.power).toBe('British');
  });
});

describe('victory (p.6 errata)', () => {
  it('the Axis win holding 9 victory cities after the US turn', () => {
    const s = scenario({ power: 'Americans', phase: 'mobilize', owners: { Russia: 'Germans', 'Karelia S.S.R.': 'Germans', India: 'Japanese' }, units: [] });
    expect(ok(s, { type: 'endPhase' }).winner).toBe('Axis');
  });

  it('the check happens only after the US turn', () => {
    const s = scenario({ power: 'Japanese', phase: 'mobilize', owners: { Russia: 'Germans', 'Karelia S.S.R.': 'Germans', India: 'Japanese' }, units: [] });
    expect(ok(s, { type: 'endPhase' }).winner).toBeNull();
  });

  it('the Allies need 10', () => {
    const nine = scenario({ power: 'Americans', phase: 'mobilize', owners: { France: 'British', Italy: 'British' }, units: [] });
    expect(ok(nine, { type: 'endPhase' }).winner).toBeNull();
    const ten = scenario({ power: 'Americans', phase: 'mobilize', owners: { France: 'British', Italy: 'British', Germany: 'Russians' }, units: [] });
    expect(ok(ten, { type: 'endPhase' }).winner).toBe('Allies');
  });
});

describe('stranded fighters (p.21, 27)', () => {
  it('defending fighters whose carrier sank land within one space', () => {
    let s = scenario({
      units: [['Germans', 'battleship', '5 Sea Zone', 3], ['British', 'carrier', '6 Sea Zone'], ['British', 'fighter', '6 Sea Zone', 2]],
      dice: [1, 6, 6, 6, 6, 6],
    });
    s = move(s, ids(s, 'Germans', 'battleship', '5 Sea Zone'), ['5 Sea Zone', '6 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, '6 Sea Zone').id });
    s = ok(s, { type: 'casualties', units: ids(s, 'British', 'carrier', '6 Sea Zone') });
    s = autoResolve(s, { retreat: '5 Sea Zone' });
    s = ok(s, { type: 'endPhase' });
    expect(s.pending).toMatchObject({ kind: 'landStranded', power: 'British' });
    s = autoResolve(s);
    expect(count(s, 'British', 'fighter', 'United Kingdom')).toBe(2);
  });
});

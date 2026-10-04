import { describe, expect, it } from 'vitest';
import { count, fails, ids, move, ok, scenario } from './helpers';

describe('land movement (p.10-13)', () => {
  it('land units stop when they enter a hostile territory', () => {
    const s = scenario({ power: 'Germans', units: [['Germans', 'armour', 'West Russia'], ['Russians', 'infantry', 'Archangel']] });
    const tank = ids(s, 'Germans', 'armour', 'West Russia');
    fails(s, { type: 'move', units: tank, path: ['West Russia', 'Archangel', 'Vologda'] }, /stop/);
    move(s, tank, ['West Russia', 'Archangel']);
  });

  it('infantry move one space', () => {
    const s = scenario({ power: 'Germans', units: [['Germans', 'infantry', 'Germany']] });
    fails(s, { type: 'move', units: ids(s, 'Germans', 'infantry', 'Germany'), path: ['Germany', 'Poland', 'Belorussia'] }, /movement/);
  });

  it('tanks blitz through an empty hostile territory and capture it', () => {
    const s = scenario({ power: 'Germans', units: [['Germans', 'armour', 'West Russia']] });
    const after = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus', 'Kazakh S.S.R.']);
    expect(after.owner['Caucasus']).toBe('Germans');
    expect(after.owner['Kazakh S.S.R.']).toBe('Germans');
    expect(after.capturedThisTurn).toEqual(['Caucasus', 'Kazakh S.S.R.']);
    ok(after, { type: 'endPhase' });
  });

  it('tanks cannot blitz through antiaircraft artillery or an industrial complex', () => {
    const aa = scenario({ power: 'Germans', units: [['Germans', 'armour', 'West Russia'], ['Russians', 'aaGun', 'Caucasus']] });
    fails(aa, { type: 'move', units: ids(aa, 'Germans', 'armour', 'West Russia'), path: ['West Russia', 'Caucasus', 'Kazakh S.S.R.'] }, /stop/);
    const ic = scenario({ power: 'Germans', units: [['Germans', 'armour', 'West Russia'], ['Russians', 'factory', 'Caucasus']] });
    fails(ic, { type: 'move', units: ids(ic, 'Germans', 'armour', 'West Russia'), path: ['West Russia', 'Caucasus', 'Kazakh S.S.R.'] }, /stop/);
  });

  it('neutral territories are impassable to land and air units', () => {
    const s = scenario({ power: 'Germans', units: [['Germans', 'armour', 'Bulgaria Romania'], ['Germans', 'fighter', 'Bulgaria Romania']] });
    fails(s, { type: 'move', units: ids(s, 'Germans', 'armour', 'Bulgaria Romania'), path: ['Bulgaria Romania', 'Turkey'] }, /neutral/);
    fails(s, { type: 'move', units: ids(s, 'Germans', 'fighter', 'Bulgaria Romania'), path: ['Bulgaria Romania', 'Turkey', 'Trans-Jordan'] }, /neutral/);
  });

  it('antiaircraft artillery cannot move during combat move', () => {
    const s = scenario({ power: 'Germans', units: [['Germans', 'aaGun', 'Germany']] });
    fails(s, { type: 'move', units: ids(s, 'Germans', 'aaGun', 'Germany'), path: ['Germany', 'Poland'] }, /antiaircraft/);
  });

  it('combat moves must end in a hostile space', () => {
    const s = scenario({ power: 'Germans', units: [['Germans', 'infantry', 'Germany']] });
    const after = move(s, ids(s, 'Germans', 'infantry', 'Germany'), ['Germany', 'Poland']);
    fails(after, { type: 'endPhase' }, /friendly territory/);
  });

  it('noncombat moves stay in friendly territory and exclude units that moved in combat', () => {
    let s = scenario({ power: 'Germans', units: [['Germans', 'armour', 'West Russia'], ['Germans', 'infantry', 'West Russia']] });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    s = ok(s, { type: 'endPhase' });
    expect(s.phase).toBe('noncombatMove');
    fails(s, { type: 'move', units: ids(s, 'Germans', 'armour', 'Caucasus'), path: ['Caucasus', 'West Russia'] }, /moved in combat/);
    fails(s, { type: 'move', units: ids(s, 'Germans', 'infantry', 'West Russia'), path: ['West Russia', 'Archangel'] }, /friendly/);
    move(s, ids(s, 'Germans', 'infantry', 'West Russia'), ['West Russia', 'Caucasus']);
  });
});

describe('sea movement (p.13, 28-30)', () => {
  it('surface ships stop on entering a hostile sea zone', () => {
    const s = scenario({ power: 'Americans', units: [['Americans', 'destroyer', '12 Sea Zone'], ['Germans', 'destroyer', '13 Sea Zone']] });
    fails(s, { type: 'move', units: ids(s, 'Americans', 'destroyer', '12 Sea Zone'), path: ['12 Sea Zone', '13 Sea Zone', '14 Sea Zone'] }, /stop/);
  });

  it('submarines pass hostile zones unless an enemy destroyer is there', () => {
    const s = scenario({
      power: 'Germans',
      units: [['Germans', 'submarine', '12 Sea Zone'], ['British', 'cruiser', '13 Sea Zone'], ['Germans', 'submarine', '9 Sea Zone'], ['British', 'destroyer', '8 Sea Zone']],
    });
    move(s, ids(s, 'Germans', 'submarine', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone', '14 Sea Zone']);
    fails(s, { type: 'move', units: ids(s, 'Germans', 'submarine', '9 Sea Zone'), path: ['9 Sea Zone', '8 Sea Zone', '6 Sea Zone'] }, /destroyer/);
  });

  it('enemy transports and submarines do not block movement', () => {
    const s = scenario({ power: 'British', units: [['British', 'cruiser', '12 Sea Zone'], ['Germans', 'submarine', '13 Sea Zone'], ['Germans', 'transport', '13 Sea Zone']] });
    move(s, ids(s, 'British', 'cruiser', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone', '14 Sea Zone']);
  });

  it('the Suez canal needs both Egypt and Trans-Jordan friendly at the start of the turn', () => {
    const open = scenario({ power: 'British', phase: 'noncombatMove', units: [['British', 'destroyer', '17 Sea Zone']] });
    move(open, ids(open, 'British', 'destroyer', '17 Sea Zone'), ['17 Sea Zone', '34 Sea Zone']);
    const closed = scenario({ power: 'British', phase: 'noncombatMove', owners: { Egypt: 'Germans' }, units: [['British', 'destroyer', '17 Sea Zone']] });
    fails(closed, { type: 'move', units: ids(closed, 'British', 'destroyer', '17 Sea Zone'), path: ['17 Sea Zone', '34 Sea Zone'] }, /closed/);
  });

  it('a canal captured this turn cannot be used until next turn', () => {
    let s = scenario({ power: 'Germans', owners: {}, units: [['Germans', 'armour', 'Libya'], ['Germans', 'destroyer', '17 Sea Zone']] });
    s.owner['Trans-Jordan'] = 'Germans';
    s.ownerAtTurnStart['Trans-Jordan'] = 'Germans';
    s = move(s, ids(s, 'Germans', 'armour', 'Libya'), ['Libya', 'Egypt']);
    expect(s.owner['Egypt']).toBe('Germans');
    fails(s, { type: 'move', units: ids(s, 'Germans', 'destroyer', '17 Sea Zone'), path: ['17 Sea Zone', '34 Sea Zone'] }, /closed/);
  });

  it('the Panama canal follows control of Central America', () => {
    const s = scenario({ power: 'Japanese', phase: 'noncombatMove', units: [['Japanese', 'cruiser', '19 Sea Zone']] });
    fails(s, { type: 'move', units: ids(s, 'Japanese', 'cruiser', '19 Sea Zone'), path: ['19 Sea Zone', '18 Sea Zone'] }, /closed/);
  });

  it('the optional Turkish straits rule closes sea zone 16 to ships only', () => {
    const s = scenario({ power: 'Germans', phase: 'noncombatMove', units: [['Germans', 'destroyer', '15 Sea Zone'], ['Germans', 'fighter', 'Bulgaria Romania']] });
    s.options.turkishStraitsClosed = true;
    fails(s, { type: 'move', units: ids(s, 'Germans', 'destroyer', '15 Sea Zone'), path: ['15 Sea Zone', '16 Sea Zone'] }, /closed/);
  });
});

describe('air movement (p.13, 26-27)', () => {
  it('a bomber cannot spend all six moves reaching a target', () => {
    const s = scenario({ power: 'Americans', units: [['Americans', 'bomber', 'Eastern United States']] });
    const b = ids(s, 'Americans', 'bomber', 'Eastern United States');
    fails(s, { type: 'move', units: b, path: ['Eastern United States', '11 Sea Zone', '12 Sea Zone', '13 Sea Zone', '14 Sea Zone', '8 Sea Zone', 'France'] });
  });

  it('a fighter may use all its movement against a sea zone a carrier could reach', () => {
    const s = scenario({
      power: 'Americans',
      units: [['Americans', 'fighter', 'Eastern United States'], ['Americans', 'carrier', '11 Sea Zone'], ['Germans', 'submarine', '13 Sea Zone'], ['Germans', 'destroyer', '13 Sea Zone']],
    });
    move(s, ids(s, 'Americans', 'fighter', 'Eastern United States'), ['Eastern United States', '11 Sea Zone', '12 Sea Zone', '13 Sea Zone']);
  });

  it('air units cannot land in a territory captured this turn', () => {
    let s = scenario({ power: 'Germans', units: [['Germans', 'armour', 'West Russia'], ['Germans', 'fighter', 'Germany']] });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    s = ok(s, { type: 'endPhase' });
    fails(s, { type: 'move', units: ids(s, 'Germans', 'fighter', 'Germany'), path: ['Germany', 'Poland', 'Ukraine S.S.R.', 'Caucasus'] }, /cannot land/);
  });

  it('air units without a landing space at end of turn are destroyed', () => {
    let s = scenario({ power: 'Germans', phase: 'noncombatMove', units: [['Germans', 'fighter', 'Germany']] });
    s = move(s, ids(s, 'Germans', 'fighter', 'Germany'), ['Germany', '5 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'endPhase' });
    expect(count(s, 'Germans', 'fighter', '5 Sea Zone')).toBe(0);
  });
});

describe('transports (p.30)', () => {
  it('carry one land unit plus one infantry', () => {
    const s = scenario({ power: 'British', phase: 'noncombatMove', units: [['British', 'transport', '6 Sea Zone'], ['British', 'infantry', 'United Kingdom', 2], ['British', 'armour', 'United Kingdom', 2]] });
    const inf = ids(s, 'British', 'infantry', 'United Kingdom');
    const tanks = ids(s, 'British', 'armour', 'United Kingdom');
    move(s, inf, ['United Kingdom', '6 Sea Zone']);
    move(s, [tanks[0]!, inf[0]!], ['United Kingdom', '6 Sea Zone']);
    fails(s, { type: 'move', units: tanks, path: ['United Kingdom', '6 Sea Zone'] }, /capacity/);
  });

  it('loading uses the land unit’s whole move', () => {
    let s = scenario({ power: 'British', phase: 'noncombatMove', units: [['British', 'transport', '6 Sea Zone'], ['British', 'armour', 'Eire']] });
    s = move(s, ids(s, 'British', 'armour', 'Eire'), ['Eire', 'United Kingdom']);
    fails(s, { type: 'move', units: ids(s, 'British', 'armour', 'United Kingdom'), path: ['United Kingdom', '6 Sea Zone'] }, /before loading/);
  });

  it('cannot load in a hostile sea zone', () => {
    const s = scenario({ power: 'British', phase: 'noncombatMove', units: [['British', 'transport', '6 Sea Zone'], ['British', 'infantry', 'United Kingdom'], ['Germans', 'destroyer', '6 Sea Zone']] });
    fails(s, { type: 'move', units: ids(s, 'British', 'infantry', 'United Kingdom'), path: ['United Kingdom', '6 Sea Zone'] }, /hostile/);
  });

  it('units loaded in combat move must make an amphibious assault', () => {
    let s = scenario({ power: 'British', units: [['British', 'transport', '6 Sea Zone'], ['British', 'infantry', 'United Kingdom']] });
    s = move(s, ids(s, 'British', 'infantry', 'United Kingdom'), ['United Kingdom', '6 Sea Zone']);
    fails(s, { type: 'endPhase' }, /amphibious/);
  });

  it('a transport offloads into only one territory per turn and cannot move after', () => {
    let s = scenario({
      power: 'British',
      phase: 'noncombatMove',
      owners: { 'Northwestern Europe': 'British' },
      units: [['British', 'transport', '8 Sea Zone'], ['British', 'infantry', 'United Kingdom', 2]],
    });
    const inf = ids(s, 'British', 'infantry', 'United Kingdom');
    s = move(s, inf, ['United Kingdom', '8 Sea Zone']);
    s = move(s, [inf[0]!], ['8 Sea Zone', 'United Kingdom']);
    fails(s, { type: 'move', units: [inf[1]!], path: ['8 Sea Zone', 'Northwestern Europe'] }, /one territory/);
    fails(s, { type: 'move', units: ids(s, 'British', 'transport', '8 Sea Zone'), path: ['8 Sea Zone', '7 Sea Zone'] }, /after offloading/);
  });

  it('cargo moves with its transport and dies with it', () => {
    let s = scenario({ power: 'British', phase: 'noncombatMove', units: [['British', 'transport', '6 Sea Zone'], ['British', 'infantry', 'United Kingdom']] });
    s = move(s, ids(s, 'British', 'infantry', 'United Kingdom'), ['United Kingdom', '6 Sea Zone']);
    s = move(s, ids(s, 'British', 'transport', '6 Sea Zone'), ['6 Sea Zone', '7 Sea Zone']);
    expect(count(s, 'British', 'infantry', '7 Sea Zone')).toBe(1);
  });
});

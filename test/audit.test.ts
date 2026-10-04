import { describe, expect, it } from 'vitest';
import { freshUnit } from '../src/engine/state';
import type { GameState, Power, SpaceId, UnitType } from '../src/engine/types';
import { autoResolve, count, fails, fight, ids, move, ok, scenario } from './helpers';

const battleIn = (s: GameState, space: SpaceId) => s.battles.find((b) => b.space === space)!;

function board(s: GameState, carrierType: 'transport' | 'carrier', at: SpaceId, cargo: [Power, UnitType][]): void {
  const host = s.units.find((u) => u.type === carrierType && u.at === at)!;
  for (const [cargoOwner, type] of cargo) {
    const u = freshUnit(s.nextUnitId++, type, cargoOwner, at);
    u.carriedBy = host.id;
    s.units.push(u);
  }
}

describe('combat move: land (p.10-13, 25)', () => {
  it('p.13 a tank that enters a territory holding only antiaircraft artillery must stop there', () => {
    let s = scenario({ units: [['Germans', 'armour', 'West Russia'], ['Russians', 'aaGun', 'Caucasus']] });
    const tank = ids(s, 'Germans', 'armour', 'West Russia');
    s = move(s, tank, ['West Russia', 'Caucasus']);
    fails(s, { type: 'move', units: tank, path: ['Caucasus', 'Kazakh S.S.R.'] });
  });

  it('p.13 a tank that enters a territory holding only an industrial complex must stop there', () => {
    let s = scenario({ units: [['Germans', 'armour', 'West Russia'], ['Russians', 'factory', 'Caucasus']] });
    const tank = ids(s, 'Germans', 'armour', 'West Russia');
    s = move(s, tank, ['West Russia', 'Caucasus']);
    fails(s, { type: 'move', units: tank, path: ['Caucasus', 'Kazakh S.S.R.'] });
  });

  it('p.25 a blitz may end in the space the tank came from', () => {
    const s = scenario({ units: [['Germans', 'armour', 'West Russia']] });
    const after = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus', 'West Russia']);
    expect(after.owner['Caucasus']).toBe('Germans');
    ok(after, { type: 'endPhase' });
  });

  it('p.13 a blitz split into two move orders still lets the tank end in friendly territory', () => {
    let s = scenario({ units: [['Germans', 'armour', 'West Russia']] });
    const tank = ids(s, 'Germans', 'armour', 'West Russia');
    s = move(s, tank, ['West Russia', 'Caucasus']);
    s = move(s, tank, ['Caucasus', 'West Russia']);
    ok(s, { type: 'endPhase' });
  });

  it('p.24 antiaircraft artillery cannot load onto a transport during combat move', () => {
    const s = scenario({ power: 'British', units: [['British', 'transport', '6 Sea Zone'], ['British', 'aaGun', 'United Kingdom']] });
    fails(s, { type: 'move', units: ids(s, 'British', 'aaGun', 'United Kingdom'), path: ['United Kingdom', '6 Sea Zone'] });
  });

  it('p.24 antiaircraft artillery carried from a prior turn may never attack, so it cannot offload in an amphibious assault', () => {
    const s = scenario({
      power: 'British',
      units: [['British', 'transport', '8 Sea Zone'], ['Germans', 'infantry', 'France']],
    });
    board(s, 'transport', '8 Sea Zone', [['British', 'aaGun']]);
    fails(s, { type: 'move', units: ids(s, 'British', 'aaGun', '8 Sea Zone'), path: ['8 Sea Zone', 'France'] });
  });
});

describe('combat move: sea (p.11-13, 30-31, FAQ)', () => {
  it('FAQ units may leave a zone holding only enemy submarines to escape a combat being fought there', () => {
    let s = scenario({
      units: [['Germans', 'cruiser', '5 Sea Zone'], ['Germans', 'destroyer', '5 Sea Zone'], ['British', 'submarine', '5 Sea Zone']],
    });
    s = move(s, ids(s, 'Germans', 'destroyer', '5 Sea Zone'), ['5 Sea Zone', '6 Sea Zone']);
    ok(s, { type: 'endPhase' });
  });

  it('p.12 sea units leaving a hostile zone they started in may end the combat move in a friendly zone', () => {
    let s = scenario({ units: [['Germans', 'cruiser', '5 Sea Zone'], ['Germans', 'destroyer', '5 Sea Zone'], ['British', 'cruiser', '5 Sea Zone']] });
    s = move(s, ids(s, 'Germans', 'destroyer', '5 Sea Zone'), ['5 Sea Zone', '6 Sea Zone']);
    ok(s, { type: 'endPhase' });
  });

  it('p.12 a lone transport sharing a zone with enemy surface warships at turn start must leave it (it cannot attack)', () => {
    const s = scenario({ power: 'British', units: [['British', 'transport', '6 Sea Zone'], ['Germans', 'destroyer', '6 Sea Zone']] });
    fails(s, { type: 'endPhase' });
  });

  it('p.31 transports may not attack without a unit with an attack value (zone holding only an enemy submarine)', () => {
    let s = scenario({ power: 'British', units: [['British', 'transport', '7 Sea Zone'], ['Germans', 'submarine', '6 Sea Zone']] });
    s = move(s, ids(s, 'British', 'transport', '7 Sea Zone'), ['7 Sea Zone', '6 Sea Zone']);
    fails(s, { type: 'endPhase' });
  });

  it('p.13 a transport cannot offload past ignored enemy submarines without one of the attacker’s warships present', () => {
    const base = () => {
      const s = scenario({
        power: 'British',
        units: [['British', 'transport', '8 Sea Zone'], ['Germans', 'submarine', '8 Sea Zone'], ['Germans', 'infantry', 'France']],
      });
      board(s, 'transport', '8 Sea Zone', [['British', 'infantry']]);
      return s;
    };
    let s = base();
    s = move(s, ids(s, 'British', 'infantry', '8 Sea Zone'), ['8 Sea Zone', 'France']);
    fails(s, { type: 'endPhase' }, /warship/);
    let t = base();
    t.units.push(freshUnit(t.nextUnitId++, 'destroyer', 'British', '8 Sea Zone'));
    t = move(t, ids(t, 'British', 'infantry', '8 Sea Zone'), ['8 Sea Zone', 'France']);
    ok(t, { type: 'endPhase' });
  });

  it('p.30 air units ending combat movement in a zone holding only enemy transports must destroy them (battle not skippable)', () => {
    let s = scenario({ power: 'British', units: [['British', 'fighter', 'United Kingdom'], ['Germans', 'transport', '6 Sea Zone']] });
    s = move(s, ids(s, 'British', 'fighter', 'United Kingdom'), ['United Kingdom', '6 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    const b = battleIn(s, '6 Sea Zone');
    fails(s, { type: 'skipBattle', battle: b.id });
  });

  it('p.30 a warship ending its combat move with only enemy transports must destroy them', () => {
    let s = scenario({ power: 'British', units: [['British', 'destroyer', '7 Sea Zone'], ['Germans', 'transport', '6 Sea Zone']] });
    s = move(s, ids(s, 'British', 'destroyer', '7 Sea Zone'), ['7 Sea Zone', '6 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    fails(s, { type: 'skipBattle', battle: battleIn(s, '6 Sea Zone').id });
  });
});

describe('combat move: air (p.13, 26-27)', () => {
  it('p.26 a fighter that stayed aboard a moving carrier is cargo and cannot then take off to attack', () => {
    let s = scenario({
      power: 'Americans',
      units: [['Americans', 'carrier', '11 Sea Zone'], ['Americans', 'fighter', '11 Sea Zone'], ['Germans', 'destroyer', '13 Sea Zone']],
    });
    s = move(s, ids(s, 'Americans', 'carrier', '11 Sea Zone'), ['11 Sea Zone', '12 Sea Zone']);
    fails(s, { type: 'move', units: ids(s, 'Americans', 'fighter', '12 Sea Zone'), path: ['12 Sea Zone', '13 Sea Zone'] });
  });

  it('p.26 the demonstrated landing must have room: a full allied carrier is not a landing space', () => {
    const setup = (britishFighters: number) =>
      scenario({
        power: 'Americans',
        units: [
          ['Americans', 'fighter', 'United Kingdom'],
          ['Germans', 'destroyer', '12 Sea Zone'],
          ['British', 'carrier', '13 Sea Zone'],
          ['British', 'fighter', '13 Sea Zone', britishFighters],
        ],
      });
    const path = ['United Kingdom', '7 Sea Zone', '9 Sea Zone', '12 Sea Zone'];
    const room = setup(1);
    move(room, ids(room, 'Americans', 'fighter', 'United Kingdom'), path);
    const full = setup(2);
    fails(full, { type: 'move', units: ids(full, 'Americans', 'fighter', 'United Kingdom'), path });
  });

  it('p.21 a noncombat move cannot end a fighter in a sea zone with no carrier able to be there', () => {
    const s = scenario({ phase: 'noncombatMove', units: [['Germans', 'fighter', 'Germany']] });
    fails(s, { type: 'move', units: ids(s, 'Germans', 'fighter', 'Germany'), path: ['Germany', '5 Sea Zone'] });
  });

  it('p.21 bombers cannot land at sea', () => {
    const s = scenario({ phase: 'noncombatMove', units: [['Germans', 'bomber', 'Germany'], ['Germans', 'carrier', '5 Sea Zone']] });
    fails(s, { type: 'move', units: ids(s, 'Germans', 'bomber', 'Germany'), path: ['Germany', '5 Sea Zone'] });
  });
});

describe('sea combat (p.16-18, 29-31, FAQ)', () => {
  it('p.18 sea units may only retreat to a zone that was friendly at the start of the turn', () => {
    let s = scenario({
      units: [
        ['Germans', 'battleship', '6 Sea Zone'],
        ['Germans', 'destroyer', '6 Sea Zone'],
        ['British', 'cruiser', '6 Sea Zone'],
        ['British', 'submarine', '7 Sea Zone'],
      ],
      dice: [1, 6, 6, 6],
    });
    s = move(s, ids(s, 'Germans', 'destroyer', '6 Sea Zone'), ['6 Sea Zone', '7 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, '6 Sea Zone').id });
    s = autoResolve(s);
    expect(count(s, 'British', 'cruiser', '6 Sea Zone')).toBe(0);
    s = ok(s, { type: 'startBattle', battle: battleIn(s, '7 Sea Zone').id });
    const options = s.pending?.kind === 'retreat' ? s.pending.options : [];
    expect(options).not.toContain('6 Sea Zone');
  });

  it('FAQ an allied destroyer in the zone does not cancel the defending submarine’s submerge', () => {
    let s = scenario({
      power: 'Americans',
      units: [['Americans', 'cruiser', '12 Sea Zone'], ['British', 'destroyer', '13 Sea Zone'], ['Germans', 'submarine', '13 Sea Zone']],
    });
    s = move(s, ids(s, 'Americans', 'cruiser', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    const b = battleIn(s, '13 Sea Zone');
    s = ok(s, { type: 'startBattle', battle: b.id });
    expect(s.pending).toMatchObject({ kind: 'submerge', side: 'defender', power: 'Germans' });
    expect(battleIn(s, '13 Sea Zone').attackers).toEqual(ids(s, 'Americans', 'cruiser', '13 Sea Zone'));
  });

  it('FAQ any defending destroyer lets a defending fighter of another power hit attacking submarines', () => {
    let s = scenario({
      units: [
        ['Germans', 'submarine', '12 Sea Zone'],
        ['British', 'destroyer', '13 Sea Zone'],
        ['Americans', 'carrier', '13 Sea Zone'],
        ['Americans', 'fighter', '13 Sea Zone'],
      ],
      dice: [6, 6, 6, 4],
    });
    s = move(s, ids(s, 'Germans', 'submarine', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
    s = fight(s, '13 Sea Zone');
    expect(count(s, 'Germans', 'submarine', '13 Sea Zone')).toBe(0);
  });

  it('p.16 a defending submarine hit by a surprise strike still makes its own surprise strike', () => {
    let s = scenario({ units: [['Germans', 'submarine', '12 Sea Zone'], ['British', 'submarine', '13 Sea Zone']], dice: [1, 1] });
    s = move(s, ids(s, 'Germans', 'submarine', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
    s = fight(s, '13 Sea Zone');
    expect(count(s, 'Germans', 'submarine', '13 Sea Zone')).toBe(0);
    expect(count(s, 'British', 'submarine', '13 Sea Zone')).toBe(0);
  });

  it('p.29 submarine hits cannot be assigned to defending fighters on a carrier', () => {
    let s = scenario({
      units: [['Germans', 'submarine', '12 Sea Zone'], ['British', 'carrier', '13 Sea Zone'], ['British', 'fighter', '13 Sea Zone', 2]],
      dice: [1, 6, 6, 6, 6, 6, 6],
    });
    s = move(s, ids(s, 'Germans', 'submarine', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, '13 Sea Zone').id });
    s = autoResolve(s, { retreat: '12 Sea Zone' });
    expect(count(s, 'British', 'carrier', '13 Sea Zone')).toBe(0);
  });

  it('FAQ once surface warships are sunk the remaining submarines cannot be ignored: the battle continues', () => {
    let s = scenario({
      power: 'British',
      units: [['British', 'destroyer', '12 Sea Zone', 2], ['Germans', 'cruiser', '13 Sea Zone'], ['Germans', 'submarine', '13 Sea Zone']],
      dice: [1, 6, 6, 6, 1, 6, 6],
    });
    s = move(s, ids(s, 'British', 'destroyer', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, '13 Sea Zone').id });
    s = ok(s, { type: 'casualties', units: ids(s, 'Germans', 'cruiser', '13 Sea Zone') });
    s = autoResolve(s);
    expect(battleIn(s, '13 Sea Zone').round).toBeGreaterThanOrEqual(2);
    expect(count(s, 'Germans', 'submarine', '13 Sea Zone')).toBe(0);
  });

  it('p.30 transports in a retreating fleet cannot offload: the landing does not happen', () => {
    let s = scenario({
      power: 'British',
      units: [
        ['British', 'transport', '7 Sea Zone'],
        ['British', 'destroyer', '7 Sea Zone'],
        ['British', 'infantry', 'United Kingdom'],
        ['Germans', 'destroyer', '8 Sea Zone'],
        ['Germans', 'infantry', 'France'],
      ],
      dice: [6, 6],
    });
    s = move(s, ids(s, 'British', 'infantry', 'United Kingdom'), ['United Kingdom', '7 Sea Zone']);
    s = move(s, [...ids(s, 'British', 'transport', '7 Sea Zone'), ...ids(s, 'British', 'destroyer', '7 Sea Zone')], ['7 Sea Zone', '8 Sea Zone']);
    s = move(s, ids(s, 'British', 'infantry', '8 Sea Zone'), ['8 Sea Zone', 'France']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, '8 Sea Zone').id });
    expect(s.pending).toMatchObject({ kind: 'retreat', options: ['7 Sea Zone'] });
    s = ok(s, { type: 'retreat', to: '7 Sea Zone' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, 'France').id });
    expect(count(s, 'British', 'infantry', '7 Sea Zone')).toBe(1);
    expect(count(s, 'British', 'infantry', 'France')).toBe(0);
    expect(s.owner['France']).toBe('Germans');
  });

  it('p.15 destroying defenseless transports counts as sea combat and prevents bombardment from that zone', () => {
    let s = scenario({
      power: 'British',
      units: [['British', 'transport', '8 Sea Zone'], ['British', 'battleship', '8 Sea Zone'], ['Germans', 'transport', '8 Sea Zone'], ['Germans', 'infantry', 'France']],
      dice: [6, 6],
    });
    board(s, 'transport', '8 Sea Zone', [['British', 'infantry']]);
    s = move(s, ids(s, 'British', 'infantry', '8 Sea Zone'), ['8 Sea Zone', 'France']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, '8 Sea Zone').id });
    s = autoResolve(s);
    expect(count(s, 'Germans', 'transport', '8 Sea Zone')).toBe(0);
    s = ok(s, { type: 'startBattle', battle: battleIn(s, 'France').id });
    expect(s.pending?.kind).not.toBe('bombard');
  });
});

describe('strategic bombing (p.14, 25)', () => {
  it('p.25 antiaircraft artillery does not fire at raiding bombers; only the complex does', () => {
    let s = scenario({
      power: 'British',
      units: [['British', 'bomber', 'United Kingdom'], ['Germans', 'factory', 'Germany'], ['Germans', 'aaGun', 'Germany', 2]],
      dice: [6, 3],
    });
    s = move(s, ids(s, 'British', 'bomber', 'United Kingdom'), ['United Kingdom', '6 Sea Zone', '5 Sea Zone', 'Germany'], { sbr: true });
    s = fight(s, 'Germany');
    expect(battleIn(s, 'Germany').dice.map((d) => d.rolls.length)).toEqual([1, 1]);
    expect(s.units.find((u) => u.type === 'factory')!.damage).toBe(3);
  });
});

describe('capitals and income (p.19, 23)', () => {
  it('p.19 the captor collects a captured capital’s treasury even while its own capital is lost', () => {
    let s = scenario({ owners: { Germany: 'British' }, units: [['Germans', 'armour', 'West Russia']], treasury: { Russians: 12, Germans: 0 } });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Russia']);
    expect(s.treasury.Germans).toBe(12);
  });

  it('p.19 a power without its capital skips the purchase phase, including repairs', () => {
    const s = scenario({
      power: 'Russians',
      phase: 'purchase',
      owners: { Russia: 'Germans' },
      units: [['Russians', 'factory', 'Karelia S.S.R.']],
      treasury: { Russians: 10 },
    });
    s.units.find((u) => u.type === 'factory')!.damage = 2;
    fails(s, { type: 'repair', factory: s.units.find((u) => u.type === 'factory')!.id, amount: 2 });
  });

  it('p.23 no income is collected while the capital is enemy-held', () => {
    let s = scenario({ power: 'Russians', phase: 'mobilize', owners: { Russia: 'Germans' }, treasury: { Russians: 0 }, units: [] });
    s = ok(s, { type: 'endPhase' });
    expect(s.treasury.Russians).toBe(0);
  });

  it('p.19 a territory taken while the ally’s capital is enemy-held reverts when that capital is liberated the same turn', () => {
    let s = scenario({
      power: 'British',
      owners: { 'Karelia S.S.R.': 'Germans', Russia: 'Germans', Archangel: 'British' },
      units: [['British', 'infantry', 'Archangel', 2]],
    });
    const [a, b] = ids(s, 'British', 'infantry', 'Archangel');
    s = move(s, [a!], ['Archangel', 'Karelia S.S.R.']);
    expect(s.owner['Karelia S.S.R.']).toBe('British');
    s = move(s, [b!], ['Archangel', 'Russia']);
    expect(s.owner['Russia']).toBe('Russians');
    expect(s.owner['Karelia S.S.R.']).toBe('Russians');
    expect(s.owner['Archangel']).toBe('Russians');
  });

  it('p.19 liberating a capital does not take IPCs from the enemy that held it', () => {
    let s = scenario({ power: 'British', owners: { Caucasus: 'British', Russia: 'Germans' }, units: [['British', 'armour', 'Caucasus']], treasury: { Germans: 20, British: 0 } });
    s = move(s, ids(s, 'British', 'armour', 'Caucasus'), ['Caucasus', 'Russia']);
    expect(s.treasury.Germans).toBe(20);
    expect(s.treasury.British).toBe(0);
  });
});

describe('purchase and mobilization (p.10, 22, 25, FAQ)', () => {
  it('FAQ purchases are limited to what the complexes can mobilize, sea units only at coastal complexes', () => {
    const s = scenario({ phase: 'purchase', units: [['Germans', 'factory', 'Poland']], treasury: { Germans: 100 } });
    fails(s, { type: 'buy', purchases: [{ type: 'infantry', count: 3 }] });
    fails(s, { type: 'buy', purchases: [{ type: 'destroyer', count: 1 }] });
    ok(s, { type: 'buy', purchases: [{ type: 'infantry', count: 2 }, { type: 'factory', count: 1 }] });
  });

  it('p.22 an industrial complex placed this turn cannot mobilize units this turn', () => {
    let s = scenario({ phase: 'mobilize', units: [] });
    s.purchases = [{ type: 'factory', count: 1 }, { type: 'infantry', count: 1 }];
    s = ok(s, { type: 'place', unitType: 'factory', at: 'Poland', count: 1 });
    fails(s, { type: 'place', unitType: 'infantry', at: 'Poland', count: 1 });
  });

  it('p.22 new industrial complexes need a territory worth at least 1 IPC held since the turn began', () => {
    const s = scenario({ phase: 'mobilize', units: [] });
    s.purchases = [{ type: 'factory', count: 1 }];
    s.owner['Caucasus'] = 'Germans';
    fails(s, { type: 'place', unitType: 'factory', at: 'Caucasus', count: 1 });
  });

  it('p.22 new fighters need free room on the carrier; a guest fighter already aboard uses a slot', () => {
    const s = scenario({ phase: 'mobilize', units: [['Germans', 'factory', 'Italy'], ['Germans', 'carrier', '15 Sea Zone']] });
    board(s, 'carrier', '15 Sea Zone', [['Japanese', 'fighter']]);
    s.purchases = [{ type: 'fighter', count: 2 }];
    fails(s, { type: 'place', unitType: 'fighter', at: '15 Sea Zone', count: 2 });
  });

  it('p.22 new fighters cannot be placed on a friendly power’s carrier', () => {
    const s = scenario({ phase: 'mobilize', units: [['Germans', 'factory', 'Italy'], ['Japanese', 'carrier', '15 Sea Zone']] });
    s.purchases = [{ type: 'fighter', count: 1 }];
    fails(s, { type: 'place', unitType: 'fighter', at: '15 Sea Zone', count: 1 });
  });

  it('p.22 new sea units may enter play in a hostile sea zone', () => {
    const s = scenario({ phase: 'mobilize', units: [['Germans', 'factory', 'Italy'], ['British', 'battleship', '15 Sea Zone']] });
    s.purchases = [{ type: 'destroyer', count: 1 }];
    ok(s, { type: 'place', unitType: 'destroyer', at: '15 Sea Zone', count: 1 });
  });
});

describe('movement misc (p.11, 20-21, 30)', () => {
  it('p.21 submarines stop on entering a zone with an enemy destroyer in noncombat too', () => {
    const s = scenario({ phase: 'noncombatMove', units: [['Germans', 'submarine', '9 Sea Zone'], ['British', 'destroyer', '8 Sea Zone']] });
    fails(s, { type: 'move', units: ids(s, 'Germans', 'submarine', '9 Sea Zone'), path: ['9 Sea Zone', '8 Sea Zone', '6 Sea Zone'] });
  });

  it('p.21 surface ships cannot enter a hostile zone in noncombat, submarines can', () => {
    const s = scenario({ phase: 'noncombatMove', units: [['Germans', 'cruiser', '12 Sea Zone'], ['Germans', 'submarine', '12 Sea Zone'], ['British', 'cruiser', '13 Sea Zone']] });
    fails(s, { type: 'move', units: ids(s, 'Germans', 'cruiser', '12 Sea Zone'), path: ['12 Sea Zone', '13 Sea Zone'] });
    move(s, ids(s, 'Germans', 'submarine', '12 Sea Zone'), ['12 Sea Zone', '13 Sea Zone']);
  });

  it('p.20 land units on an ally’s transport offload on a later turn of their owner, not the turn they load', () => {
    let s = scenario({ power: 'British', phase: 'noncombatMove', units: [['Americans', 'transport', '8 Sea Zone'], ['British', 'infantry', 'United Kingdom']] });
    s = move(s, ids(s, 'British', 'infantry', 'United Kingdom'), ['United Kingdom', '8 Sea Zone']);
    fails(s, { type: 'move', units: ids(s, 'British', 'infantry', '8 Sea Zone'), path: ['8 Sea Zone', 'United Kingdom'] });
  });

  it('p.20 a power cannot move an ally’s transport', () => {
    const s = scenario({ power: 'British', phase: 'noncombatMove', units: [['Americans', 'transport', '8 Sea Zone']] });
    fails(s, { type: 'move', units: ids(s, 'Americans', 'transport', '8 Sea Zone'), path: ['8 Sea Zone', '7 Sea Zone'] });
  });
});

describe('victory (FAQ errata p.6, 23)', () => {
  it('FAQ total victory needs all 13 victory cities', () => {
    const twelve = scenario({
      power: 'Americans',
      phase: 'mobilize',
      owners: { Russia: 'Germans', 'Karelia S.S.R.': 'Germans', India: 'Japanese', 'United Kingdom': 'Germans', 'Hawaiian Islands': 'Japanese', 'Eastern United States': 'Japanese' },
      units: [],
    });
    twelve.options.victory = 'total';
    twelve.ownerAtTurnStart = { ...twelve.owner };
    expect(ok(twelve, { type: 'endPhase' }).winner).toBeNull();
    const all = structuredClone(twelve);
    all.owner['Western United States'] = 'Japanese';
    expect(ok(all, { type: 'endPhase' }).winner).toBe('Axis');
  });
});

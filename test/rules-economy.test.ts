import { describe, expect, it } from 'vitest';
import { STATS, VICTORY_CITIES, space } from '../src/engine/data';
import { income } from '../src/engine/queries';
import type { GameState, Power, SpaceId } from '../src/engine/types';
import { count, fails, ids, move, ok, scenario } from './helpers';

/** End phases until the turn passes to the next power. */
function finishTurn(s: GameState): GameState {
  const power = s.power;
  let cur = s;
  for (let i = 0; i < 10 && cur.power === power && !cur.winner; i++) cur = ok(cur, { type: 'endPhase' });
  return cur;
}

const factory = (s: GameState, at: SpaceId) => s.units.find((u) => u.type === 'factory' && u.at === at)!;

function toMobilize(s: GameState): GameState {
  let cur = s;
  while (cur.phase !== 'mobilize') cur = ok(cur, { type: 'endPhase' });
  return cur;
}

/** Give each listed victory city to the given power. */
const ownCities = (cities: SpaceId[], power: Power) => Object.fromEntries(cities.map((c) => [c, power]));

describe('turn sequence (rulebook "Turn Sequence"; order of play)', () => {
  it('powers play Soviet Union, Germany, United Kingdom, Japan, United States, and a new round starts after the US', () => {
    const order: Power[] = [];
    let s = scenario({ power: 'Russians', phase: 'purchase', units: [] });
    const round = s.round;
    for (let i = 0; i < 5; i++) {
      order.push(s.power);
      s = finishTurn(s);
    }
    expect(order).toEqual(['Russians', 'Germans', 'British', 'Japanese', 'Americans']);
    expect(s.power).toBe('Russians');
    expect(s.round).toBe(round + 1);
  });

  it('phases run purchase, combat move, combat, noncombat move, mobilize, then collect income', () => {
    let s = scenario({ power: 'Germans', phase: 'purchase', units: [] });
    const seen = [s.phase];
    for (let i = 0; i < 3; i++) {
      s = ok(s, { type: 'endPhase' });
      seen.push(s.phase);
    }
    expect(seen).toEqual(['purchase', 'combatMove', 'noncombatMove', 'mobilize']);
  });

  it('units cannot be moved in the purchase phase, bought in combat move, or placed before mobilize', () => {
    const p = scenario({ power: 'Germans', phase: 'purchase', units: [['Germans', 'armour', 'Germany']] });
    fails(p, { type: 'move', units: ids(p, 'Germans', 'armour', 'Germany'), path: ['Germany', 'Poland'] });
    const c = scenario({ power: 'Germans', phase: 'combatMove', units: [['Germans', 'factory', 'Germany']] });
    fails(c, { type: 'buy', purchases: [{ type: 'infantry', count: 1 }] });
    fails(c, { type: 'repair', factory: factory(c, 'Germany').id, amount: 1 });
    const n = scenario({ power: 'Germans', phase: 'noncombatMove', units: [['Germans', 'factory', 'Germany']] });
    n.purchases = [{ type: 'infantry', count: 1 }];
    fails(n, { type: 'place', unitType: 'infantry', at: 'Germany', count: 1 });
  });
});

describe('unit costs and stats (rulebook unit profiles; reference chart)', () => {
  it('every unit costs and fights as printed', () => {
    const table = Object.fromEntries(Object.entries(STATS).map(([t, v]) => [t, [v.cost, v.attack, v.defense, v.move]]));
    expect(table).toEqual({
      infantry: [3, 1, 2, 1],
      artillery: [4, 2, 2, 1],
      armour: [6, 3, 3, 2],
      aaGun: [5, 0, 0, 1],
      factory: [15, 0, 0, 0],
      fighter: [10, 3, 4, 4],
      bomber: [12, 4, 1, 6],
      transport: [7, 0, 0, 2],
      submarine: [6, 2, 1, 2],
      destroyer: [8, 2, 2, 2],
      cruiser: [12, 3, 3, 2],
      carrier: [14, 1, 2, 2],
      battleship: [20, 4, 4, 2],
    });
  });

  it('errata: starting incomes are Germany 41 and United Kingdom 31', () => {
    const s = scenario({ power: 'Russians', phase: 'purchase', units: [] });
    expect(income(s, 'Germans')).toBe(41);
    expect(income(s, 'British')).toBe(31);
    expect(income(s, 'Russians')).toBe(24);
    expect(income(s, 'Japanese')).toBe(30);
    expect(income(s, 'Americans')).toBe(42);
  });
});

describe('purchase and repair (Purchase & Repair Units phase; FAQ "Purchasing Units")', () => {
  const germany = (treasury = 100) =>
    scenario({
      power: 'Germans',
      phase: 'purchase',
      treasury: { Germans: treasury },
      units: [['Germans', 'factory', 'Germany']],
    });

  it('FAQ: you may only buy as many units as your complexes can mobilize', () => {
    const s = germany();
    ok(s, { type: 'buy', purchases: [{ type: 'infantry', count: 10 }] });
    fails(s, { type: 'buy', purchases: [{ type: 'infantry', count: 11 }] });
  });

  it('cannot spend more IPCs than the treasury holds', () => {
    fails(germany(5), { type: 'buy', purchases: [{ type: 'infantry', count: 2 }] });
  });

  it('repairs cost 1 IPC per damage and restore production', () => {
    let s = germany(20);
    factory(s, 'Germany').damage = 4;
    fails(s, { type: 'buy', purchases: [{ type: 'infantry', count: 7 }] });
    s = ok(s, { type: 'repair', factory: factory(s, 'Germany').id, amount: 4 });
    expect(s.treasury.Germans).toBe(16);
    expect(factory(s, 'Germany').damage).toBe(0);
    ok({ ...s, treasury: { ...s.treasury, Germans: 100 } }, { type: 'buy', purchases: [{ type: 'infantry', count: 10 }] });
  });

  it('IPCs spent on purchases leave the treasury when the phase ends', () => {
    let s = germany(30);
    s = ok(s, {
      type: 'buy',
      purchases: [
        { type: 'armour', count: 2 },
        { type: 'infantry', count: 1 },
      ],
    });
    s = ok(s, { type: 'endPhase' });
    expect(s.treasury.Germans).toBe(15);
  });
});

describe('mobilize new units (Mobilize New Units phase)', () => {
  const mobilize = (purchases: GameState['purchases'], extra: Parameters<typeof scenario>[0]['units'] = [], owners = {}) => {
    const s = scenario({
      power: 'Germans',
      phase: 'mobilize',
      owners,
      units: [['Germans', 'factory', 'Germany'], ...extra],
    });
    s.purchases = purchases;
    return s;
  };

  it('a complex mobilizes at most its territory IPC value minus its damage', () => {
    const s = mobilize([{ type: 'infantry', count: 10 }]);
    factory(s, 'Germany').damage = 3;
    fails(s, { type: 'place', unitType: 'infantry', at: 'Germany', count: 8 });
    ok(s, { type: 'place', unitType: 'infantry', at: 'Germany', count: 7 });
  });

  it('several antiaircraft artillery may be mobilized in one territory', () => {
    const s = mobilize([{ type: 'aaGun', count: 2 }]);
    const after = ok(s, { type: 'place', unitType: 'aaGun', at: 'Germany', count: 2 });
    expect(count(after, 'Germans', 'aaGun', 'Germany')).toBe(2);
  });

  it("units cannot be mobilized in an allied power's complex", () => {
    const s = mobilize([{ type: 'infantry', count: 1 }], [['Japanese', 'factory', 'Italy']], { Italy: 'Japanese' });
    fails(s, { type: 'place', unitType: 'infantry', at: 'Italy', count: 1 });
  });

  it('new sea units may be placed in an adjacent sea zone that holds enemy warships', () => {
    const s = mobilize([{ type: 'destroyer', count: 1 }], [['British', 'battleship', '5 Sea Zone']]);
    const after = ok(s, { type: 'place', unitType: 'destroyer', at: '5 Sea Zone', count: 1 });
    expect(count(after, 'Germans', 'destroyer', '5 Sea Zone')).toBe(1);
  });

  it('sea units must go in a sea zone adjacent to the complex', () => {
    const s = mobilize([{ type: 'destroyer', count: 1 }]);
    fails(s, { type: 'place', unitType: 'destroyer', at: '6 Sea Zone', count: 1 });
    fails(s, { type: 'place', unitType: 'destroyer', at: 'Germany', count: 1 });
  });

  it('new fighters may be placed on a new carrier, but not at sea without carrier room', () => {
    let s = mobilize([
      { type: 'carrier', count: 1 },
      { type: 'fighter', count: 3 },
    ]);
    fails(s, { type: 'place', unitType: 'fighter', at: '5 Sea Zone', count: 1 });
    s = ok(s, { type: 'place', unitType: 'carrier', at: '5 Sea Zone', count: 1 });
    fails(s, { type: 'place', unitType: 'fighter', at: '5 Sea Zone', count: 3 });
    s = ok(s, { type: 'place', unitType: 'fighter', at: '5 Sea Zone', count: 2 });
    expect(count(s, 'Germans', 'fighter', '5 Sea Zone')).toBe(2);
  });

  it('new fighters may be placed on an existing carrier', () => {
    const s = mobilize([{ type: 'fighter', count: 1 }], [['Germans', 'carrier', '5 Sea Zone']]);
    ok(s, { type: 'place', unitType: 'fighter', at: '5 Sea Zone', count: 1 });
  });

  it('bombers cannot be placed at sea', () => {
    const s = mobilize([{ type: 'bomber', count: 1 }], [['Germans', 'carrier', '5 Sea Zone']]);
    fails(s, { type: 'place', unitType: 'bomber', at: '5 Sea Zone', count: 1 });
  });

  it('units bought but not mobilized are returned and their cost refunded', () => {
    let s = mobilize([{ type: 'infantry', count: 2 }]);
    s.treasury.Germans = 10;
    const gained = income(s, 'Germans');
    s = finishTurn(s);
    expect(s.treasury.Germans).toBe(10 + 6 + gained);
    expect(count(s, 'Germans', 'infantry', 'Germany')).toBe(0);
  });

  it('units cannot be mobilized at a complex in a territory captured this turn', () => {
    let s = scenario({
      power: 'Germans',
      phase: 'purchase',
      treasury: { Germans: 30 },
      units: [
        ['Germans', 'factory', 'Germany'],
        ['Germans', 'armour', 'West Russia'],
        ['Russians', 'factory', 'Karelia S.S.R.'],
      ],
      owners: { 'West Russia': 'Germans' },
    });
    s = ok(s, { type: 'buy', purchases: [{ type: 'infantry', count: 2 }] });
    s = ok(s, { type: 'endPhase' });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Karelia S.S.R.']);
    expect(s.owner['Karelia S.S.R.']).toBe('Germans');
    s = toMobilize(s);
    fails(s, { type: 'place', unitType: 'infantry', at: 'Karelia S.S.R.', count: 1 });
    fails(s, { type: 'place', unitType: 'destroyer', at: '4 Sea Zone', count: 1 });
    ok(s, { type: 'place', unitType: 'infantry', at: 'Germany', count: 1 });
  });

  it('a captured complex keeps its damage and changes hands', () => {
    let s = scenario({
      power: 'Germans',
      units: [
        ['Germans', 'armour', 'West Russia'],
        ['Russians', 'factory', 'Karelia S.S.R.'],
      ],
      owners: { 'West Russia': 'Germans' },
    });
    factory(s, 'Karelia S.S.R.').damage = 2;
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Karelia S.S.R.']);
    expect(factory(s, 'Karelia S.S.R.').owner).toBe('Germans');
    expect(factory(s, 'Karelia S.S.R.').damage).toBe(2);
  });
});

describe('new industrial complexes', () => {
  const withFactoryBought = (owners: Record<SpaceId, Power> = {}) => {
    const s = scenario({ power: 'Germans', phase: 'mobilize', owners, units: [['Germans', 'factory', 'Germany']] });
    s.purchases = [
      { type: 'factory', count: 1 },
      { type: 'infantry', count: 1 },
    ];
    return s;
  };

  it('go on a territory worth at least 1 IPC you controlled since the start of the turn', () => {
    const s = withFactoryBought();
    ok(s, { type: 'place', unitType: 'factory', at: 'France', count: 1 });
  });

  it('cannot go on a 0-IPC territory', () => {
    const s = withFactoryBought({ Gibraltar: 'Germans' });
    expect(space('Gibraltar').ipc).toBe(0);
    fails(s, { type: 'place', unitType: 'factory', at: 'Gibraltar', count: 1 });
  });

  it('cannot go where a complex already stands', () => {
    fails(withFactoryBought(), { type: 'place', unitType: 'factory', at: 'Germany', count: 1 });
  });

  it('cannot go on a territory captured this turn', () => {
    const s = withFactoryBought();
    s.owner['Ukraine S.S.R.'] = 'Germans';
    s.capturedThisTurn.push('Ukraine S.S.R.');
    fails(s, { type: 'place', unitType: 'factory', at: 'Ukraine S.S.R.', count: 1 });
  });

  it('cannot mobilize units the turn it is placed', () => {
    const s = ok(withFactoryBought(), { type: 'place', unitType: 'factory', at: 'France', count: 1 });
    fails(s, { type: 'place', unitType: 'infantry', at: 'France', count: 1 });
  });
});

describe('collect income and capitals (Collect Income phase; Capturing Capitals; Liberating Territories)', () => {
  it('income includes territories captured this turn', () => {
    let s = scenario({
      power: 'Germans',
      treasury: { Germans: 0 },
      units: [['Germans', 'armour', 'West Russia']],
      owners: { 'West Russia': 'Germans' },
    });
    const before = income(s, 'Germans');
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    s = finishTurn(s);
    expect(s.treasury.Germans).toBe(before + space('Caucasus').ipc);
  });

  it('a power whose capital is held by the enemy collects no income', () => {
    let s = scenario({ power: 'Russians', treasury: { Russians: 0 }, units: [], owners: { Russia: 'Germans' } });
    s = finishTurn(s);
    expect(s.treasury.Russians).toBe(0);
  });

  it("capturing a capital takes all of its owner's IPCs", () => {
    let s = scenario({
      power: 'Germans',
      treasury: { Germans: 5, Russians: 17 },
      units: [['Germans', 'armour', 'West Russia']],
      owners: { 'West Russia': 'Germans' },
    });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Russia']);
    expect(s.owner['Russia']).toBe('Germans');
    expect(s.treasury.Germans).toBe(22);
    expect(s.treasury.Russians).toBe(0);
  });

  it('a liberated territory returns to its original owner when that owner holds its capital', () => {
    let s = scenario({
      power: 'British',
      units: [['British', 'armour', 'Kazakh S.S.R.']],
      owners: { Caucasus: 'Germans' },
    });
    s = move(s, ids(s, 'British', 'armour', 'Kazakh S.S.R.'), ['Kazakh S.S.R.', 'Caucasus']);
    expect(s.owner['Caucasus']).toBe('Russians');
  });

  it("while the original owner's capital is enemy-held the liberator keeps it, and liberating the capital returns both", () => {
    let s = scenario({
      power: 'British',
      treasury: { British: 0, Russians: 0 },
      units: [['British', 'armour', 'Kazakh S.S.R.', 2]],
      owners: { Caucasus: 'Germans', Russia: 'Germans', 'Kazakh S.S.R.': 'British' },
    });
    const [a, b] = ids(s, 'British', 'armour', 'Kazakh S.S.R.');
    s = move(s, [a!], ['Kazakh S.S.R.', 'Caucasus']);
    expect(s.owner['Caucasus']).toBe('British');
    s = move(s, [b!], ['Kazakh S.S.R.', 'Russia']);
    expect(s.owner['Russia']).toBe('Russians');
    expect(s.owner['Caucasus']).toBe('Russians');
    expect(s.owner['Kazakh S.S.R.']).toBe('Russians');
    expect(s.treasury.British).toBe(0);
  });

  it('recapturing your own capital plunders nobody', () => {
    let s = scenario({
      power: 'Russians',
      treasury: { Russians: 0, Germans: 12 },
      units: [['Russians', 'armour', 'West Russia']],
      owners: { Russia: 'Germans' },
    });
    s = move(s, ids(s, 'Russians', 'armour', 'West Russia'), ['West Russia', 'Russia']);
    expect(s.owner['Russia']).toBe('Russians');
    expect(s.treasury.Germans).toBe(12);
    expect(s.treasury.Russians).toBe(0);
  });
});

describe('victory (errata p.6, p.23: 13 cities; 9 Axis / 10 Allies after the US turn)', () => {
  const AXIS_START = ['Germany', 'France', 'Italy', 'Kiangsu', 'Philippine Islands', 'Japan'];

  it('the map has thirteen victory cities, six Axis and seven Allied at the start', () => {
    expect(VICTORY_CITIES.length).toBe(13);
    expect([...VICTORY_CITIES].filter((c) => ['Germans', 'Japanese'].includes(space(c).originalOwner!)).sort()).toEqual(
      [...AXIS_START].sort(),
    );
  });

  it('the Axis win with 9 cities only when the US turn ends', () => {
    const owners = ownCities(['India', 'Russia', 'Karelia S.S.R.'], 'Germans');
    let s = scenario({ power: 'Japanese', phase: 'mobilize', units: [], owners });
    s = finishTurn(s);
    expect(s.winner).toBeNull();
    s = scenario({ power: 'Americans', phase: 'mobilize', units: [], owners });
    s = finishTurn(s);
    expect(s.winner).toBe('Axis');
  });

  it('the Axis need 9, not 8', () => {
    const s = finishTurn(
      scenario({ power: 'Americans', phase: 'mobilize', units: [], owners: ownCities(['India', 'Russia'], 'Germans') }),
    );
    expect(s.winner).toBeNull();
  });

  it('the Allies win with 10 cities after the US turn', () => {
    const s = finishTurn(
      scenario({
        power: 'Americans',
        phase: 'mobilize',
        units: [],
        owners: ownCities(['France', 'Italy', 'Kiangsu'], 'British'),
      }),
    );
    expect(s.winner).toBe('Allies');
  });

  it('total victory needs all thirteen', () => {
    let s = scenario({
      power: 'Americans',
      phase: 'mobilize',
      units: [],
      owners: ownCities(['India', 'Russia', 'Karelia S.S.R.'], 'Germans'),
    });
    s.options.victory = 'total';
    expect(finishTurn(s).winner).toBeNull();
  });
});

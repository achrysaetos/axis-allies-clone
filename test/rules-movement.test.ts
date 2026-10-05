import { describe, expect, it } from 'vitest';
import { freshUnit } from '../src/engine/state';
import type { GameState, Power, SpaceId, UnitType } from '../src/engine/types';
import { count, fails, ids, move, ok, scenario } from './helpers';

/** Put land cargo aboard a transport already in `zone`, as if loaded on an earlier turn. */
function aboard(s: GameState, owner: Power, type: UnitType, zone: SpaceId): number {
  const t = s.units.find((u) => u.type === 'transport' && u.at === zone)!;
  const u = freshUnit(s.nextUnitId++, type, owner, zone);
  u.carriedBy = t.id;
  s.units.push(u);
  return u.id;
}

describe('sea movement: submarines and enemy destroyers (p.21, Submarine profile)', () => {
  it('a submarine that entered a zone with an enemy destroyer in combat move cannot sail on in a second order', () => {
    let s = scenario({
      power: 'Germans',
      units: [
        ['Germans', 'submarine', '9 Sea Zone'],
        ['British', 'destroyer', '8 Sea Zone'],
      ],
    });
    s = move(s, ids(s, 'Germans', 'submarine', '9 Sea Zone'), ['9 Sea Zone', '8 Sea Zone']);
    fails(s, { type: 'move', units: ids(s, 'Germans', 'submarine', '8 Sea Zone'), path: ['8 Sea Zone', '6 Sea Zone'] });
  });

  it('a submarine that entered a zone with an enemy destroyer in noncombat cannot sail on in a second order', () => {
    let s = scenario({
      power: 'Germans',
      phase: 'noncombatMove',
      units: [
        ['Germans', 'submarine', '9 Sea Zone'],
        ['British', 'destroyer', '8 Sea Zone'],
      ],
    });
    s = move(s, ids(s, 'Germans', 'submarine', '9 Sea Zone'), ['9 Sea Zone', '8 Sea Zone']);
    fails(s, { type: 'move', units: ids(s, 'Germans', 'submarine', '8 Sea Zone'), path: ['8 Sea Zone', '6 Sea Zone'] });
  });

  it('a submarine may end a noncombat move in a zone with an enemy destroyer', () => {
    const s = scenario({
      power: 'Germans',
      phase: 'noncombatMove',
      units: [
        ['Germans', 'submarine', '9 Sea Zone'],
        ['British', 'destroyer', '8 Sea Zone'],
      ],
    });
    move(s, ids(s, 'Germans', 'submarine', '9 Sea Zone'), ['9 Sea Zone', '8 Sea Zone']);
  });

  it('surface ships may end a noncombat move in a zone holding only enemy submarines', () => {
    const s = scenario({
      power: 'Germans',
      phase: 'noncombatMove',
      units: [
        ['Germans', 'cruiser', '9 Sea Zone'],
        ['British', 'submarine', '8 Sea Zone'],
      ],
    });
    move(s, ids(s, 'Germans', 'cruiser', '9 Sea Zone'), ['9 Sea Zone', '8 Sea Zone']);
  });
});

describe('air movement: demonstrating a landing for every attacker (p.13)', () => {
  const setup = () =>
    scenario({
      power: 'Americans',
      units: [
        ['Americans', 'fighter', 'Eastern United States', 3],
        ['Americans', 'carrier', '11 Sea Zone'],
        ['Germans', 'destroyer', '13 Sea Zone'],
      ],
    });
  const path = ['Eastern United States', '11 Sea Zone', '10 Sea Zone', '12 Sea Zone', '13 Sea Zone'];

  it('three fighters with no move left cannot all count on one carrier', () => {
    const s = setup();
    fails(s, { type: 'move', units: ids(s, 'Americans', 'fighter', 'Eastern United States'), path });
  });

  it('a later fighter cannot count on carrier room already promised to fighters sent earlier', () => {
    let s = setup();
    const f = ids(s, 'Americans', 'fighter', 'Eastern United States');
    s = move(s, f.slice(0, 2), path);
    fails(s, { type: 'move', units: f.slice(2), path });
  });
  it('the carrier a fighter counted on cannot then sail into a different battle out of the fighter’s reach', () => {
    let s = scenario({
      power: 'Americans',
      units: [
        ['Americans', 'fighter', 'Eastern United States'],
        ['Americans', 'carrier', '11 Sea Zone'],
        ['Germans', 'destroyer', '13 Sea Zone'],
        ['Germans', 'submarine', '10 Sea Zone'],
      ],
    });
    s = move(s, ids(s, 'Americans', 'fighter', 'Eastern United States'), path);
    s = move(s, ids(s, 'Americans', 'carrier', '11 Sea Zone'), ['11 Sea Zone', '10 Sea Zone']);
    fails(s, { type: 'endPhase' });
  });
});

describe('land movement in combat move (p.11-13)', () => {
  it('units cannot end the combat move in a territory a tank blitzed (it is friendly by then)', () => {
    let s = scenario({
      power: 'Germans',
      units: [
        ['Germans', 'armour', 'West Russia'],
        ['Germans', 'infantry', 'Ukraine S.S.R.'],
      ],
    });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus', 'Kazakh S.S.R.']);
    expect(s.owner['Caucasus']).toBe('Germans');
    s = move(s, ids(s, 'Germans', 'infantry', 'Ukraine S.S.R.'), ['Ukraine S.S.R.', 'Caucasus']);
    fails(s, { type: 'endPhase' });
  });

  it('transports cannot offload into friendly territory during combat move', () => {
    const s = scenario({ power: 'Germans', units: [['Germans', 'transport', '5 Sea Zone']] });
    const inf = aboard(s, 'Germans', 'infantry', '5 Sea Zone');
    fails(s, { type: 'move', units: [inf], path: ['5 Sea Zone', 'Norway'] });
  });

  it('a land unit cannot move and then load onto a transport', () => {
    let s = scenario({
      power: 'Germans',
      phase: 'noncombatMove',
      units: [
        ['Germans', 'armour', 'Poland'],
        ['Germans', 'transport', '5 Sea Zone'],
      ],
    });
    s = move(s, ids(s, 'Germans', 'armour', 'Poland'), ['Poland', 'Germany']);
    fails(s, { type: 'move', units: ids(s, 'Germans', 'armour', 'Germany'), path: ['Germany', '5 Sea Zone'] });
  });
});

describe('noncombat movement (p.20-21)', () => {
  it('a fighter may land in a zone where a purchased carrier will be mobilized, and survives once it is', () => {
    let s = scenario({
      power: 'Germans',
      phase: 'noncombatMove',
      units: [
        ['Germans', 'factory', 'Germany'],
        ['Germans', 'fighter', 'Germany'],
      ],
    });
    s.purchases = [{ type: 'carrier', count: 1 }];
    s = move(s, ids(s, 'Germans', 'fighter', 'Germany'), ['Germany', '5 Sea Zone']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'place', unitType: 'carrier', at: '5 Sea Zone', count: 1 });
    s = ok(s, { type: 'endPhase' });
    expect(count(s, 'Germans', 'fighter', '5 Sea Zone')).toBe(1);
  });

  it('a fighter may land on an ally’s carrier', () => {
    const s = scenario({
      power: 'Americans',
      phase: 'noncombatMove',
      units: [
        ['Americans', 'fighter', 'United Kingdom'],
        ['British', 'carrier', '7 Sea Zone'],
      ],
    });
    move(s, ids(s, 'Americans', 'fighter', 'United Kingdom'), ['United Kingdom', '7 Sea Zone']);
  });

  it('land units may move in noncombat into a territory captured this turn', () => {
    let s = scenario({
      power: 'Germans',
      units: [
        ['Germans', 'armour', 'West Russia'],
        ['Germans', 'infantry', 'Ukraine S.S.R.'],
      ],
    });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    s = ok(s, { type: 'endPhase' });
    expect(s.phase).toBe('noncombatMove');
    move(s, ids(s, 'Germans', 'infantry', 'Ukraine S.S.R.'), ['Ukraine S.S.R.', 'Caucasus']);
  });

  it('air units keep only the movement left from combat for noncombat', () => {
    let s = scenario({
      power: 'Germans',
      units: [
        ['Germans', 'fighter', 'Germany'],
        ['Russians', 'infantry', 'Belorussia'],
      ],
    });
    s = move(s, ids(s, 'Germans', 'fighter', 'Germany'), ['Germany', 'Poland', 'Belorussia']);
    s.phase = 'noncombatMove';
    fails(s, {
      type: 'move',
      units: ids(s, 'Germans', 'fighter', 'Belorussia'),
      path: ['Belorussia', 'Poland', 'Germany', 'Italy'],
    });
    move(s, ids(s, 'Germans', 'fighter', 'Belorussia'), ['Belorussia', 'Poland', 'Germany']);
  });
});

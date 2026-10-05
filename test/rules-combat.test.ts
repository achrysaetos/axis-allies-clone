import { describe, expect, it } from 'vitest';
import { simulate } from '../src/ai/eval';
import { STATS } from '../src/engine/data';
import type { GameState, SpaceId } from '../src/engine/types';
import { autoResolve, count, fight, ids, move, ok, scenario } from './helpers';

// Page numbers are the printed pages of the Axis & Allies 1942 Second Edition rulebook (Renegade P2 printing).

const battleIn = (s: GameState, space: SpaceId) => s.battles.find((b) => b.space === space);

describe('antiaircraft artillery (p.16, p.24)', () => {
  it('p.16/p.24 AAA alone in a territory attacked by land and air still fires at the aircraft before it is destroyed', () => {
    let s = scenario({
      units: [
        ['Germans', 'armour', 'West Russia'],
        ['Germans', 'fighter', 'West Russia'],
        ['Russians', 'aaGun', 'Caucasus'],
      ],
      dice: [1],
    });
    s = move(s, ids(s, 'Germans', 'fighter', 'West Russia'), ['West Russia', 'Caucasus']);
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    s = ok(s, { type: 'endPhase' });
    const b = battleIn(s, 'Caucasus');
    expect(b, 'attacking AAA-only Caucasus with a fighter is a battle in which the AAA fires').toBeDefined();
    s = autoResolve(ok(s, { type: 'startBattle', battle: b!.id }));
    expect(battleIn(s, 'Caucasus')!.dice[0]).toMatchObject({ label: 'aa', rolls: [1], hits: 1 });
    expect(count(s, 'Germans', 'fighter', 'Caucasus')).toBe(0);
    expect(count(s, 'Russians', 'aaGun', 'Caucasus')).toBe(0);
    expect(s.owner['Caucasus']).toBe('Germans');
  });

  it('p.24 when only aircraft attack lone AAA, a plane must survive the AAA fire to destroy it', () => {
    let s = scenario({
      units: [
        ['Germans', 'fighter', 'West Russia'],
        ['Russians', 'aaGun', 'Caucasus'],
      ],
      dice: [1],
    });
    s = move(s, ids(s, 'Germans', 'fighter', 'West Russia'), ['West Russia', 'Caucasus']);
    s = fight(s, 'Caucasus');
    expect(count(s, 'Germans', 'fighter', 'Caucasus')).toBe(0);
    expect(count(s, 'Russians', 'aaGun', 'Caucasus')).toBe(1);
    expect(s.owner['Caucasus']).toBe('Russians');
  });

  it('p.24 the attacker chooses which air unit an AAA hit destroys', () => {
    let s = scenario({
      units: [
        ['Germans', 'fighter', 'West Russia'],
        ['Germans', 'bomber', 'Germany'],
        ['Germans', 'armour', 'West Russia'],
        ['Russians', 'infantry', 'Caucasus'],
        ['Russians', 'aaGun', 'Caucasus'],
      ],
      dice: [1, 6],
    });
    s = move(s, ids(s, 'Germans', 'fighter', 'West Russia'), ['West Russia', 'Caucasus']);
    s = move(s, ids(s, 'Germans', 'bomber', 'Germany'), ['Germany', 'Poland', 'Ukraine S.S.R.', 'Caucasus']);
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Caucasus']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: battleIn(s, 'Caucasus')!.id });
    expect(s.pending).toMatchObject({ kind: 'casualties', side: 'attacker', power: 'Germans', reason: 'aa' });
    s = ok(s, { type: 'casualties', units: ids(s, 'Germans', 'bomber', 'Caucasus') });
    expect(count(s, 'Germans', 'bomber', 'Caucasus')).toBe(0);
    expect(count(s, 'Germans', 'fighter', 'Caucasus')).toBe(1);
  });
});

describe('aircraft carriers (p.12, p.26)', () => {
  it('p.12/p.26 the owner’s fighters on an attacking carrier launch before combat and are not lost when it sinks', () => {
    let s = scenario({
      power: 'British',
      units: [
        ['British', 'carrier', '13 Sea Zone'],
        ['British', 'fighter', '13 Sea Zone'],
        ['Germans', 'submarine', '12 Sea Zone'],
      ],
      dice: [1],
    });
    s = move(s, ids(s, 'British', 'carrier', '13 Sea Zone'), ['13 Sea Zone', '12 Sea Zone']);
    s = fight(s, '12 Sea Zone');
    expect(count(s, 'British', 'carrier', '12 Sea Zone')).toBe(0);
    expect(s.units.filter((u) => u.owner === 'British' && u.type === 'fighter')).toHaveLength(1);
  });

  it('carriers take one hit in 1942 Second Edition; battleships take two (p.27)', () => {
    expect(STATS.carrier.hitPoints).toBe(1);
    expect(STATS.battleship.hitPoints).toBe(2);
  });
});

describe('strategic bombing (p.14, p.23)', () => {
  it('each surviving bomber does one die of damage, with no +2', () => {
    let s = scenario({
      power: 'British',
      units: [
        ['British', 'bomber', 'United Kingdom'],
        ['Germans', 'factory', 'Germany'],
      ],
      dice: [2, 3],
    });
    s = move(s, ids(s, 'British', 'bomber', 'United Kingdom'), ['United Kingdom', '6 Sea Zone', '5 Sea Zone', 'Germany'], {
      sbr: true,
    });
    s = fight(s, 'Germany');
    expect(s.units.find((u) => u.type === 'factory')!.damage).toBe(3);
  });

  it('a raiding bomber takes no part in the land battle in the same territory', () => {
    let s = scenario({
      power: 'British',
      owners: { 'Northwestern Europe': 'British' },
      units: [
        ['British', 'bomber', 'United Kingdom'],
        ['British', 'infantry', 'Northwestern Europe'],
        ['Germans', 'factory', 'Germany'],
        ['Germans', 'infantry', 'Germany'],
      ],
      dice: [6, 1],
    });
    s = move(s, ids(s, 'British', 'bomber', 'United Kingdom'), ['United Kingdom', '6 Sea Zone', '5 Sea Zone', 'Germany'], {
      sbr: true,
    });
    s = move(s, ids(s, 'British', 'infantry', 'Northwestern Europe'), ['Northwestern Europe', 'Germany']);
    s = ok(s, { type: 'endPhase' });
    s = autoResolve(ok(s, { type: 'startBattle', battle: s.battles.find((b) => b.kind === 'sbr')!.id }));
    s.scriptedDice = [6, 6];
    s = ok(s, { type: 'startBattle', battle: s.battles.find((b) => b.kind === 'land')!.id });
    expect(s.battles.find((b) => b.kind === 'land')!.attackers).toEqual(ids(s, 'British', 'infantry', 'Germany'));
  });
});

describe('general combat values (p.23-24)', () => {
  it('artillery does not support infantry on defense', () => {
    let s = scenario({
      units: [
        ['Germans', 'armour', 'West Russia'],
        ['Russians', 'infantry', 'Archangel'],
        ['Russians', 'artillery', 'Archangel'],
      ],
      dice: [6, 6, 6],
    });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Archangel']);
    s = fight(s, 'Archangel', { retreat: 'West Russia' });
    const def = battleIn(s, 'Archangel')!.dice.find((d) => d.side === 'defender')!;
    expect(def.targets).toEqual([2, 2]);
  });
});

describe('odds and AI simulation mirror the engine (src/ai/eval.ts)', () => {
  it('p.15 units hit by bombardment still fire back in the land combat', () => {
    // A 6-value bombardment always hits; the defending infantry should still get its 2-in-6 return shot.
    const odds = simulate({
      kind: 'land',
      attackers: [{ type: 'infantry', damage: 0 }],
      defenders: [{ type: 'infantry', damage: 0 }],
      bombard: [6],
      trials: 3000,
    });
    expect(odds.win).toBeLessThan(0.8);
    expect(odds.attLoss).toBeGreaterThan(0.5);
  });

  it('p.24 lone AAA still fires at attacking aircraft in the simulation', () => {
    const odds = simulate({
      kind: 'land',
      attackers: [
        { type: 'armour', damage: 0 },
        { type: 'fighter', damage: 0 },
      ],
      defenders: [{ type: 'aaGun', damage: 0 }],
      trials: 3000,
    });
    expect(odds.attLoss).toBeGreaterThan(0.5);
  });

  it('submarines cannot hit aircraft and aircraft cannot hit submarines without a destroyer', () => {
    const odds = simulate({
      kind: 'sea',
      attackers: [{ type: 'fighter', damage: 0 }],
      defenders: [{ type: 'submarine', damage: 0 }],
      trials: 500,
    });
    expect(odds).toEqual({ win: 0, attLoss: 0, defLoss: 0 });
  });
});

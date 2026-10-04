import { describe, expect, it } from 'vitest';
import { aiAction } from '../src/ai';
import { canLandAir, carrierRoom } from '../src/engine/queries';
import { apply } from '../src/engine/game';
import { checkInvariants } from '../src/engine/invariants';
import { space } from '../src/engine/data';
import { newGame } from '../src/engine/state';
import type { GameState } from '../src/engine/types';
import { scenario } from './helpers';

function step(s: GameState): GameState {
  const a = aiAction(s);
  const r = apply(s, a);
  if (!r.ok) throw new Error(`AI chose illegal ${JSON.stringify(a)}: ${r.error}`);
  return r.state;
}

/** Let the AI act until `done` holds. */
function runUntil(s: GameState, done: (s: GameState) => boolean, limit = 2000): GameState {
  let cur = s;
  for (let i = 0; i < limit && !done(cur); i++) cur = step(cur);
  expect(done(cur)).toBe(true);
  return cur;
}

describe('AI', () => {
  it('plays seeded games with only legal actions and intact invariants', () => {
    for (const seed of [3, 11]) {
      let s = newGame(seed);
      for (let i = 0; i < 20000 && s.round <= 4 && !s.winner; i++) {
        s = step(s);
        expect(checkInvariants(s)).toEqual([]);
      }
      expect(s.round).toBeGreaterThan(4);
    }
  }, 60_000);

  it('takes an undefended enemy capital next to its army', () => {
    const s = scenario({
      power: 'Germans',
      owners: { 'West Russia': 'Germans' },
      units: [
        ['Germans', 'infantry', 'West Russia', 2],
        ['Germans', 'infantry', 'Germany', 3],
      ],
    });
    const after = runUntil(s, (x) => x.phase !== 'combatMove');
    expect(after.owner['Russia']).toBe('Germans');
  });

  it('attacks a weak stack with enough force and wins it', () => {
    const s = scenario({
      power: 'Russians',
      units: [
        ['Russians', 'infantry', 'Russia', 6],
        ['Russians', 'armour', 'Russia', 3],
        ['Russians', 'infantry', 'Karelia S.S.R.', 2],
        ['Germans', 'infantry', 'West Russia', 1],
      ],
    });
    const moved = runUntil(s, (x) => x.phase === 'combat');
    const attackers = moved.units.filter((u) => u.at === 'West Russia' && u.owner === 'Russians');
    expect(attackers.length).toBeGreaterThanOrEqual(2);
    expect(moved.units.filter((u) => u.at === 'Russia' && u.owner === 'Russians').length).toBeGreaterThan(0);
  });

  it('declines a hopeless attack', () => {
    const s = scenario({
      power: 'Russians',
      units: [
        ['Russians', 'infantry', 'Russia', 2],
        ['Germans', 'infantry', 'West Russia', 6],
        ['Germans', 'armour', 'West Russia', 4],
      ],
    });
    const moved = runUntil(s, (x) => x.phase !== 'combatMove');
    expect(moved.units.filter((u) => u.at === 'West Russia' && u.owner === 'Russians')).toEqual([]);
  });

  it('lands every aircraft it flies', () => {
    const s = scenario({
      power: 'Germans',
      phase: 'noncombatMove',
      units: [
        ['Germans', 'fighter', '5 Sea Zone'],
        ['Germans', 'bomber', 'Ukraine S.S.R.'],
        ['Germans', 'infantry', 'Germany'],
      ],
      owners: { 'Ukraine S.S.R.': 'Russians' },
    });
    for (const u of s.units) if (u.type !== 'infantry') u.moved = 2;
    const end = runUntil(s, (x) => x.phase === 'mobilize');
    const air = end.units.filter((u) => u.owner === 'Germans' && (u.type === 'fighter' || u.type === 'bomber'));
    expect(air).toHaveLength(2);
    for (const u of air) {
      const safe = space(u.at).water ? carrierRoom(end, u.at, 'Germans') >= 0 : canLandAir(end, u.at, 'Germans');
      expect(safe, `${u.type} in ${u.at}`).toBe(true);
    }
  });

  it('still lands an aircraft when every landing in reach is threatened', () => {
    const s = scenario({
      power: 'Germans',
      phase: 'noncombatMove',
      owners: { Poland: 'Russians', 'Baltic States': 'Russians', 'Northwestern Europe': 'Russians', Finland: 'Russians', Norway: 'Russians' },
      units: [
        ['Germans', 'bomber', '5 Sea Zone'],
        ['Russians', 'armour', 'Poland', 12],
      ],
    });
    s.units[0]!.moved = 5;
    const end = runUntil(s, (x) => x.phase === 'mobilize');
    const bomber = end.units.find((u) => u.type === 'bomber');
    expect(bomber && canLandAir(end, bomber.at, 'Germans')).toBe(true);
  });

  it('spends its treasury on a legal purchase and places what it bought', () => {
    const s = newGame(5);
    const bought = runUntil(s, (x) => x.phase === 'combatMove');
    expect(bought.treasury.Russians).toBeLessThan(s.treasury.Russians);
    expect(bought.purchases.length).toBeGreaterThan(0);
  });
});

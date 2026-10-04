import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { newSession, parseSession, quickResolve } from '../src/ui/session';
import { POWERS } from '../src/engine/types';
import { ids, move, ok, scenario } from './helpers';

describe('saved games', () => {
  it('older saves load with fields added since they were written', () => {
    const state = newGame(1) as unknown as Record<string, unknown>;
    delete state.hostileSeaAtTurnStart;
    delete state.mobilized;
    state.battles = [{ id: 1, space: 'France', dice: [{ side: 'attacker', label: 'any', rolls: [3], hits: 1 }] }];
    const s = parseSession(JSON.stringify({ version: 1, state, controllers: {} }));
    if (typeof s === 'string') throw new Error(s);
    expect(s.state.mobilized).toEqual([]);
    expect(s.state.hostileSeaAtTurnStart).toEqual([]);
    expect(s.state.battles[0]!.dice[0]!).toMatchObject({ round: 1, targets: [] });
    expect(s.controllers.Germans).toBe('human');
  });

  it('rejects files that are not saved games', () => {
    expect(parseSession('{"hello":1}')).toMatch(/not a saved game/);
    expect(parseSession('nope')).toMatch(/not a JSON file/);
  });
});

describe('quick resolve', () => {
  it('fights a battle to the end with default choices for both sides', () => {
    let s = scenario({
      units: [
        ['Germans', 'armour', 'West Russia', 3],
        ['Germans', 'infantry', 'West Russia', 2],
        ['Russians', 'infantry', 'Archangel', 3],
      ],
    });
    s = move(
      s,
      [...ids(s, 'Germans', 'armour', 'West Russia'), ...ids(s, 'Germans', 'infantry', 'West Russia')],
      ['West Russia', 'Archangel'],
    );
    s = ok(s, { type: 'endPhase' });
    const session = newSession(s, Object.fromEntries(POWERS.map((p) => [p, 'human'])) as Parameters<typeof newSession>[1]);
    const r = quickResolve(session, s.battles[0]!.id);
    if (!r.ok) throw new Error(r.error);
    expect(r.session.state.battles[0]!.resolved).toBe(true);
    expect(r.session.state.pending).toBeNull();
    expect(r.session.state.battles[0]!.dice.length).toBeGreaterThan(0);
  });
});

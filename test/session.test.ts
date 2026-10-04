import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { parseSession } from '../src/ui/session';

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

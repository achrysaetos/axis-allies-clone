import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { cuesBetween } from '../src/ui/sound';

describe('sound cues', () => {
  const s = newGame(1);

  it('stays silent when nothing changed', () => {
    expect(cuesBetween(s, s)).toEqual([]);
  });

  it('a move is a drop', () => {
    const next = { ...s, units: s.units.map((u, i) => (i === 0 ? { ...u, at: 'Archangel' } : u)) };
    expect(cuesBetween(s, next)).toEqual(['drop']);
  });

  it('a roll that kills and captures plays dice, then the blast, then the flag, and no drop', () => {
    const b = {
      ...s.battles[0],
      dice: [{ round: 1, side: 'attacker' as const, label: '', rolls: [3, 5], targets: [3, 3], hits: 1 }],
    };
    const dead = s.units.find((u) => u.type === 'infantry')!;
    const next = {
      ...s,
      battles: [b as (typeof s.battles)[number]],
      units: s.units.filter((u) => u.id !== dead.id).map((u, i) => (i === 0 ? { ...u, at: 'Archangel' } : u)),
      owner: { ...s.owner, [dead.at]: s.owner[dead.at] === 'Germans' ? 'Russians' : 'Germans' },
    } as typeof s;
    expect(cuesBetween(s, next)).toEqual(['dice', 'hit', 'capture']);
  });

  it('a new power to move chimes, and a win fanfares', () => {
    expect(cuesBetween(s, { ...s, power: 'Germans' })).toEqual(['turn']);
    expect(cuesBetween(s, { ...s, winner: 'Axis' })).toEqual(['victory']);
  });
});

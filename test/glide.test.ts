import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { CENTER, MAP_WIDTH } from '../src/ui/map/geometry';
import { glideKey, glidesBetween } from '../src/ui/map/glide';

describe('glides', () => {
  const s = newGame(1);
  const inf = s.units.find((u) => u.at === 'Karelia S.S.R.' && u.type === 'infantry')!;

  it('a unit that moved slides in from its old space', () => {
    const next = s.units.map((u) => (u.id === inf.id ? { ...u, at: 'Archangel' } : u));
    const [ax, ay] = CENTER.get('Karelia S.S.R.')!;
    const [bx, by] = CENTER.get('Archangel')!;
    expect(glidesBetween(s.units, next)).toEqual(new Map([[glideKey('Archangel', inf.owner, 'infantry'), [ax - bx, ay - by]]]));
  });

  it('nothing slides when nothing moved, and new units do not slide', () => {
    expect(glidesBetween(s.units, s.units).size).toBe(0);
    expect(glidesBetween(s.units, [...s.units, { ...inf, id: 99999 }]).size).toBe(0);
  });

  it('a move across the map edge takes the short way round', () => {
    const ids = [...CENTER.keys()];
    const west = ids.reduce((a, b) => (CENTER.get(a)![0] < CENTER.get(b)![0] ? a : b));
    const east = ids.reduce((a, b) => (CENTER.get(a)![0] > CENTER.get(b)![0] ? a : b));
    const next = s.units.map((u) => (u.id === inf.id ? { ...u, at: east } : u));
    const prev = s.units.map((u) => (u.id === inf.id ? { ...u, at: west } : u));
    const [dx] = glidesBetween(prev, next).values().next().value!;
    expect(Math.abs(dx)).toBeLessThan(MAP_WIDTH / 2);
  });
});

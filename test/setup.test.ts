import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { income, victoryCities } from '../src/engine/queries';
import { CAPITAL_OF, VICTORY_CITIES, space } from '../src/engine/data';
import { POWERS } from '../src/engine/types';

describe('setup (rulebook p.6 with FAQ errata)', () => {
  const s = newGame();

  it('starting income and treasury match the errata chart', () => {
    const expected = { Russians: 24, Germans: 41, British: 31, Japanese: 30, Americans: 42 };
    for (const p of POWERS) {
      expect(income(s, p), p).toBe(expected[p]);
      expect(s.treasury[p], p).toBe(expected[p]);
    }
  });

  it('thirteen victory cities: Axis six, Allies seven including Honolulu', () => {
    expect(VICTORY_CITIES).toHaveLength(13);
    expect(victoryCities(s, 'Axis')).toBe(6);
    expect(victoryCities(s, 'Allies')).toBe(7);
    expect(VICTORY_CITIES).toContain('Hawaiian Islands');
  });

  it('capitals are Moscow, Berlin, London, Tokyo and Washington', () => {
    expect(CAPITAL_OF).toEqual({
      Russians: 'Russia',
      Germans: 'Germany',
      British: 'United Kingdom',
      Japanese: 'Japan',
      Americans: 'Eastern United States',
    });
  });

  it('the board wraps horizontally at the listed edges', () => {
    const adj = (a: string, b: string) => space(a).neighbors.includes(b) && space(b).neighbors.includes(a);
    expect(adj('Western Canada', 'Eastern Canada')).toBe(true);
    expect(adj('Western United States', 'Central United States')).toBe(true);
    expect(adj('Mexico', 'East Mexico')).toBe(true);
    expect(adj('55 Sea Zone', '19 Sea Zone')).toBe(true);
    expect(adj('42 Sea Zone', '20 Sea Zone')).toBe(true);
    expect(adj('41 Sea Zone', '21 Sea Zone')).toBe(true);
  });

  it('every unit starts in a space its owner can occupy', () => {
    for (const u of s.units) {
      const def = space(u.at);
      const seaUnit = ['transport', 'submarine', 'destroyer', 'cruiser', 'carrier', 'battleship'].includes(u.type);
      if (seaUnit) expect(def.water, `${u.type} in ${u.at}`).toBe(true);
      else if (u.type !== 'fighter') expect(def.water, `${u.type} in ${u.at}`).toBe(false);
    }
  });
});

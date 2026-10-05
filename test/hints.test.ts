import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { hintFor } from '../src/ui/hints';

describe('hint line', () => {
  const s = newGame(1);

  it('speaks in the gestures of the device', () => {
    expect(hintFor(s, { kind: 'me' }, false, false)).toMatch(/shift-click/);
    expect(hintFor(s, { kind: 'me' }, false, true)).toMatch(/^Tap units/);
    expect(hintFor({ ...s, phase: 'combat', battles: [{ resolved: false } as never] }, { kind: 'me' }, false, true)).toBe(
      'Tap a ⚔ to fight that battle.',
    );
  });

  it('says who is playing, or that nobody holds the seat, before anything about the phase', () => {
    expect(hintFor(s, { kind: 'other', who: 'Germany (Alex)' }, true, false)).toBe('Germany (Alex) is playing…');
    expect(hintFor(s, { kind: 'empty' }, false, false)).toMatch(/^Nobody holds Soviet Union yet/);
  });

  it('a held hand comes before the phase, and a power without its capital gets no buying hint', () => {
    expect(hintFor(s, { kind: 'me' }, true, false)).toMatch(/^Drop on a highlighted space/);
    expect(hintFor({ ...s, owner: { ...s.owner, Russia: 'Germans' } }, { kind: 'me' }, false, false)).toBeUndefined();
  });

  it('names the winner once the game is over', () => {
    expect(hintFor({ ...s, winner: 'Axis' }, { kind: 'me' }, false, false)).toBe(
      'The Axis won. Open the ☰ menu for a new game.',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { apply } from '../src/engine/game';
import { resolveMove } from '../src/ui/paths';
import { scenario } from './helpers';

describe('moving a mixed selection', () => {
  it('a carrier, its fighter and an escort move together; the fighter takes off first so it can fight', () => {
    let s = scenario({
      power: 'Japanese',
      units: [
        ['Japanese', 'carrier', '50 Sea Zone'],
        ['Japanese', 'fighter', '50 Sea Zone'],
        ['Japanese', 'cruiser', '50 Sea Zone'],
        ['Americans', 'destroyer', '51 Sea Zone'],
      ],
    });
    const r = resolveMove(
      s,
      { units: s.units.filter((u) => u.owner === 'Japanese').map((u) => u.id), sbr: false },
      '50 Sea Zone',
      '51 Sea Zone',
    );
    if (!r.ok) throw new Error(r.error);
    for (const m of r.moves) {
      const next = apply(s, { type: 'move', units: m.units, path: m.path });
      if (!next.ok) throw new Error(next.error);
      s = next.state;
    }
    const fighter = s.units.find((u) => u.type === 'fighter')!;
    expect(fighter.at).toBe('51 Sea Zone');
    expect(fighter.carriedBy).toBeNull();
  });
});

describe('raids', () => {
  it('a raid applies only against an enemy industrial complex; elsewhere bombers simply attack', () => {
    const s = scenario({
      units: [
        ['Germans', 'bomber', 'Germany'],
        ['British', 'factory', 'United Kingdom'],
        ['Russians', 'infantry', 'Karelia S.S.R.'],
      ],
    });
    const bomber = s.units.filter((u) => u.type === 'bomber').map((u) => u.id);
    const raid = resolveMove(s, { units: bomber, sbr: true }, 'Germany', 'United Kingdom');
    const attack = resolveMove(s, { units: bomber, sbr: true }, 'Germany', 'Karelia S.S.R.');
    if (!raid.ok || !attack.ok) throw new Error('both moves should be legal');
    expect(raid.moves[0]!.sbr).toBe(true);
    expect(attack.moves[0]!.sbr).toBeUndefined();
  });
});

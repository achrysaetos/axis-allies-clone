import { describe, expect, it } from 'vitest';
import { space } from '../src/engine/data';
import { dropMoves, grabbable, handReach, shipmates, stacksAt } from '../src/ui/pieces';
import { ids, move, scenario } from './helpers';

const RUSSIAN_LAND = ['Russia', 'Archangel', 'Vologda', 'Karelia S.S.R.', 'Novosibirsk', 'Kazakh S.S.R.', 'Caucasus'];

describe('pieces on the board', () => {
  it('a dropped stack sends the units that can reach and leaves the rest behind', () => {
    let s = scenario({ power: 'Russians', phase: 'noncombatMove', units: [['Russians', 'armour', 'Russia', 2]] });
    const [tired, fresh] = ids(s, 'Russians', 'armour', 'Russia') as [number, number];
    const hop = space('Russia').neighbors.find((n) => RUSSIAN_LAND.includes(n))!;
    s = move(s, [tired], ['Russia', hop]);
    s = move(s, [tired], [hop, 'Russia']);
    const far = RUSSIAN_LAND.find(
      (t) =>
        t !== 'Russia' &&
        !space('Russia').neighbors.includes(t) &&
        space('Russia').neighbors.some((n) => RUSSIAN_LAND.includes(n) && space(n).neighbors.includes(t)),
    )!;

    const r = dropMoves(s, [tired, fresh], 'Russia', far, false);

    if (!r.ok) throw new Error(r.error);
    expect(r.moves.flatMap((m) => m.units)).toEqual([fresh]);
  });

  it('pieces that can no longer move are their own faded stack and cannot be picked up', () => {
    let s = scenario({ power: 'Russians', phase: 'noncombatMove', units: [['Russians', 'infantry', 'Russia', 3]] });
    const [first] = ids(s, 'Russians', 'infantry', 'Russia') as [number];
    const hop = space('Russia').neighbors.find((n) => RUSSIAN_LAND.includes(n))!;
    s = move(s, [first], ['Russia', hop]);
    s = move(s, ids(s, 'Russians', 'infantry', 'Russia'), ['Russia', hop]);

    const stacks = stacksAt(
      s,
      s.units.filter((u) => u.at === hop),
    );

    expect(stacks.map((st) => [st.units.length, st.spent])).toEqual([[3, true]]);
    expect(grabbable(s, stacks[0]!)).toEqual([]);
  });

  it('cargo aboard a transport can be picked up and dropped on a coast to land it', () => {
    let s = scenario({
      power: 'British',
      phase: 'noncombatMove',
      units: [
        ['British', 'transport', '6 Sea Zone'],
        ['British', 'infantry', 'United Kingdom'],
      ],
    });
    s = move(s, ids(s, 'British', 'infantry', 'United Kingdom'), ['United Kingdom', '6 Sea Zone']);
    const cargo = stacksAt(
      s,
      s.units.filter((u) => u.at === '6 Sea Zone'),
    ).find((st) => st.carried)!;

    expect(cargo.spent).toBe(false);
    const r = dropMoves(s, grabbable(s, cargo), '6 Sea Zone', 'United Kingdom', false);
    expect(r.ok).toBe(true);
  });

  it('fighters on a carrier sailing into an attack take off and fight', () => {
    const s = scenario({
      power: 'Japanese',
      units: [
        ['Japanese', 'carrier', '50 Sea Zone'],
        ['Japanese', 'fighter', '50 Sea Zone', 2],
        ['Americans', 'destroyer', '51 Sea Zone'],
      ],
    });
    const carrier = ids(s, 'Japanese', 'carrier', '50 Sea Zone');
    const after = s.units.filter((u) => u.type === 'fighter').map((u) => ({ ...u, carriedBy: carrier[0]! }));
    const t = { ...s, units: [...s.units.filter((u) => u.type !== 'fighter'), ...after] };

    const r = dropMoves(t, carrier, '50 Sea Zone', '51 Sea Zone', false);

    if (!r.ok) throw new Error(r.error);
    const moved = new Set(r.moves.flatMap((m) => m.units));
    expect(after.every((f) => moved.has(f.id))).toBe(true);
    expect(r.moves[0]!.units.every((id) => after.some((f) => f.id === id))).toBe(true);
  });

  it('cargo dropped on a far coast sails its transport there first, and lifts its shipmates too', () => {
    let s = scenario({
      power: 'British',
      phase: 'noncombatMove',
      units: [
        ['British', 'transport', '6 Sea Zone'],
        ['British', 'infantry', 'United Kingdom'],
        ['British', 'armour', 'United Kingdom'],
      ],
    });
    s = move(s, ids(s, 'British', 'infantry', 'United Kingdom'), ['United Kingdom', '6 Sea Zone']);
    s = move(s, ids(s, 'British', 'armour', 'United Kingdom'), ['United Kingdom', '6 Sea Zone']);
    const hand = shipmates(s, ids(s, 'British', 'infantry', '6 Sea Zone'));
    expect(hand).toHaveLength(2);
    const far = handReach(s, hand, '6 Sea Zone');
    const coast = [...far].find((id) => !space(id).water && !space('6 Sea Zone').neighbors.includes(id))!;
    expect(coast).toBeDefined();

    const r = dropMoves(s, hand, '6 Sea Zone', coast, false);

    if (!r.ok) throw new Error(r.error);
    expect(r.moves[0]!.units).toEqual(ids(s, 'British', 'transport', '6 Sea Zone'));
    expect(r.moves.at(-1)!.path.at(-1)).toBe(coast);
  });

  it('a stack dropped on a transport loads what fits and leaves the rest ashore', () => {
    const s = scenario({
      power: 'British',
      phase: 'noncombatMove',
      units: [
        ['British', 'transport', '6 Sea Zone'],
        ['British', 'infantry', 'United Kingdom', 3],
      ],
    });

    const r = dropMoves(s, ids(s, 'British', 'infantry', 'United Kingdom'), 'United Kingdom', '6 Sea Zone', false);

    if (!r.ok) throw new Error(r.error);
    expect(r.moves.flatMap((m) => m.units)).toHaveLength(2);
  });
});

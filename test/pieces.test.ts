import { describe, expect, it } from 'vitest';
import { space } from '../src/engine/data';
import { dropMoves, grabbable, stacksAt } from '../src/ui/pieces';
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
});

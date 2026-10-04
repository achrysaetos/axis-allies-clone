import { CAPITAL_OF, space } from './data';
import { areAllied } from './queries';
import type { GameState, Power, SpaceId } from './types';

/** Transfer control of a land territory to the capturing power's side, applying liberation and capital rules. */
export function captureTerritory(draft: GameState, id: SpaceId, by: Power): void {
  const def = space(id);
  const previous = draft.owner[id];
  const original = def.originalOwner;
  let newOwner: Power = by;
  if (original && original !== by && areAllied(original, by)) {
    const cap = draft.owner[CAPITAL_OF[original]];
    if (id === CAPITAL_OF[original] || (cap !== undefined && areAllied(cap, original))) newOwner = original;
  }
  draft.owner[id] = newOwner;
  draft.units = draft.units.filter((u) => !(u.at === id && u.type === 'aaGun' && !areAllied(u.owner, by)));
  for (const u of draft.units) if (u.at === id && u.type === 'factory') u.owner = newOwner;
  if (!draft.capturedThisTurn.includes(id)) draft.capturedThisTurn.push(id);
  draft.log.push(newOwner === by ? `${by} captures ${id}` : `${by} liberates ${id} for ${newOwner}`);

  const capitalOf = def.capital as Power | null;
  if (!capitalOf || previous === undefined) return;
  if (!areAllied(capitalOf, by)) {
    const plunder = draft.treasury[capitalOf];
    draft.treasury[by] += plunder;
    draft.treasury[capitalOf] = 0;
    draft.log.push(`${by} seizes ${plunder} IPCs from ${capitalOf}`);
  } else if (!areAllied(previous, by)) {
    for (const [t, o] of Object.entries(draft.owner)) {
      if (space(t).originalOwner === capitalOf && o !== capitalOf && areAllied(o, capitalOf)) {
        draft.owner[t] = capitalOf;
        for (const u of draft.units) if (u.at === t && u.type === 'factory') u.owner = capitalOf;
      }
    }
  }
}

import { space } from '../../engine/data';
import { apply } from '../../engine/game';
import { UNIT_TYPES } from '../../engine/types';
import type { Action, GameState, SpaceId, UnitType } from '../../engine/types';
import { UNIT_GLYPH } from '../theme';
import { Chip } from '../units';

export interface PlacementOption {
  at: SpaceId;
  max: number;
}

export function placementOptions(state: GameState, type: UnitType): PlacementOption[] {
  const left = state.purchases.find((p) => p.type === type)?.count ?? 0;
  if (left === 0) return [];
  const factories = state.units.filter((u) => u.type === 'factory' && u.owner === state.power).map((u) => u.at);
  const candidates =
    type === 'factory'
      ? Object.entries(state.owner)
          .filter(([, o]) => o === state.power)
          .map(([id]) => id)
      : [...new Set(factories.flatMap((f) => [f, ...space(f).neighbors.filter((n) => space(n).water)]))];
  const out: PlacementOption[] = [];
  for (const at of candidates) {
    for (let n = left; n >= 1; n--) {
      if (apply(state, { type: 'place', unitType: type, at, count: n }).ok) {
        out.push({ at, max: n });
        break;
      }
    }
  }
  return out;
}

/** Every type bought this turn, in a stable order, so rows do not jump as units are placed. */
function bought(state: GameState): { type: UnitType; left: number; placed: number }[] {
  const placed = state.units.filter((u) => state.mobilized.includes(u.id));
  return UNIT_TYPES.map((t) => ({
    type: t,
    left: state.purchases.find((p) => p.type === t)?.count ?? 0,
    placed: placed.filter((u) => u.type === t).length,
  })).filter((r) => r.left + r.placed > 0);
}

interface Props {
  state: GameState;
  type: UnitType | null;
  options: PlacementOption[];
  onType: (t: UnitType) => void;
  act: (a: Action) => boolean;
}

export function MobilizePanel({ state, type, options, onType, act }: Props) {
  return (
    <section className="panel">
      <h3>Mobilize</h3>
      {state.purchases.length === 0 ? (
        <div className="hint">Everything is placed. End the turn.</div>
      ) : (
        <div className="dim">Pick a unit, then click a highlighted space or use a button below. Unplaced units are refunded.</div>
      )}
      {bought(state).map(({ type: t, left, placed }) => (
        <label key={t} className={t === type ? 'row picked' : left === 0 ? 'row dim' : 'row'}>
          <input type="radio" name="place-type" disabled={left === 0} checked={t === type} onChange={() => onType(t)} />
          <Chip owner={state.power} type={t} />
          <span className="grow">{UNIT_GLYPH[t].name}</span>
          <span>{left === 0 ? `all ${placed} placed` : `${left} left`}</span>
        </label>
      ))}
      {type && options.length === 0 && state.purchases.some((p) => p.type === type) && (
        <div className="bad">No space can take a {UNIT_GLYPH[type].name.toLowerCase()} right now.</div>
      )}
      {type &&
        options.map((o) => (
          <div key={o.at} className="row">
            <span className="grow">{o.at}</span>
            <button onClick={() => act({ type: 'place', unitType: type, at: o.at, count: 1 })}>Place 1</button>
            {o.max > 1 && (
              <button onClick={() => act({ type: 'place', unitType: type, at: o.at, count: o.max })}>Place {o.max}</button>
            )}
          </div>
        ))}
    </section>
  );
}

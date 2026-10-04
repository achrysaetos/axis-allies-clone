import type { MouseEvent as ReactMouseEvent } from 'react';
import { CAPITAL_OF, STATS, isSea, space } from '../../engine/data';
import { apply, productionCapacity } from '../../engine/game';
import { capitalHeld } from '../../engine/queries';
import { UNIT_TYPES } from '../../engine/types';
import type { Action, GameState, Purchase, SpaceId, UnitType } from '../../engine/types';
import { UnitSvg } from '../icons';
import type { Hand } from '../pieces';
import { POWER_STYLE, UNIT_GLYPH } from '../theme';

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

const countOf = (state: GameState, t: UnitType) => state.purchases.find((p) => p.type === t)?.count ?? 0;

/** The purchase chart: click a unit to buy one, right-click to take it back. */
export function BuyTray({ state, act }: { state: GameState; act: (a: Action) => boolean }) {
  const power = state.power;
  const style = POWER_STYLE[power];
  const spent = state.purchases.reduce((n, p) => n + STATS[p.type].cost * p.count, 0);
  const left = state.treasury[power] - spent;
  const capacity = productionCapacity(state, power);
  const units = state.purchases.filter((p) => p.type !== 'factory').reduce((n, p) => n + p.count, 0);
  const ships = state.purchases.filter((p) => isSea(p.type)).reduce((n, p) => n + p.count, 0);
  const room = (t: UnitType) =>
    t === 'factory' ? Infinity : Math.min(capacity.total - units, isSea(t) ? capacity.coastal - ships : Infinity);
  const setCount = (t: UnitType, count: number) => {
    const next: Purchase[] = UNIT_TYPES.map((type) => ({ type, count: type === t ? count : countOf(state, type) })).filter(
      (p) => p.count > 0,
    );
    act({ type: 'buy', purchases: next });
  };
  const damaged = state.units.filter((u) => u.type === 'factory' && u.owner === power && u.damage > 0);
  if (!capitalHeld(state, power))
    return (
      <div className="tray">
        <div className="tray-head">
          <span>
            {CAPITAL_OF[power]} has fallen, so nothing can be bought or repaired until it is freed. End the phase to fight on.
          </span>
        </div>
      </div>
    );
  return (
    <div className="tray">
      <div className="tray-head">
        <strong className={left < 0 ? 'bad' : undefined}>{left}</strong>
        <span className="dim">IPCs left</span>
        <span className="dim" title="How many units your industrial complexes can place this turn">
          · {units} of {capacity.total} units your factories can place
        </span>
        {state.purchases.length > 0 && (
          <button className="link" onClick={() => act({ type: 'buy', purchases: [] })}>
            clear
          </button>
        )}
        {damaged.map((f) => (
          <button
            key={f.id}
            disabled={left < 1}
            onClick={() => act({ type: 'repair', factory: f.id, amount: Math.min(f.damage, left) })}
          >
            Repair {f.at} ({f.damage})
          </button>
        ))}
      </div>
      <div className="tray-cards">
        {UNIT_TYPES.map((t) => {
          const n = countOf(state, t);
          const s = STATS[t];
          const can = left >= s.cost && room(t) > 0;
          const less = (e: ReactMouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (n > 0) setCount(t, n - 1);
          };
          return (
            <button
              key={t}
              className={n > 0 ? 'card picked' : 'card'}
              disabled={!can && n === 0}
              onClick={(e) =>
                e.altKey ? less(e) : can && setCount(t, n + (e.shiftKey ? Math.min(Math.floor(left / s.cost), room(t)) : 1))
              }
              onContextMenu={less}
              title={`${UNIT_GLYPH[t].name}: ${t === 'factory' ? '' : `attack ${s.attack}, defense ${s.defense}, move ${s.move}. `}Click to buy one, shift-click to buy as many as you can afford, right-click to remove one.`}
            >
              <UnitSvg type={t} color={style.color} size={34} />
              <span className="card-name">{UNIT_GLYPH[t].name}</span>
              <span className="card-cost">{s.cost}</span>
              {t !== 'factory' && (
                <span className="card-stats">
                  {s.attack}·{s.defense}·{s.move}
                </span>
              )}
              {n > 0 && <span className="card-count">{n}</span>}
              {n > 0 && (
                <span className="card-less" role="button" aria-label={`Remove one ${UNIT_GLYPH[t].name}`} onClick={less}>
                  −
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Every type bought this turn, in a stable order, so cards do not jump as units are placed. */
function bought(state: GameState): { type: UnitType; left: number }[] {
  const placed = state.units.filter((u) => state.mobilized.includes(u.id));
  return UNIT_TYPES.map((t) => ({ type: t, left: countOf(state, t), placed: placed.filter((u) => u.type === t).length }))
    .filter((r) => r.left + r.placed > 0)
    .map(({ type, left }) => ({ type, left }));
}

/** The mobilization zone: drag new units onto the board, or click to pick some up and click a space. */
export function PlaceTray({
  state,
  hand,
  onPick,
  onDragStart,
}: {
  state: GameState;
  hand: Hand | null;
  onPick: (type: UnitType, count: number) => void;
  onDragStart: (type: UnitType, x: number, y: number) => void;
}) {
  const style = POWER_STYLE[state.power];
  const rows = bought(state);
  if (rows.length === 0) return null;
  return (
    <div className="tray">
      {state.purchases.length === 0 && <div className="tray-head dim">Everything is placed. End the turn.</div>}
      <div className="tray-cards">
        {rows.map(({ type, left }) => {
          const held = hand?.kind === 'new' && hand.type === type ? hand.count : 0;
          return (
            <button
              key={type}
              className={held > 0 ? 'card picked' : 'card'}
              disabled={left === 0}
              onPointerDown={(e) => e.button === 0 && left > 0 && onDragStart(type, e.clientX, e.clientY)}
              onClick={(e) => onPick(type, e.shiftKey ? left : Math.min(left, held + 1))}
              onContextMenu={(e) => {
                e.preventDefault();
                onPick(type, Math.max(0, held - 1));
              }}
              title="Drag onto the map to place all that fit, or click to pick up one at a time"
            >
              <UnitSvg type={type} color={style.color} size={34} />
              <span className="card-name">{UNIT_GLYPH[type].name}</span>
              <span className="card-cost">{left === 0 ? '✓' : `${left}`}</span>
              {held > 0 && <span className="card-count">{held}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

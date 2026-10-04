import { STATS } from '../../engine/data';
import { UNIT_TYPES } from '../../engine/types';
import type { Action, GameState, Purchase, UnitType } from '../../engine/types';
import { UNIT_GLYPH } from '../theme';
import { Chip, Stepper } from '../units';

interface Props {
  state: GameState;
  act: (a: Action) => boolean;
}

export function PurchasePanel({ state, act }: Props) {
  const power = state.power;
  const countOf = (t: UnitType) => state.purchases.find((p) => p.type === t)?.count ?? 0;
  const spent = state.purchases.reduce((n, p) => n + STATS[p.type].cost * p.count, 0);
  const left = state.treasury[power] - spent;
  const setCount = (t: UnitType, count: number) => {
    const next: Purchase[] = UNIT_TYPES.map((type) => ({ type, count: type === t ? count : countOf(type) })).filter((p) => p.count > 0);
    act({ type: 'buy', purchases: next });
  };
  const damaged = state.units.filter((u) => u.type === 'factory' && u.owner === power && u.damage > 0);
  return (
    <section className="panel">
      <h3>Purchase</h3>
      <div className="facts">
        <span>Treasury {state.treasury[power]}</span>
        <span>Spent {spent}</span>
        <span className={left < 0 ? 'bad' : 'good'}>Left {left}</span>
      </div>
      <table className="buy">
        <thead>
          <tr>
            <th />
            <th>Unit</th>
            <th title="cost">$</th>
            <th title="attack / defense / move">A/D/M</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {UNIT_TYPES.map((t) => {
            const s = STATS[t];
            const n = countOf(t);
            return (
              <tr key={t} className={n > 0 ? 'picked' : undefined}>
                <td>
                  <Chip owner={power} type={t} />
                </td>
                <td>{UNIT_GLYPH[t].name}</td>
                <td>{s.cost}</td>
                <td className="dim">{t === 'factory' ? '—' : `${s.attack}/${s.defense}/${s.move}`}</td>
                <td>
                  <Stepper value={n} max={n + Math.floor(Math.max(0, left) / s.cost)} onChange={(v) => setCount(t, v)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {state.purchases.length > 0 && (
        <button className="link" onClick={() => act({ type: 'buy', purchases: [] })}>
          Clear purchases
        </button>
      )}
      {damaged.map((f) => (
        <div key={f.id} className="row">
          <span className="grow">
            Factory in {f.at}: {f.damage} damage
          </span>
          <button disabled={left < 1} onClick={() => act({ type: 'repair', factory: f.id, amount: 1 })}>
            Repair 1
          </button>
          <button
            disabled={left < 1}
            onClick={() => act({ type: 'repair', factory: f.id, amount: Math.min(f.damage, left) })}
          >
            Repair {Math.min(f.damage, Math.max(left, 0))}
          </button>
        </div>
      ))}
    </section>
  );
}

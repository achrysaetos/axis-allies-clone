import { useEffect } from 'react';
import { isLand } from '../../engine/data';
import { cargoOf, remainingMove, unitsAt } from '../../engine/queries';
import { UNIT_TYPES } from '../../engine/types';
import type { GameState, SpaceId, Unit, UnitId } from '../../engine/types';
import { UNIT_GLYPH } from '../theme';
import { Chip, Stepper, UnitChips } from '../units';

interface Props {
  state: GameState;
  at: SpaceId;
  selected: UnitId[];
  sbr: boolean;
  onSelect: (ids: UnitId[]) => void;
  onSbr: (on: boolean) => void;
}

interface Group {
  key: string;
  units: Unit[];
}

/** Units of the moving power that the player picks by count: same type and movement left. */
function groupsOf(units: Unit[]): Group[] {
  const out: Group[] = [];
  for (const type of UNIT_TYPES) {
    if (type === 'factory' || type === 'transport') continue;
    const ofType = units.filter((u) => u.type === type);
    for (const left of [...new Set(ofType.map(remainingMove))].filter((n) => n > 0).sort((a, b) => b - a))
      out.push({ key: `${type}:${left}`, units: ofType.filter((u) => remainingMove(u) === left) });
  }
  return out;
}

export function MovePanel({ state, at, selected, sbr, onSelect, onSbr }: Props) {
  const mine = unitsAt(state, at).filter((u) => u.owner === state.power && u.type !== 'factory');
  const free = mine.filter((u) => u.carriedBy === null || !isLand(u.type));
  const transports = free.filter((u) => u.type === 'transport');
  const spent = free.filter((u) => u.type !== 'transport' && remainingMove(u) === 0);
  const others = unitsAt(state, at).filter((u) => u.owner !== state.power && u.type !== 'factory');
  const chosen = new Set(selected);
  const setGroup = (g: Group, n: number) => {
    const rest = selected.filter((id) => !g.units.some((u) => u.id === id));
    onSelect([...rest, ...g.units.slice(0, n).map((u) => u.id)]);
  };
  const toggle = (id: UnitId) => onSelect(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectedUnits = mine.filter((u) => chosen.has(u.id));
  const raiders = state.options.sbrEscortsInterceptors ? ['bomber', 'fighter'] : ['bomber'];
  const canRaid =
    selectedUnits.some((u) => u.type === 'bomber') && selectedUnits.every((u) => raiders.includes(u.type));
  useEffect(() => {
    if (sbr && !canRaid) onSbr(false);
  }, [sbr, canRaid, onSbr]);

  return (
    <section className="panel">
      <h3>Move from {at}</h3>
      {mine.length === 0 && <div className="dim">None of your units are here.</div>}
      {groupsOf(free).map((g) => {
        const first = g.units[0]!;
        const n = g.units.filter((u) => chosen.has(u.id)).length;
        return (
          <div key={g.key} className="row">
            <Chip owner={first.owner} type={first.type} />
            <span className="grow">
              {UNIT_GLYPH[first.type].name} <span className="dim">· {remainingMove(first)} mv</span>
            </span>
            <Stepper value={n} max={g.units.length} onChange={(v) => setGroup(g, v)} />
            <button className="link" onClick={() => setGroup(g, n === g.units.length ? 0 : g.units.length)}>
              {n === g.units.length ? 'none' : `all ${g.units.length}`}
            </button>
          </div>
        );
      })}
      {transports.map((t) => {
        const cargo = cargoOf(state, t.id);
        return (
          <div key={t.id} className="transport">
            <label className="row">
              <input type="checkbox" checked={chosen.has(t.id)} onChange={() => toggle(t.id)} />
              <Chip owner={t.owner} type="transport" />
              <span className="grow">
                Transport #{t.id} <span className="dim">· {remainingMove(t)} mv</span>
              </span>
              {cargo.length === 0 && <span className="dim">empty</span>}
            </label>
            {cargo.map((c) => (
              <label key={c.id} className="row cargo">
                <input
                  type="checkbox"
                  disabled={c.owner !== state.power}
                  checked={chosen.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <Chip owner={c.owner} type={c.type} />
                <span className="grow">{UNIT_GLYPH[c.type].name}</span>
                <span className="dim">{c.owner !== state.power ? 'allied' : c.offloadedTo ? `→ ${c.offloadedTo}` : 'offload'}</span>
              </label>
            ))}
          </div>
        );
      })}
      {mine.length > 0 && (
        <div className="row actions">
          <button onClick={() => onSelect(free.filter((u) => remainingMove(u) > 0).map((u) => u.id))}>Select all</button>
          <button disabled={selected.length === 0} onClick={() => onSelect([])}>
            Clear
          </button>
        </div>
      )}
      {canRaid && state.phase === 'combatMove' && (
        <label className="row">
          <input type="checkbox" checked={sbr} onChange={(e) => onSbr(e.target.checked)} />
          Strategic bombing raid
        </label>
      )}
      {selected.length > 0 && <div className="hint">Click a highlighted space to move {selected.length} unit(s).</div>}
      {spent.length > 0 && (
        <div className="others">
          <span className="dim">Already moved:</span> <UnitChips units={spent} />
        </div>
      )}
      {others.length > 0 && (
        <div className="others">
          <span className="dim">Also here:</span> <UnitChips units={others} />
        </div>
      )}
    </section>
  );
}

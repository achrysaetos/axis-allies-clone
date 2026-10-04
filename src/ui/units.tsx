import { POWERS, UNIT_TYPES } from '../engine/types';
import type { Power, Unit, UnitType } from '../engine/types';
import { POWER_STYLE, UNIT_GLYPH } from './theme';

export function Chip({ owner, type, count, muted }: { owner: Power; type: UnitType; count?: number; muted?: boolean }) {
  const style = POWER_STYLE[owner];
  return (
    <span
      className={muted ? 'chip muted' : 'chip'}
      style={{ background: style.color, color: style.ink }}
      title={`${POWER_STYLE[owner].name} ${UNIT_GLYPH[type].name}`}
    >
      {count !== undefined && count > 1 ? `${count}×` : ''}
      {UNIT_GLYPH[type].letter}
    </span>
  );
}

export function PowerTag({ power }: { power: Power }) {
  const style = POWER_STYLE[power];
  return (
    <span className="power-tag" style={{ background: style.color, color: style.ink }}>
      {style.name}
    </span>
  );
}

export interface Tally {
  owner: Power;
  type: UnitType;
  count: number;
}

export function tally(units: Unit[]): Tally[] {
  const out: Tally[] = [];
  for (const owner of POWERS)
    for (const type of UNIT_TYPES) {
      const count = units.filter((u) => u.owner === owner && u.type === type).length;
      if (count > 0) out.push({ owner, type, count });
    }
  return out;
}

export function UnitChips({ units, muted }: { units: Unit[]; muted?: boolean }) {
  return (
    <span className="chips">
      {tally(units).map((t) => (
        <Chip key={`${t.owner}-${t.type}`} owner={t.owner} type={t.type} count={t.count} muted={muted} />
      ))}
    </span>
  );
}

export function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <span className="stepper">
      <button disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

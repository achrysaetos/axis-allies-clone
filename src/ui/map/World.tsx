import { memo } from 'react';
import { space } from '../../engine/data';
import { POWERS, UNIT_TYPES } from '../../engine/types';
import type { GameState, Power, SpaceId, Unit, UnitType } from '../../engine/types';
import { NEUTRAL_FILL, POWER_STYLE, SEA_FILL, UNIT_GLYPH } from '../theme';
import { SHAPES, seaNumber } from './geometry';
import type { SpaceShape } from './geometry';

export interface WorldProps {
  state: GameState;
  selected: SpaceId | null;
  highlights: ReadonlySet<SpaceId>;
}

const GAP = 2;
const BADGE_H = 15;
const PER_ROW = 3;

interface Stack {
  owner: Power;
  type: UnitType;
  count: number;
  carried: boolean;
}

function stacksAt(units: Unit[]): Stack[] {
  const out: Stack[] = [];
  for (const owner of POWERS)
    for (const type of UNIT_TYPES) {
      if (type === 'factory') continue;
      for (const carried of [false, true]) {
        const count = units.filter(
          (u) => u.owner === owner && u.type === type && (u.carriedBy !== null && type !== 'fighter') === carried,
        ).length;
        if (count > 0) out.push({ owner, type, count, carried });
      }
    }
  return out;
}

function fillOf(state: GameState, s: SpaceShape): string {
  if (s.water) return SEA_FILL;
  const o = state.owner[s.id];
  return o ? POWER_STYLE[o].color : 'url(#neutral)';
}

const label = (st: Stack) => (st.count > 1 ? `${st.count} ${UNIT_GLYPH[st.type].letter}` : UNIT_GLYPH[st.type].letter);
const widthOf = (text: string) => 6 + text.length * 6.2;

function Badges({ id, x, y, units }: { id: SpaceId; x: number; y: number; units: Unit[] }) {
  const stacks = stacksAt(units);
  if (stacks.length === 0) return null;
  const rows: Stack[][] = [];
  for (let i = 0; i < stacks.length; i += PER_ROW) rows.push(stacks.slice(i, i + PER_ROW));
  return (
    <g data-space={id} className="badges">
      {rows.flatMap((row, r) => {
        const widths = row.map((st) => widthOf(label(st)));
        let bx = x - (widths.reduce((a, w) => a + w, 0) + GAP * (row.length - 1)) / 2;
        return row.map((st, i) => {
          const w = widths[i]!;
          const style = POWER_STYLE[st.owner];
          const at = bx;
          bx += w + GAP;
          return (
            <g key={`${st.owner}-${st.type}-${st.carried}`} transform={`translate(${at},${y + r * (BADGE_H + 2)})`}>
              <rect
                width={w}
                height={BADGE_H}
                rx={3}
                fill={style.color}
                stroke={st.carried ? '#fff' : '#111'}
                strokeDasharray={st.carried ? '3 2' : undefined}
                strokeWidth={1}
              />
              <text x={w / 2} y={11} textAnchor="middle" fill={style.ink} className="badge-text">
                {label(st)}
              </text>
            </g>
          );
        });
      })}
    </g>
  );
}

function Marks({ s, factory, battle }: { s: SpaceShape; factory: Unit | undefined; battle: boolean }) {
  const def = space(s.id);
  const [x, y] = s.center;
  if (def.water)
    return (
      <g data-space={s.id} pointerEvents="none">
        <text x={x} y={y - 6} textAnchor="middle" className="sea-label">
          {seaNumber(s.id)}
        </text>
        {battle && <BattleMark x={x + 16} y={y - 16} />}
      </g>
    );
  return (
    <g data-space={s.id}>
      {def.capital && <circle cx={x} cy={y - 14} r={11} fill="none" stroke="#fff" strokeWidth={2.5} strokeDasharray="4 2" />}
      {def.ipc > 0 && (
        <>
          <circle cx={x} cy={y - 14} r={7.5} fill="#f7f1df" stroke="#222" strokeWidth={0.8} />
          <text x={x} y={y - 10.5} textAnchor="middle" className="ipc-text">
            {def.ipc}
          </text>
        </>
      )}
      {def.victoryCity && (
        <text x={x - 15} y={y - 9} textAnchor="middle" className="vc-star">
          ★
        </text>
      )}
      {factory && (
        <g transform={`translate(${x + 10},${y - 21})`}>
          <rect width={16} height={13} rx={2} fill="#222" stroke="#eee" strokeWidth={0.7} />
          <text x={8} y={10} textAnchor="middle" className="ic-text">
            IC
          </text>
          {factory.damage > 0 && (
            <g transform="translate(17,0)">
              <rect width={16} height={13} rx={2} fill="#c0392b" />
              <text x={8} y={10} textAnchor="middle" className="ic-text">
                -{factory.damage}
              </text>
            </g>
          )}
        </g>
      )}
      {battle && <BattleMark x={x - 22} y={y - 26} />}
    </g>
  );
}

function BattleMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} className="battle-mark" pointerEvents="none">
      <circle r={9} fill="#d62828" stroke="#fff" strokeWidth={1.5} />
      <text y={4} textAnchor="middle" className="battle-text">
        ⚔
      </text>
    </g>
  );
}

export function NeutralPattern() {
  return (
    <pattern id="neutral" width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={10} height={10} fill={NEUTRAL_FILL} />
      <line x1={0} y1={0} x2={0} y2={10} stroke="#b9a984" strokeWidth={3} />
    </pattern>
  );
}

export const World = memo(function World({ state, selected, highlights }: WorldProps) {
  const byAt = new Map<SpaceId, Unit[]>();
  const factories = new Map<SpaceId, Unit>();
  for (const u of state.units) {
    if (u.type === 'factory') {
      factories.set(u.at, u);
      continue;
    }
    const list = byAt.get(u.at);
    if (list) list.push(u);
    else byAt.set(u.at, [u]);
  }
  const battles = new Set(state.battles.filter((b) => !b.resolved).map((b) => b.space));
  return (
    <g>
      {SHAPES.map((s) => (
        <path key={s.id} data-space={s.id} d={s.d} fill={fillOf(state, s)} className={s.water ? 'sea' : 'land'}>
          <title>{s.id}</title>
        </path>
      ))}
      {SHAPES.filter((s) => highlights.has(s.id)).map((s) => (
        <path key={`h-${s.id}`} d={s.d} className="highlight" pointerEvents="none" />
      ))}
      {SHAPES.filter((s) => s.id === selected).map((s) => (
        <path key={`s-${s.id}`} d={s.d} className="selected" pointerEvents="none" />
      ))}
      {SHAPES.filter((s) => !s.water).map((s) => (
        <text key={`n-${s.id}`} x={s.center[0]} y={s.center[1] + 3} textAnchor="middle" className="land-label" data-space={s.id}>
          {s.id}
        </text>
      ))}
      {SHAPES.map((s) => (
        <Marks key={`m-${s.id}`} s={s} factory={factories.get(s.id)} battle={battles.has(s.id)} />
      ))}
      {SHAPES.map((s) => (
        <Badges key={`b-${s.id}`} id={s.id} x={s.center[0]} y={s.center[1] + (s.water ? -2 : 8)} units={byAt.get(s.id) ?? []} />
      ))}
    </g>
  );
});

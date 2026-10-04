import { memo } from 'react';
import { space } from '../../engine/data';
import type { GameState, SpaceId, Unit, UnitId } from '../../engine/types';
import { UnitIcon } from '../icons';
import { stacksAt } from '../pieces';
import type { Stack } from '../pieces';
import { NEUTRAL_FILL, POWER_STYLE, SEA_FILL, UNIT_GLYPH } from '../theme';
import { CENTER, MAP_WIDTH, SHAPES, seaNumber } from './geometry';
import type { SpaceShape } from './geometry';

export interface WorldProps {
  state: GameState;
  selected: SpaceId | null;
  highlights: ReadonlySet<SpaceId>;
  /** Units in the player's hand, counted on the pieces they were lifted from. */
  held: ReadonlySet<UnitId>;
  /** Short labels by a space, such as the odds of a planned attack. */
  tags: ReadonlyMap<SpaceId, { text: string; tone: string }>;
  /** The route the held units would take to the space under the cursor. */
  route: SpaceId[] | null;
}

const GAP = 2;
const PIECE_H = 16;
const PER_ROW = 3;
const ICON_W = 20;

function fillOf(state: GameState, s: SpaceShape): string {
  if (s.water) return SEA_FILL;
  const o = state.owner[s.id];
  return o ? POWER_STYLE[o].color : 'url(#neutral)';
}

const widthOf = (st: Stack) => 4 + ICON_W + (st.units.length > 1 ? 3 + String(st.units.length).length * 6.5 : 2);

function Pieces({ id, x, y, stacks, held }: { id: SpaceId; x: number; y: number; stacks: Stack[]; held: ReadonlySet<UnitId> }) {
  if (stacks.length === 0) return null;
  const rows: Stack[][] = [];
  for (let i = 0; i < stacks.length; i += PER_ROW) rows.push(stacks.slice(i, i + PER_ROW));
  return (
    <g data-space={id} className="pieces">
      {rows.flatMap((row, r) => {
        const widths = row.map(widthOf);
        let bx = x - (widths.reduce((a, w) => a + w, 0) + GAP * (row.length - 1)) / 2;
        return row.map((st, i) => {
          const w = widths[i]!;
          const style = POWER_STYLE[st.owner];
          const at = bx;
          bx += w + GAP;
          const picked = st.units.filter((u) => held.has(u.id)).length;
          return (
            <g
              key={st.key}
              data-stack={st.key}
              className={st.spent ? 'piece spent' : 'piece'}
              transform={`translate(${at},${y + r * (PIECE_H + 2)})`}
            >
              <title>
                {`${style.name} ${UNIT_GLYPH[st.type].name.toLowerCase()} ×${st.units.length}${st.carried ? ' (aboard a transport)' : ''}${st.spent ? ' (done moving)' : ''}`}
              </title>
              <rect
                width={w}
                height={PIECE_H}
                rx={3}
                fill={style.color}
                stroke={picked > 0 ? '#ffe27a' : st.carried ? '#fff' : '#111'}
                strokeDasharray={st.carried && picked === 0 ? '3 2' : undefined}
                strokeWidth={picked > 0 ? 2.2 : 1}
              />
              <UnitIcon type={st.type} x={2} y={2} fill={style.ink} />
              {st.units.length > 1 && (
                <text x={ICON_W + 4} y={12} fill={style.ink} className="piece-count">
                  {st.units.length}
                </text>
              )}
              {picked > 0 && (
                <g transform={`translate(${w - 4},-5)`}>
                  <circle r={6.5} fill="#ffe27a" stroke="#3a2c00" strokeWidth={0.8} />
                  <text y={3.2} textAnchor="middle" className="picked-count">
                    {picked}
                  </text>
                </g>
              )}
            </g>
          );
        });
      })}
    </g>
  );
}

/** Center points along a route, unwrapped across the date line so the arrow takes the short way. */
function routePoints(route: SpaceId[]): [number, number][] {
  const pts: [number, number][] = [];
  for (const id of route) {
    const [x, y] = CENTER.get(id) ?? [0, 0];
    const prev = pts[pts.length - 1];
    const shift = prev ? Math.round((prev[0] - x) / MAP_WIDTH) * MAP_WIDTH : 0;
    pts.push([x + shift, y]);
  }
  return pts;
}

function Route({ route }: { route: SpaceId[] }) {
  const pts = routePoints(route);
  return (
    <g className="route" pointerEvents="none">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} />
      {pts.slice(1).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 2 ? 6 : 3.5} />
      ))}
    </g>
  );
}

function Tag({ x, y, text, tone }: { x: number; y: number; text: string; tone: string }) {
  const w = 8 + text.length * 6.4;
  return (
    <g transform={`translate(${x - w / 2},${y})`} className={`map-tag ${tone}`} pointerEvents="none">
      <rect width={w} height={15} rx={7.5} />
      <text x={w / 2} y={11} textAnchor="middle">
        {text}
      </text>
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

export const World = memo(function World({ state, selected, highlights, held, tags, route }: WorldProps) {
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
        <path key={s.id} data-space={s.id} d={s.d} fill={fillOf(state, s)} className={s.water ? 'sea' : 'land'} />
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
        <Pieces
          key={`b-${s.id}`}
          id={s.id}
          x={s.center[0]}
          y={s.center[1] + (s.water ? -2 : 8)}
          stacks={stacksAt(state, byAt.get(s.id) ?? [])}
          held={held}
        />
      ))}
      {SHAPES.filter((s) => tags.has(s.id)).map((s) => (
        <Tag key={`t-${s.id}`} x={s.center[0]} y={s.center[1] - (s.water ? 30 : 44)} {...tags.get(s.id)!} />
      ))}
      {route && route.length > 1 && <Route route={route} />}
    </g>
  );
});

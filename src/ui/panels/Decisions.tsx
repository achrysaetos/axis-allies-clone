import { useState } from 'react';
import { SIDE, STATS, isAir } from '../../engine/data';
import { assignable, autoCasualties } from '../../engine/casualties';
import type { Action, Decision, GameState, HitCategory, Unit, UnitId } from '../../engine/types';
import { casualtyPool, unreachable } from '../session';
import { UnitSvg } from '../icons';
import { POWER_STYLE, UNIT_GLYPH, powerName } from '../theme';
import { Chip } from '../units';

type Act = (a: Action) => boolean;
type Of<K extends Decision['kind']> = Extract<Decision, { kind: K }>;

const unitOf = (state: GameState, id: UnitId) => state.units.find((u) => u.id === id);

const CATEGORY_LABEL: Record<HitCategory, string> = {
  any: 'any unit',
  notAir: 'a ship or land unit (submarines cannot hit planes)',
  notSub: 'anything but a submarine (planes need a destroyer to hit subs)',
  air: 'a plane',
};

const REASON_LABEL = { aa: 'Antiaircraft fire', bombard: 'Shore bombardment', subStrike: 'Surprise strike', fire: 'Combat fire' };

/** Whether a hit category actually limits the choice here; with no subs or planes present every hit can take anything. */
const restricted = (groups: Of<'casualties'>['groups'], pool: Unit[]) =>
  groups.some(
    (g) =>
      (g.category === 'notSub' && pool.some((u) => u.type === 'submarine')) ||
      (g.category === 'notAir' && pool.some((u) => isAir(u.type))) ||
      (g.category === 'air' && pool.some((u) => !isAir(u.type))),
  );

interface HitBucket {
  key: string;
  sample: Unit;
  /** One entry per remaining hit point, spread across units so first picks only damage. */
  slots: UnitId[];
}

function bucketsOf(pool: Unit[]): HitBucket[] {
  const map = new Map<string, Unit[]>();
  for (const u of pool) {
    const key = `${u.owner}:${u.type}:${u.damage}`;
    map.set(key, [...(map.get(key) ?? []), u]);
  }
  return [...map.entries()].map(([key, units]) => {
    const hp = STATS[units[0]!.type].hitPoints - units[0]!.damage;
    const slots: UnitId[] = [];
    for (let i = 0; i < hp; i++) slots.push(...units.map((u) => u.id));
    return { key, sample: units[0]!, slots };
  });
}

function picksFrom(buckets: HitBucket[], ids: UnitId[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of buckets) out[b.key] = ids.filter((id) => b.slots.includes(id)).length;
  return out;
}

/** A piece in the casualty board: click to move one unit across, right-click to move it back. */
function Tile({
  bk,
  n,
  label,
  onMore,
  onLess,
}: {
  bk: HitBucket;
  n: number;
  label?: string;
  onMore: () => void;
  onLess: () => void;
}) {
  const style = POWER_STYLE[bk.sample.owner];
  return (
    <button
      className="tile"
      style={{ background: style.color, color: style.ink }}
      onClick={onMore}
      onContextMenu={(e) => {
        e.preventDefault();
        onLess();
      }}
      title={`${UNIT_GLYPH[bk.sample.type].name}${bk.sample.damage > 0 ? ' (damaged)' : ''}`}
    >
      <UnitSvg type={bk.sample.type} color={style.ink} size={30} />
      <span className="tile-count">{n}</span>
      {label && <span className="tile-label">{label}</span>}
    </button>
  );
}

export function CasualtyPicker({ state, d, act }: { state: GameState; d: Of<'casualties'>; act: Act }) {
  const b = state.battles.find((x) => x.id === d.battle)!;
  const pool = casualtyPool(state, b, d.side);
  const buckets = bucketsOf(pool);
  const suggested = autoCasualties(d.groups, pool);
  const [picks, setPicks] = useState(() => picksFrom(buckets, suggested));
  const need = assignable(d.groups, pool).total;
  const chosen = buckets.flatMap((bk) => bk.slots.slice(0, picks[bk.key] ?? 0));
  const set = (bk: HitBucket, n: number) => setPicks({ ...picks, [bk.key]: Math.max(0, Math.min(bk.slots.length, n)) });
  /** With the zone full, a new pick swaps out a piece already there, as a player trades one casualty for another. */
  const take = (bk: HitBucket) => {
    const swap = chosen.length >= need ? buckets.find((o) => o.key !== bk.key && (picks[o.key] ?? 0) > 0) : undefined;
    if (chosen.length >= need && !swap) return;
    setPicks({ ...picks, ...(swap ? { [swap.key]: picks[swap.key]! - 1 } : {}), [bk.key]: (picks[bk.key] ?? 0) + 1 });
  };
  const units = (bk: HitBucket) => bk.slots.length / (STATS[bk.sample.type].hitPoints - bk.sample.damage);
  return (
    <div className="decision">
      <div className="decision-title">
        {powerName(d.power)} ({SIDE[d.power]} player): {need} hit{need === 1 ? '' : 's'} to take
      </div>
      <div className="dim">
        {REASON_LABEL[d.reason]}
        {restricted(d.groups, pool) && ` · ${d.groups.map((g) => `${g.hits} × ${CATEGORY_LABEL[g.category]}`).join(', ')}`}
      </div>
      <div className="zone-label dim">In the fight, click to take a hit</div>
      <div className="tiles">
        {buckets.map((bk) => {
          const left = bk.slots.length - (picks[bk.key] ?? 0);
          return left > 0 ? (
            <Tile
              key={bk.key}
              bk={bk}
              n={Math.min(left, units(bk))}
              onMore={() => take(bk)}
              onLess={() => set(bk, (picks[bk.key] ?? 0) - 1)}
            />
          ) : null;
        })}
      </div>
      <div className="zone-label dim">
        Casualty zone · {chosen.length}/{need}
      </div>
      <div className="tiles casualties">
        {chosen.length === 0 && <span className="dim">Nothing yet.</span>}
        {buckets.map((bk) => {
          const n = picks[bk.key] ?? 0;
          if (n === 0) return null;
          const lost = Math.max(0, n - units(bk));
          const damaged = n - 2 * lost;
          const label =
            units(bk) < bk.slots.length
              ? lost > 0
                ? `${lost} sunk${damaged > 0 ? `, ${damaged} hit` : ''}`
                : 'damaged'
              : undefined;
          return (
            <Tile
              key={bk.key}
              bk={bk}
              n={lost > 0 ? lost + damaged : n}
              label={label}
              onMore={() => set(bk, n - 1)}
              onLess={() => take(bk)}
            />
          );
        })}
      </div>
      <div className="row actions">
        <button onClick={() => setPicks(picksFrom(buckets, suggested))}>Suggest</button>
        <span className="grow" />
        <button className="primary" disabled={chosen.length !== need} onClick={() => act({ type: 'casualties', units: chosen })}>
          Remove casualties
        </button>
      </div>
    </div>
  );
}

function UnitChecklist({
  state,
  ids,
  max,
  initial,
  title,
  confirm,
  onConfirm,
}: {
  state: GameState;
  ids: UnitId[];
  max: number;
  initial: UnitId[];
  title: string;
  confirm: string;
  onConfirm: (ids: UnitId[]) => void;
}) {
  const [on, setOn] = useState<UnitId[]>(initial);
  return (
    <div className="decision">
      <div className="decision-title">{title}</div>
      <div className="tiles">
        {ids.map((id) => {
          const u = unitOf(state, id);
          if (!u) return null;
          const checked = on.includes(id);
          const style = POWER_STYLE[u.owner];
          return (
            <button
              key={id}
              className={checked ? 'tile on' : 'tile'}
              aria-pressed={checked}
              style={{ background: style.color, color: style.ink }}
              disabled={!checked && on.length >= max}
              onClick={() => setOn(checked ? on.filter((x) => x !== id) : [...on, id])}
              title={UNIT_GLYPH[u.type].name}
            >
              <UnitSvg type={u.type} color={style.ink} size={30} />
              <span className="tile-label">{checked ? '✓' : ' '}</span>
            </button>
          );
        })}
      </div>
      <div className="row actions">
        <span className="dim grow">Click pieces to choose them.</span>
        <button className="primary" onClick={() => onConfirm(on)}>
          {confirm}
        </button>
      </div>
    </div>
  );
}

function LandStranded({ state, d, act }: { state: GameState; d: Of<'landStranded'>; act: Act }) {
  const [landings, setLandings] = useState<Record<UnitId, string | null>>(() =>
    Object.fromEntries(d.fighters.map((f) => [f, d.options[f]?.[0] ?? null])),
  );
  return (
    <div className="decision">
      <div className="decision-title">{powerName(d.power)}: land fighters whose carrier was sunk</div>
      {d.fighters.map((f, i) => {
        const u = unitOf(state, f);
        return (
          <div key={f} className="row">
            {u && <Chip owner={u.owner} type={u.type} />}
            <span className="grow">
              Fighter {d.fighters.length > 1 ? i + 1 : ''} in {u?.at}
            </span>
            <select value={landings[f] ?? ''} onChange={(e) => setLandings({ ...landings, [f]: e.target.value || null })}>
              {(d.options[f] ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              <option value="">Lose it</option>
            </select>
          </div>
        );
      })}
      <div className="row actions">
        <span className="grow" />
        <button className="primary" onClick={() => act({ type: 'landStranded', landings })}>
          Land fighters
        </button>
      </div>
    </div>
  );
}

export function DecisionView({ state, d, act }: { state: GameState; d: Decision; act: Act }) {
  const key = JSON.stringify(d);
  switch (d.kind) {
    case 'casualties':
      return <CasualtyPicker key={key} state={state} d={d} act={act} />;
    case 'submerge':
      return (
        <UnitChecklist
          key={key}
          state={state}
          ids={d.subs}
          max={d.subs.length}
          initial={[]}
          title={`${powerName(d.power)}: submerge submarines? Chosen subs leave the battle.`}
          confirm="Confirm"
          onConfirm={(units) => act({ type: 'submerge', units })}
        />
      );
    case 'bombard':
      return (
        <UnitChecklist
          key={key}
          state={state}
          ids={d.ships}
          max={d.max}
          initial={d.ships.slice(0, d.max)}
          title={`Shore bombardment: choose up to ${d.max} ship${d.max === 1 ? '' : 's'}`}
          confirm="Bombard"
          onConfirm={(ships) => act({ type: 'bombard', ships })}
        />
      );
    case 'retreat':
      return (
        <div className="decision">
          <div className="decision-title">{powerName(d.power)}: press on or retreat?</div>
          <div className="row actions wrap">
            <button className="primary" onClick={() => act({ type: 'retreat', to: null })}>
              Press on
            </button>
            {d.options.map((o) => (
              <button key={o} onClick={() => act({ type: 'retreat', to: o })}>
                {o === state.battles.find((b) => b.id === d.battle)?.space ? 'Withdraw air units' : `Retreat to ${o}`}
              </button>
            ))}
          </div>
        </div>
      );
    case 'intercept':
      return (
        <UnitChecklist
          key={key}
          state={state}
          ids={d.fighters}
          max={d.fighters.length}
          initial={d.fighters}
          title={`${powerName(d.power)}: which fighters intercept the raid?`}
          confirm="Intercept"
          onConfirm={(units) => act({ type: 'intercept', units })}
        />
      );
    case 'landStranded':
      return <LandStranded key={key} state={state} d={d} act={act} />;
    default:
      return unreachable(d);
  }
}

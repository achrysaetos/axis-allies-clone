import { useState } from 'react';
import { STATS } from '../../engine/data';
import { assignable, autoCasualties } from '../../engine/casualties';
import type { Action, Decision, GameState, HitCategory, Unit, UnitId } from '../../engine/types';
import { casualtyPool, unreachable } from '../session';
import { UNIT_GLYPH } from '../theme';
import { Chip, Stepper } from '../units';

type Act = (a: Action) => boolean;
type Of<K extends Decision['kind']> = Extract<Decision, { kind: K }>;

const unitOf = (state: GameState, id: UnitId) => state.units.find((u) => u.id === id);

const CATEGORY_LABEL: Record<HitCategory, string> = {
  any: 'any unit',
  notAir: 'not air units',
  notSub: 'not submarines',
  air: 'air units only',
};

const REASON_LABEL = { aa: 'Antiaircraft fire', bombard: 'Shore bombardment', subStrike: 'Surprise strike', fire: 'Combat fire' };

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

export function CasualtyPicker({ state, d, act }: { state: GameState; d: Of<'casualties'>; act: Act }) {
  const b = state.battles.find((x) => x.id === d.battle)!;
  const pool = casualtyPool(state, b, d.side);
  const buckets = bucketsOf(pool);
  const suggested = autoCasualties(d.groups, pool);
  const [picks, setPicks] = useState(() => picksFrom(buckets, suggested));
  const need = assignable(d.groups, pool).total;
  const chosen = buckets.flatMap((bk) => bk.slots.slice(0, picks[bk.key] ?? 0));
  return (
    <div className="decision">
      <div className="decision-title">
        {REASON_LABEL[d.reason]}: assign {need} hit{need === 1 ? '' : 's'} to {d.power}
      </div>
      <div className="dim">{d.groups.map((g) => `${g.hits} × ${CATEGORY_LABEL[g.category]}`).join(', ')}</div>
      {buckets.map((bk) => (
        <div key={bk.key} className="row">
          <Chip owner={bk.sample.owner} type={bk.sample.type} />
          <span className="grow">
            {UNIT_GLYPH[bk.sample.type].name}
            {bk.sample.damage > 0 ? ' (damaged)' : ''}
            {STATS[bk.sample.type].hitPoints - bk.sample.damage > 1 ? <span className="dim"> · 2 hits each</span> : null}
          </span>
          <Stepper
            value={picks[bk.key] ?? 0}
            max={bk.slots.length}
            onChange={(v) => setPicks({ ...picks, [bk.key]: v })}
          />
        </div>
      ))}
      <div className="row actions">
        <button onClick={() => setPicks(picksFrom(buckets, suggested))}>Auto</button>
        <span className="grow dim">
          {chosen.length}/{need} chosen
        </span>
        <button className="primary" disabled={chosen.length !== need} onClick={() => act({ type: 'casualties', units: chosen })}>
          Confirm casualties
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
      {ids.map((id) => {
        const u = unitOf(state, id);
        if (!u) return null;
        const checked = on.includes(id);
        return (
          <label key={id} className="row">
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && on.length >= max}
              onChange={() => setOn(checked ? on.filter((x) => x !== id) : [...on, id])}
            />
            <Chip owner={u.owner} type={u.type} />
            <span className="grow">
              {UNIT_GLYPH[u.type].name} #{u.id}
            </span>
          </label>
        );
      })}
      <div className="row actions">
        <span className="grow" />
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
      <div className="decision-title">{d.power}: land fighters whose carrier was sunk</div>
      {d.fighters.map((f) => {
        const u = unitOf(state, f);
        return (
          <div key={f} className="row">
            {u && <Chip owner={u.owner} type={u.type} />}
            <span className="grow">
              Fighter #{f} in {u?.at}
            </span>
            <select
              value={landings[f] ?? ''}
              onChange={(e) => setLandings({ ...landings, [f]: e.target.value || null })}
            >
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
          title={`${d.power}: submerge submarines? Checked subs leave the battle.`}
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
          <div className="decision-title">{d.power}: press on or retreat?</div>
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
          title={`${d.power}: which fighters intercept the raid?`}
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

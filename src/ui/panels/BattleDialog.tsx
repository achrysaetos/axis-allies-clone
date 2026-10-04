import { useEffect, useRef } from 'react';
import { POWERS, UNIT_TYPES } from '../../engine/types';
import type { Action, Battle, GameState, Power, Unit, UnitId } from '../../engine/types';
import type { Controller } from '../session';
import { SIDE, isSea, space } from '../../engine/data';
import { factoryAt } from '../../engine/queries';
import { POWER_STYLE, powerName } from '../theme';
import { Chip, PowerTag } from '../units';
import { DecisionView } from './Decisions';
import { battleBlocker } from '../../engine/combat';
import { areAllied } from '../../engine/queries';
import { oddsClass } from '../odds';
import type { Forecast } from '../odds';

/** Who would fight if the battle started now; the engine fixes the roster only when it starts. */
function lineup(state: GameState, b: Battle): { attackers: UnitId[]; defenders: UnitId[] } {
  if (b.round > 0 || b.resolved || b.attackers.length > 0) return { attackers: b.attackers, defenders: b.defenders };
  const ids = (f: (u: Unit) => boolean) => state.units.filter(f).map((u) => u.id);
  const raid = b.kind === 'sbr';
  return {
    attackers: ids(
      (u) =>
        u.owner === b.attacker &&
        u.sbr === raid &&
        !(b.kind === 'land' && isSea(u.type)) &&
        ((u.at === b.space && (u.carriedBy === null || u.type === 'fighter')) || (!raid && u.offloadedTo === b.space)),
    ),
    defenders: raid ? [] : ids((u) => u.at === b.space && u.type !== 'factory' && !areAllied(u.owner, b.attacker)),
  };
}

interface Props {
  state: GameState;
  battle: Battle;
  fallen: Unit[];
  controllers: Record<Power, Controller>;
  act: (a: Action) => boolean;
  onQuick: (battle: number) => void;
  /** The power and who plays it, such as "Germany (computer)". */
  playing: (p: Power) => string;
  onClose: () => void;
  forecast: Forecast | undefined;
  /** The next battle still to fight, offered once this one is over. */
  next: Battle | undefined;
  onOpen: (battle: number) => void;
}

type Status = 'ready' | 'hit' | 'submerged' | 'dead';

const DICE_LABEL: Record<string, string> = {
  any: 'fire',
  notAir: 'submarines fire',
  notSub: 'planes fire',
  aa: 'antiaircraft fire',
};

const STATUS_ORDER: Status[] = ['ready', 'hit', 'submerged', 'dead'];
const STATUS_LABEL: Record<Status, string> = { ready: '', hit: 'hit, fires back', submerged: 'submerged', dead: 'lost' };

function Side({
  title,
  ids,
  state,
  battle,
  fallen,
}: {
  title: string;
  ids: UnitId[];
  state: GameState;
  battle: Battle;
  fallen: Unit[];
}) {
  const rows: { status: Status; unit: Unit }[] = [];
  for (const id of ids) {
    const live = state.units.find((u) => u.id === id);
    const dead = live ? undefined : fallen.find((u) => u.id === id);
    const unit = live ?? dead;
    if (!unit) continue;
    const status: Status = dead
      ? 'dead'
      : battle.doomed.includes(id)
        ? 'hit'
        : battle.submerged.includes(id)
          ? 'submerged'
          : 'ready';
    rows.push({ status, unit });
  }
  const owners = POWERS.filter((p) => rows.some((r) => r.unit.owner === p));
  return (
    <div className="side">
      <div className="side-title">
        {title}{' '}
        {owners.map((p) => (
          <PowerTag key={p} power={p} />
        ))}
      </div>
      {STATUS_ORDER.map((status) => {
        const here = rows.filter((r) => r.status === status);
        if (here.length === 0) return null;
        return (
          <div key={status} className={`status ${status}`}>
            {POWERS.flatMap((owner) =>
              UNIT_TYPES.map((type) => {
                const n = here.filter((r) => r.unit.owner === owner && r.unit.type === type).length;
                const damaged =
                  status === 'ready' && here.some((r) => r.unit.owner === owner && r.unit.type === type && r.unit.damage > 0);
                return n > 0 ? (
                  <span key={`${owner}-${type}`} title={damaged ? 'damaged' : undefined}>
                    <Chip owner={owner} type={type} count={n} muted={status === 'dead'} />
                    {damaged && <span className="bad">*</span>}
                  </span>
                ) : null;
              }),
            )}
            {STATUS_LABEL[status] && <span className="dim"> {STATUS_LABEL[status]}</span>}
          </div>
        );
      })}
    </div>
  );
}

function RaidTarget({ state, battle }: { state: GameState; battle: Battle }) {
  const f = factoryAt(state, battle.space);
  const owner = state.owner[battle.space];
  return (
    <div className="side">
      <div className="dim">Defender {owner && <PowerTag power={owner} />}</div>
      <div>
        Industrial complex · damage {f?.damage ?? 0} of {2 * space(battle.space).ipc} max
      </div>
      <div className="dim small">It fires once at each bomber, hitting on a 1.</div>
    </div>
  );
}

function outcome(state: GameState, b: Battle): string {
  const attacker = powerName(b.attacker);
  if (b.kind === 'sbr')
    return b.winner === 'attacker' ? `${attacker} damages the industrial complex` : 'Every bomber was shot down';
  if (b.winner === 'defender') return `${b.space} holds`;
  if (b.winner === 'none') return 'Neither side can hit the other, so the battle ends';
  if (b.kind === 'sea') return `${attacker} wins the sea battle`;
  const owner = state.owner[b.space];
  return owner && SIDE[owner] === SIDE[b.attacker]
    ? `${attacker} takes ${b.space}`
    : `${b.space} is cleared, but only aircraft survived, so it cannot be taken`;
}

export function BattleDialog({
  state,
  battle,
  fallen,
  controllers,
  playing,
  act,
  onQuick,
  onClose,
  forecast,
  next,
  onOpen,
}: Props) {
  const d = state.pending;
  const mine = d && 'battle' in d && d.battle === battle.id ? d : null;
  const waiting = mine !== null && controllers[mine.power] !== 'human';
  const fresh = !battle.resolved && battle.round === 0 && state.activeBattle !== battle.id;
  const blocker = fresh ? battleBlocker(state, battle) : null;
  const human = controllers[battle.attacker] === 'human';
  const { attackers, defenders } = lineup(state, battle);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [battle.dice.length, battle.id]);
  return (
    <div className="battle-dialog">
      <header>
        <h3>
          {battle.kind === 'sbr' ? 'Bombing raid on' : 'Battle for'} {battle.space}
        </h3>
        <span className="dim">{battle.round > 0 ? `Round ${battle.round}` : ''}</span>
        <button className="link" disabled={mine !== null} onClick={onClose} title={mine ? 'A decision is pending' : 'Close'}>
          ✕
        </button>
      </header>
      <div className="sides">
        <Side title="Attacker" ids={attackers} state={state} battle={battle} fallen={fallen} />
        {battle.kind === 'sbr' && defenders.length === 0 ? (
          <RaidTarget state={state} battle={battle} />
        ) : (
          <Side title="Defender" ids={defenders} state={state} battle={battle} fallen={fallen} />
        )}
      </div>
      <div className="dice-log" ref={log}>
        {battle.dice.length === 0 && !fresh && !mine && <div className="dim">No dice rolled yet.</div>}
        {fresh && forecast && (
          <div className={`forecast ${oddsClass(forecast.win)}`}>
            {forecast.kind === 'sbr'
              ? `About ${forecast.defLoss.toFixed(1)} damage expected`
              : `${Math.round(forecast.win * 100)}% to win · you lose about ${Math.round(forecast.attLoss)} IPCs, the defender about ${Math.round(forecast.defLoss)}`}
          </div>
        )}
        {battle.dice.map((r, i) => (
          <div key={i}>
            {(i === 0 || battle.dice[i - 1]!.round !== r.round) && (
              <div className="dice-round">{r.round === 0 ? 'Before the battle' : `Round ${r.round}`}</div>
            )}
            <div className={`dice-row ${r.side}`}>
              <span className="dice-label">
                {r.side === 'attacker' ? powerName(battle.attacker) : 'Defender'} · {DICE_LABEL[r.label] ?? r.label}
              </span>
              <span className="dice">
                {[...new Set(r.targets.length > 0 ? r.targets : [0])]
                  .sort((x, y) => y - x)
                  .map((target) => (
                    <span key={target} className="dice-group">
                      {target > 0 && (
                        <span className="needs" title={`hits on ${target} or less`}>
                          ≤{target}
                        </span>
                      )}
                      {r.rolls
                        .filter((_, j) => (r.targets[j] ?? 0) === target)
                        .map((v, j) => (
                          <span
                            key={j}
                            className={target > 0 && v <= target ? 'die hit' : 'die'}
                            style={{ borderColor: r.side === 'attacker' ? POWER_STYLE[battle.attacker].color : '#666' }}
                          >
                            {v}
                          </span>
                        ))}
                    </span>
                  ))}
              </span>
              <span className="hits">
                {r.hits} {r.label === 'bombing damage' ? 'damage' : r.hits === 1 ? 'hit' : 'hits'}
                {r.wasted && <span className="dim"> · nothing it can hit</span>}
              </span>
            </div>
          </div>
        ))}
      </div>
      {battle.resolved && (
        <div className={`result ${battle.winner === 'attacker' ? 'good' : 'bad'}`}>{outcome(state, battle)}</div>
      )}
      {fresh && human && (
        <div className="battle-actions">
          {blocker ? (
            <span className="dim grow">Not yet: {blocker}.</span>
          ) : (
            <>
              <button className="primary" autoFocus onClick={() => act({ type: 'startBattle', battle: battle.id })}>
                Roll dice
              </button>
              <button
                onClick={() => onQuick(battle.id)}
                title="Each side loses its cheapest units first, and you retreat below a 30% chance to win"
              >
                Fight it out automatically
              </button>
              {battle.optional && <button onClick={() => act({ type: 'skipBattle', battle: battle.id })}>Skip</button>}
            </>
          )}
        </div>
      )}
      {battle.resolved && (
        <div className="battle-actions">
          {next ? (
            <button className="primary" autoFocus onClick={() => onOpen(next.id)}>
              Next: {next.space}
            </button>
          ) : (
            <button className="primary" autoFocus onClick={onClose}>
              Back to the map
            </button>
          )}
        </div>
      )}
      {mine &&
        (waiting ? (
          <div className="dim">Waiting for {playing(mine.power)}…</div>
        ) : (
          <>
            <DecisionView state={state} d={mine} act={act} />
            <button className="link" onClick={() => onQuick(battle.id)}>
              Finish this battle automatically (retreats below 30%)
            </button>
          </>
        ))}
    </div>
  );
}

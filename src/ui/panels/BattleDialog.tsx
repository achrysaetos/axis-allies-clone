import { POWERS, UNIT_TYPES } from '../../engine/types';
import type { Action, Battle, GameState, Power, Unit, UnitId } from '../../engine/types';
import type { Controller } from '../session';
import { SIDE, space } from '../../engine/data';
import { factoryAt } from '../../engine/queries';
import { POWER_STYLE, powerName } from '../theme';
import { Chip, PowerTag } from '../units';
import { DecisionView } from './Decisions';

interface Props {
  state: GameState;
  battle: Battle;
  fallen: Unit[];
  controllers: Record<Power, Controller>;
  act: (a: Action) => boolean;
  onQuick: (battle: number) => void;
  onClose: () => void;
}

type Status = 'ready' | 'hit' | 'submerged' | 'dead';

const DICE_LABEL: Record<string, string> = {
  any: 'fire',
  notAir: 'submarines fire',
  notSub: 'air fire',
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

export function BattleDialog({ state, battle, fallen, controllers, act, onQuick, onClose }: Props) {
  const d = state.pending;
  const mine = d && 'battle' in d && d.battle === battle.id ? d : null;
  const waitingOnAi = mine !== null && controllers[mine.power] === 'ai';
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
        <Side title="Attacker" ids={battle.attackers} state={state} battle={battle} fallen={fallen} />
        {battle.kind === 'sbr' && battle.defenders.length === 0 ? (
          <RaidTarget state={state} battle={battle} />
        ) : (
          <Side title="Defender" ids={battle.defenders} state={state} battle={battle} fallen={fallen} />
        )}
      </div>
      <div className="dice-log">
        {battle.dice.length === 0 && <div className="dim">No dice rolled yet.</div>}
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
                {r.rolls.map((v, j) => {
                  const target = r.targets[j];
                  const hit = target !== undefined && v <= target;
                  return (
                    <span
                      key={j}
                      className={hit ? 'die hit' : 'die'}
                      title={target !== undefined ? `needed ${target} or less` : undefined}
                      style={{ borderColor: r.side === 'attacker' ? POWER_STYLE[battle.attacker].color : '#666' }}
                    >
                      {v}
                    </span>
                  );
                })}
              </span>
              <span className="hits">
                {r.hits} {r.label === 'bombing damage' ? 'damage' : r.hits === 1 ? 'hit' : 'hits'}
              </span>
            </div>
          </div>
        ))}
      </div>
      {battle.resolved && (
        <div className={`result ${battle.winner === 'attacker' ? 'good' : 'bad'}`}>{outcome(state, battle)}</div>
      )}
      {mine &&
        (waitingOnAi ? (
          <div className="dim">Waiting for {powerName(mine.power)} (computer)…</div>
        ) : (
          <>
            <DecisionView state={state} d={mine} act={act} />
            <button className="link" onClick={() => onQuick(battle.id)}>
              Finish this battle automatically
            </button>
          </>
        ))}
    </div>
  );
}

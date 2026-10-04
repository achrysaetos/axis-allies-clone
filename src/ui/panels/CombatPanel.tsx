import { battleBlocker } from '../../engine/combat';
import type { Action, Battle, GameState, SpaceId } from '../../engine/types';
import type { Forecast } from '../odds';
import { OddsTag } from './AttackPlan';

interface Props {
  state: GameState;
  odds: Forecast[];
  act: (a: Action) => boolean;
  onView: (battle: number) => void;
  onFocus: (id: SpaceId) => void;
}

const KIND_LABEL: Record<Battle['kind'], string> = { land: 'Land', sea: 'Sea', sbr: 'Bombing raid' };
const TIER_LABEL: Record<Battle['tier'], string> = { 0: 'SBR', 1: 'Amphibious', 2: 'General' };

function outcome(b: Battle): string {
  if (b.skipped) return 'skipped';
  if (b.winner === 'attacker') return 'won';
  if (b.winner === 'defender') return 'lost';
  return 'no decision';
}

export function CombatPanel({ state, odds, act, onView, onFocus }: Props) {
  const battles = [...state.battles].sort((a, b) => a.tier - b.tier || a.id - b.id);
  const open = battles.filter((b) => !b.resolved);
  return (
    <section className="panel">
      <h3>Battles</h3>
      {battles.length === 0 && <div className="dim">No battles this turn.</div>}
      {open.length === 0 && battles.length > 0 && <div className="hint">All battles resolved. End the phase.</div>}
      {battles.map((b) => {
        const blocker = b.resolved ? null : battleBlocker(state, b);
        const forecast = b.resolved || b.kind === 'sbr' ? undefined : odds.find((f) => f.space === b.space && f.kind === b.kind);
        return (
          <div key={b.id} className={b.resolved ? 'battle-row done' : 'battle-row'}>
            <button className="link grow left" onClick={() => onFocus(b.space)}>
              {b.space}
            </button>
            <span className="tag">{KIND_LABEL[b.kind]}</span>
            <span className="tag dim">{TIER_LABEL[b.tier]}</span>
            {b.optional && !b.resolved && <span className="tag">optional</span>}
            {forecast && state.activeBattle !== b.id && <OddsTag f={forecast} />}
            {state.activeBattle === b.id ? (
              <button className="link" onClick={() => onView(b.id)}>
                in progress
              </button>
            ) : b.resolved ? (
              <>
                <span className={`tag ${b.winner === 'attacker' ? 'good' : 'bad'}`}>{outcome(b)}</span>
                {!b.skipped && (
                  <button className="link" onClick={() => onView(b.id)}>
                    view
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className="primary"
                  disabled={blocker !== null}
                  title={blocker ?? 'Fight this battle'}
                  onClick={() => act({ type: 'startBattle', battle: b.id }) && onView(b.id)}
                >
                  Start
                </button>
                {b.optional && <button onClick={() => act({ type: 'skipBattle', battle: b.id })}>Skip</button>}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}

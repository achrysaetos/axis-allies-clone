import { VICTORY_THRESHOLD } from '../../engine/data';
import { income, victoryCities } from '../../engine/queries';
import type { GameState, Phase, Power } from '../../engine/types';
import type { Controller } from '../session';
import { PHASE_LABEL, POWER_STYLE } from '../theme';

interface Props {
  state: GameState;
  controllers: Record<Power, Controller>;
  canUndo: boolean;
  onEndPhase: () => void;
  onUndo: () => void;
  onExport: () => void;
  onMenu: () => void;
}

const PHASES: Phase[] = ['purchase', 'combatMove', 'combat', 'noncombatMove', 'mobilize'];

export function PhaseBar({ state, controllers, canUndo, onEndPhase, onUndo, onExport, onMenu }: Props) {
  const style = POWER_STYLE[state.power];
  const t = VICTORY_THRESHOLD[state.options.victory];
  const human = controllers[state.pending?.power ?? state.power] === 'human';
  return (
    <header className="phase-bar">
      <span className="round">Round {state.round}</span>
      <span className="power" style={{ background: style.color, color: style.ink }}>
        {state.power}
        {controllers[state.power] === 'ai' ? ' (AI)' : ''}
      </span>
      <span className="phases">
        {PHASES.map((p) => (
          <span key={p} className={p === state.phase ? 'phase current' : 'phase'}>
            {PHASE_LABEL[p]}
          </span>
        ))}
      </span>
      <span className="money" title="treasury / income">
        {state.treasury[state.power]} IPC <span className="dim">+{income(state, state.power)}</span>
      </span>
      <span className="vcs" title={`victory cities (win at ${t.Axis} Axis / ${t.Allies} Allies)`}>
        ★ Axis {victoryCities(state, 'Axis')}/{t.Axis} · Allies {victoryCities(state, 'Allies')}/{t.Allies}
      </span>
      <span className="grow" />
      <button onClick={onUndo} disabled={!canUndo} title="Undo last move (Ctrl+Z)">
        Undo
      </button>
      <button onClick={onExport} title="Download this game as JSON">
        Export
      </button>
      <button onClick={onMenu}>Menu</button>
      <button className="primary end" onClick={onEndPhase} disabled={!human || state.pending !== null} title="End phase (E)">
        {state.phase === 'mobilize' ? 'End turn' : 'End phase'}
      </button>
    </header>
  );
}

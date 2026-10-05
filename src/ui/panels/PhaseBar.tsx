import { useState } from 'react';
import { VICTORY_THRESHOLD } from '../../engine/data';
import { income, victoryCities } from '../../engine/queries';
import type { GameState, Phase, Power } from '../../engine/types';
import type { Controller } from '../session';
import { PHASE_LABEL, POWER_STYLE } from '../theme';
import { isMuted, setMuted } from '../sound';
import { Chip } from '../units';

interface Props {
  state: GameState;
  controllers: Record<Power, Controller>;
  canUndo: boolean;
  onEndPhase: () => void;
  onUndo: () => void;
  onExport: () => void;
  onMenu: () => void;
  onHelp: () => void;
  onLog: () => void;
}

const PHASES: Phase[] = ['purchase', 'combatMove', 'combat', 'noncombatMove', 'mobilize'];

export function PhaseBar({ state, controllers, canUndo, onEndPhase, onUndo, onExport, onMenu, onHelp, onLog }: Props) {
  const [menu, setMenu] = useState(false);
  const [quiet, setQuiet] = useState(isMuted);
  const style = POWER_STYLE[state.power];
  const t = VICTORY_THRESHOLD[state.options.victory];
  const human = controllers[state.pending?.power ?? state.power] === 'human';
  return (
    <header className="phase-bar">
      <span className="round">Round {state.round}</span>
      <span className="power" style={{ background: style.color, color: style.ink }}>
        {style.name}
        {controllers[state.power] === 'ai' ? ' (computer)' : ''}
      </span>
      <span className="phases">
        {PHASES.map((p) => (
          <span key={p} className={p === state.phase ? 'phase current' : 'phase'}>
            {PHASE_LABEL[p]}
          </span>
        ))}
      </span>
      <span className="money">
        <span className="dim">Treasury</span> {state.treasury[state.power]} <span className="dim">· Income</span>{' '}
        {income(state, state.power)}
      </span>
      {state.phase !== 'purchase' && state.purchases.length > 0 && (
        <span className="to-place" title="Bought this turn, placed in the Mobilize phase">
          To place{' '}
          {state.purchases.map((p) => (
            <Chip key={p.type} owner={state.power} type={p.type} count={p.count} />
          ))}
        </span>
      )}
      <span className="vcs" title={`victory cities (win at ${t.Axis} Axis / ${t.Allies} Allies)`}>
        ★ Axis {victoryCities(state, 'Axis')}/{t.Axis} · Allies {victoryCities(state, 'Allies')}/{t.Allies}
      </span>
      <span className="grow" />
      <button onClick={onUndo} disabled={!canUndo} title="Undo last move (Ctrl+Z)">
        Undo
      </button>
      <span className="menu-anchor">
        <button onClick={() => setMenu((m) => !m)} title="Menu" aria-label="Menu">
          ☰
        </button>
        {menu && (
          <div className="menu" onClick={() => setMenu(false)}>
            <button onClick={onLog}>Game log (L)</button>
            <button onClick={onHelp}>How to play (?)</button>
            <button
              onClick={() => {
                setMuted(!quiet);
                setQuiet(!quiet);
              }}
            >
              {quiet ? 'Turn sound on' : 'Turn sound off'}
            </button>
            <button onClick={onExport}>Export save</button>
            <button onClick={onMenu}>Main menu</button>
          </div>
        )}
      </span>
      <button
        className="primary end"
        onClick={onEndPhase}
        disabled={!human || state.pending !== null || state.winner !== null}
        title="End phase (E)"
      >
        {state.phase === 'mobilize' ? (
          'End turn'
        ) : (
          <>
            <span className="long">Next: {PHASE_LABEL[PHASES[PHASES.indexOf(state.phase) + 1]!]}</span>
            <span className="short">Next ›</span>
          </>
        )}
      </button>
    </header>
  );
}

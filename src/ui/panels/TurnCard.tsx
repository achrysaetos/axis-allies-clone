import { useEffect } from 'react';
import { SIDE } from '../../engine/data';
import { capitalHeld, income } from '../../engine/queries';
import type { GameState, Power } from '../../engine/types';
import { POWER_STYLE, readable } from '../theme';

const NOTABLE = /captures|liberates|seizes|bombs|battle for|holds against|lost|win with|cannot collect/;
/** Everything notable since this power's last turn ended, so the returning player catches up at a glance. */
export function sinceLastTurn(log: string[], power: Power): string[] {
  const ended = new RegExp(`^${power} (collects \\d+ IPCs|cannot collect income)`);
  let start = log.length;
  while (start > 0 && !ended.test(log[start - 1]!)) start -= 1;
  return log.slice(start).filter((l) => NOTABLE.test(l));
}

export function TurnCard({ state, onStart }: { state: GameState; onStart: () => void }) {
  const style = POWER_STYLE[state.power];
  const recap = sinceLastTurn(state.log, state.power);
  const exiled = !capitalHeld(state, state.power);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <div className="overlay" onClick={onStart}>
      <div className="turn-card" style={{ borderColor: style.color }} onClick={(e) => e.stopPropagation()}>
        <div className="dim">
          Round {state.round} · {SIDE[state.power]} player
        </div>
        <h1 style={{ color: style.text }}>{style.name}</h1>
        <div className="turn-money">
          {exiled ? (
            <span className="bad">Your capital is in enemy hands: you cannot buy units or collect income.</span>
          ) : (
            <>
              <strong>{state.treasury[state.power]} IPCs</strong> to spend · income {income(state, state.power)} per turn
            </>
          )}
        </div>
        {recap.length > 0 && (
          <div className="turn-recap">
            <div className="dim">Since your last turn</div>
            {recap.slice(-12).map((l, i) => (
              <div key={i}>{readable(l)}</div>
            ))}
          </div>
        )}
        <button className="primary wide" onClick={onStart} autoFocus>
          {state.phase === 'purchase' ? 'Start turn' : 'Continue turn'}
        </button>
      </div>
    </div>
  );
}

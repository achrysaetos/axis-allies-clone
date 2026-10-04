import { useEffect } from 'react';
import { SIDE } from '../../engine/data';
import { capitalHeld, income } from '../../engine/queries';
import type { GameState } from '../../engine/types';
import { POWER_STYLE, readable } from '../theme';

const NOTABLE = /captures|liberates|seizes|Raid on|Battle in|lost|win with|cannot collect/;
const TURN_END = /collects \d+ IPCs|cannot collect income/;

/** What the previous power did, so the next player catches up at a glance. */
function lastTurn(log: string[]): string[] {
  let end = log.length;
  while (end > 0 && !TURN_END.test(log[end - 1]!)) end -= 1;
  let start = end - 1;
  while (start > 0 && !TURN_END.test(log[start - 1]!)) start -= 1;
  return log.slice(Math.max(start, 0), end).filter((l) => NOTABLE.test(l));
}

export function TurnCard({ state, onStart }: { state: GameState; onStart: () => void }) {
  const style = POWER_STYLE[state.power];
  const recap = lastTurn(state.log);
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
            <div className="dim">Last turn</div>
            {recap.slice(-8).map((l, i) => (
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

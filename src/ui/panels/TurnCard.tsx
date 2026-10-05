import { useEffect } from 'react';
import { SIDE } from '../../engine/data';
import { capitalHeld, income } from '../../engine/queries';
import type { GameState, Power } from '../../engine/types';
import { POWER_STYLE, readable } from '../theme';
import { PowerTag } from '../units';

const NOTABLE = /captures|liberates|seizes|bombs|battle for|holds against|retreats|clears|lost|win with|cannot collect/;
const RECAP_PER_TURN = 4;
/** Territory changing hands is the news a returning player needs first. */
const captured = (l: string) => /captures|liberates|seizes/.test(l);
const ENDED = /^(\w+) (collects \d+ IPCs|cannot collect income)/;

/**
 * Everything notable since this power's last turn ended, grouped by the turn it happened in, so the returning player
 * catches up at a glance. Lines from a turn still in progress are left out.
 */
export function sinceLastTurn(log: string[], power: Power): { power: Power; lines: string[] }[] {
  const endedMine = (l: string) => l.match(ENDED)?.[1] === power;
  let start = log.length;
  while (start > 0 && !endedMine(log[start - 1]!)) start -= 1;
  const out: { power: Power; lines: string[] }[] = [];
  let lines: string[] = [];
  for (const l of log.slice(start)) {
    if (NOTABLE.test(l)) lines.push(l);
    const end = l.match(ENDED);
    if (!end) continue;
    if (lines.length > 0) out.push({ power: end[1] as Power, lines });
    lines = [];
  }
  return out;
}

export function TurnCard({
  state,
  onStart,
  playedHere,
}: {
  state: GameState;
  onStart: () => void;
  /** Powers whose turns this same player just played, so the recap skips news they already saw. */
  playedHere: (p: Power) => boolean;
}) {
  const style = POWER_STYLE[state.power];
  const recap = sinceLastTurn(state.log, state.power).filter((g) => !playedHere(g.power));
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
              <strong>
                {state.treasury[state.power]} IPC{state.treasury[state.power] === 1 ? '' : 's'}
              </strong>{' '}
              {state.phase === 'purchase' ? 'to spend' : 'in the treasury'} · income {income(state, state.power)} per turn
            </>
          )}
        </div>
        {recap.length > 0 && (
          <div className="turn-recap">
            <div className="dim">Since your last turn</div>
            {recap.map((g, i) => (
              <div key={i} className="recap-turn">
                <PowerTag power={g.power} />
                <ul>
                  {[...g.lines.filter(captured), ...g.lines.filter((l) => !captured(l))].slice(0, RECAP_PER_TURN).map((l, j) => (
                    <li key={j} className={captured(l) ? 'capture' : undefined}>
                      {readable(l)}
                    </li>
                  ))}
                  {g.lines.length > RECAP_PER_TURN && (
                    <li className="dim">and {g.lines.length - RECAP_PER_TURN} more in the game log</li>
                  )}
                </ul>
              </div>
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

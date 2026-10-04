import { SIDE, VICTORY_CITIES, VICTORY_THRESHOLD } from '../../engine/data';
import { income } from '../../engine/queries';
import { POWERS } from '../../engine/types';
import type { GameState, Side } from '../../engine/types';
import { POWER_STYLE } from '../theme';

/** The end of the game: who won, the victory cities that decided it, and where each power finished. */
export function Victory({
  state,
  winner,
  onMenu,
  onLook,
}: {
  state: GameState;
  winner: Side;
  onMenu: () => void;
  onLook: () => void;
}) {
  const held = VICTORY_CITIES.filter((id) => {
    const o = state.owner[id];
    return o !== undefined && SIDE[o] === winner;
  });
  return (
    <div className="overlay">
      <div className="turn-card victory">
        <div className="dim">Round {state.round}</div>
        <h1>The {winner} win</h1>
        <p>
          Holding {held.length} of the {VICTORY_THRESHOLD[state.options.victory][winner]} victory cities needed: {held.join(', ')}
          .
        </p>
        <div className="final-powers">
          {POWERS.map((p) => (
            <div key={p} className="final-power" style={{ borderColor: POWER_STYLE[p].color }}>
              <strong style={{ color: POWER_STYLE[p].text }}>{POWER_STYLE[p].name}</strong>
              <span className="dim">income {income(state, p)}</span>
            </div>
          ))}
        </div>
        <div className="row actions">
          <button onClick={onLook}>Look at the board</button>
          <span className="grow" />
          <button className="primary" autoFocus onClick={onMenu}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}

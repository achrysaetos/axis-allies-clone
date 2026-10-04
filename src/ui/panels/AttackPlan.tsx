import type { SpaceId } from '../../engine/types';
import { oddsClass } from '../odds';
import type { Forecast } from '../odds';

export function OddsTag({ f }: { f: Forecast }) {
  return (
    <span
      className={`tag ${oddsClass(f.win)}`}
      title={`Expected losses: you about ${Math.round(f.attLoss)} IPCs, defender about ${Math.round(f.defLoss)} IPCs`}
    >
      {Math.round(f.win * 100)}% win
    </span>
  );
}

export function AttackPlan({ forecasts, onFocus }: { forecasts: Forecast[]; onFocus: (id: SpaceId) => void }) {
  if (forecasts.length === 0) return null;
  return (
    <section className="panel">
      <h3>Planned attacks</h3>
      {forecasts.map((f) => (
        <div key={f.space} className="battle-row">
          <button className="link grow left" onClick={() => onFocus(f.space)}>
            {f.space}
          </button>
          <span className="dim">
            −{Math.round(f.attLoss)} / −{Math.round(f.defLoss)} IPC
          </span>
          <OddsTag f={f} />
        </div>
      ))}
      <div className="dim small">Win chance from simulated dice. IPC figures are expected losses for you and the defender.</div>
    </section>
  );
}

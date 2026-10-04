import { useState } from 'react';
import { newGame } from '../../engine/state';
import { POWERS } from '../../engine/types';
import type { Options, Power } from '../../engine/types';
import { newSession, parseSession } from '../session';
import type { Controller, Session } from '../session';
import { PowerTag } from '../units';

interface Props {
  saved: Session | null;
  onStart: (s: Session) => void;
}

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

export function SetupScreen({ saved, onStart }: Props) {
  const [seed, setSeed] = useState(randomSeed);
  const [controllers, setControllers] = useState<Record<Power, Controller>>({
    Russians: 'human',
    Germans: 'ai',
    British: 'human',
    Japanese: 'ai',
    Americans: 'human',
  });
  const [victory, setVictory] = useState<Options['victory']>('standard');
  const [straits, setStraits] = useState(false);
  const [escorts, setEscorts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const s = parseSession(await file.text());
    if (typeof s === 'string') setError(s);
    else onStart(s);
  };

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Axis &amp; Allies 1942</h1>
        {saved && (
          <button className="primary wide" onClick={() => onStart(saved)}>
            Continue: round {saved.state.round}, {saved.state.power}
          </button>
        )}
        <h2>New game</h2>
        <div className="setup-grid">
          {POWERS.map((p) => (
            <div key={p} className="row">
              <PowerTag power={p} />
              <span className="grow" />
              <span className="segmented">
                {(['human', 'ai'] as const).map((c) => (
                  <button
                    key={c}
                    className={controllers[p] === c ? 'on' : undefined}
                    onClick={() => setControllers({ ...controllers, [p]: c })}
                  >
                    {c === 'human' ? 'Human' : 'AI'}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="row">
          <span className="grow">Victory</span>
          <span className="segmented">
            {(['standard', 'total'] as const).map((v) => (
              <button key={v} className={victory === v ? 'on' : undefined} onClick={() => setVictory(v)}>
                {v === 'standard' ? 'Standard (9 / 10 cities)' : 'Total (13 cities)'}
              </button>
            ))}
          </span>
        </div>
        <label className="row">
          <input type="checkbox" checked={straits} onChange={(e) => setStraits(e.target.checked)} />
          <span className="grow">Turkish straits closed</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={escorts} onChange={(e) => setEscorts(e.target.checked)} />
          <span className="grow">Bombing raid escorts and interceptors</span>
        </label>
        <label className="row">
          <span className="grow">Dice seed</span>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
          <button onClick={() => setSeed(randomSeed())}>↻</button>
        </label>
        <button
          className="primary wide"
          onClick={() => onStart(newSession(newGame(seed, { victory, turkishStraitsClosed: straits, sbrEscortsInterceptors: escorts }), controllers))}
        >
          Start new game
        </button>
        <label className="import">
          Import saved game…
          <input type="file" accept="application/json,.json" onChange={(e) => void importFile(e.target.files?.[0])} />
        </label>
        {error && <div className="bad">{error}</div>}
      </div>
    </div>
  );
}

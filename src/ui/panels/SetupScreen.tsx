import { useState } from 'react';
import { SIDE } from '../../engine/data';
import { newGame } from '../../engine/state';
import { POWERS } from '../../engine/types';
import type { Options, Power, Side } from '../../engine/types';
import type { CreateRoomRequest, CreateRoomResponse } from '../../net/protocol';
import { newSession, parseSession } from '../session';
import type { Controller, Session } from '../session';
import { powerName } from '../theme';
import { PowerTag } from '../units';

interface Props {
  saved: Session | null;
  onStart: (s: Session) => void;
}

const SIDES: Side[] = ['Allies', 'Axis'];

export function SetupScreen({ saved, onStart }: Props) {
  const [players, setPlayers] = useState<Record<Side, Controller>>({ Allies: 'human', Axis: 'human' });
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

  const [replacing, setReplacing] = useState(false);

  const [creating, setCreating] = useState(false);
  const options: Partial<Options> = { victory, turkishStraitsClosed: straits, sbrEscortsInterceptors: escorts };

  const playOnline = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options } satisfies CreateRoomRequest),
      });
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const { id } = (await res.json()) as CreateRoomResponse;
      location.hash = `#/g/${id}`;
    } catch (e) {
      setError(`Could not start an online game: ${e instanceof Error ? e.message : String(e)}`);
      setCreating(false);
    }
  };

  const start = () => {
    if (saved && !replacing) return setReplacing(true);
    const controllers = Object.fromEntries(POWERS.map((p) => [p, players[SIDE[p]]])) as Record<Power, Controller>;
    const seed = Math.floor(Math.random() * 1_000_000_000);
    onStart(newSession(newGame(seed, options), controllers));
  };

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Axis &amp; Allies 1942</h1>
        <p className="dim">Second Edition. Two players share this screen and take turns.</p>
        {saved && (
          <button className="primary wide" onClick={() => onStart(saved)}>
            Continue: round {saved.state.round}, {powerName(saved.state.power)}
          </button>
        )}
        <h2>New game</h2>
        <div className="sides">
          {SIDES.map((side) => (
            <div key={side} className="side">
              <div className="side-head">
                <strong>{side}</strong>
                <span className="segmented">
                  {(['human', 'ai'] as const).map((c) => (
                    <button
                      key={c}
                      className={players[side] === c ? 'on' : undefined}
                      onClick={() => setPlayers({ ...players, [side]: c })}
                    >
                      {c === 'human' ? 'Player' : 'Computer'}
                    </button>
                  ))}
                </span>
              </div>
              {POWERS.filter((p) => SIDE[p] === side).map((p) => (
                <PowerTag key={p} power={p} />
              ))}
            </div>
          ))}
        </div>
        <h2>Rules</h2>
        <div className="row">
          <span className="grow">Victory</span>
          <span className="segmented">
            {(['standard', 'total'] as const).map((v) => (
              <button key={v} className={victory === v ? 'on' : undefined} onClick={() => setVictory(v)}>
                {v === 'standard' ? 'Standard: 9 Axis / 10 Allies cities' : 'Total: all 13 cities'}
              </button>
            ))}
          </span>
        </div>
        <label className="row">
          <input type="checkbox" checked={straits} onChange={(e) => setStraits(e.target.checked)} />
          <span className="grow">Optional: Turkey closes the straits to ships (sea zone 16)</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={escorts} onChange={(e) => setEscorts(e.target.checked)} />
          <span className="grow">Optional: fighters escort and intercept bombing raids</span>
        </label>
        {replacing && saved && (
          <div className="warn-text">
            This replaces your saved game at round {saved.state.round}, {powerName(saved.state.power)}. Press again to confirm.
          </div>
        )}
        <button className="primary wide" onClick={start}>
          {replacing ? 'Replace saved game and start' : 'Start new game'}
        </button>
        <button className="wide" onClick={() => void playOnline()} disabled={creating}>
          {creating ? 'Starting online game…' : 'Play online with friends'}
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

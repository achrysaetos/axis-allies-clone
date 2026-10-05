import { useState } from 'react';
import type { CSSProperties } from 'react';
import { SETUP, SIDE } from '../../engine/data';
import { newGame } from '../../engine/state';
import { POWERS } from '../../engine/types';
import type { Options, Power } from '../../engine/types';
import type { CreateRoomRequest, CreateRoomResponse } from '../../net/protocol';
import { MAP_HEIGHT, MAP_WIDTH, SHAPES } from '../map/geometry';
import { newSession, parseSession } from '../session';
import type { Controller, Session } from '../session';
import { NEUTRAL_FILL, PHASE_LABEL, POWER_STYLE, SEA_FILL, powerName } from '../theme';

interface Props {
  saved: Session | null;
  onStart: (s: Session) => void;
}

type Where = 'here' | 'online';
type Seats = Record<Power, Controller>;

const OPENING = newGame(0);
const all = (c: (p: Power) => Controller) => Object.fromEntries(POWERS.map((p) => [p, c(p)])) as Seats;
const PRESETS: { label: string; seats: Seats }[] = [
  { label: 'Everyone plays', seats: all(() => 'human') },
  { label: 'I play the Allies', seats: all((p) => (SIDE[p] === 'Allies' ? 'human' : 'ai')) },
  { label: 'I play the Axis', seats: all((p) => (SIDE[p] === 'Axis' ? 'human' : 'ai')) },
];
const same = (a: Seats, b: Seats) => POWERS.every((p) => a[p] === b[p]);

/** The 1942 world as it opens, with one power's territories lit while its seat is pointed at. */
function Backdrop({ lit }: { lit: Power | null }) {
  return (
    <svg className="home-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {SHAPES.map((s) => {
        const o = OPENING.owner[s.id];
        const fill = s.water ? SEA_FILL : o ? POWER_STYLE[o].color : NEUTRAL_FILL;
        const dim = lit !== null && !s.water && o !== lit;
        return <path key={s.id} d={s.d} fill={fill} className={dim ? 'dim' : undefined} />;
      })}
    </svg>
  );
}

function SeatCard({
  power,
  who,
  onToggle,
  onHover,
}: {
  power: Power;
  who: Controller;
  onToggle: () => void;
  onHover: (p: Power | null) => void;
}) {
  const style = POWER_STYLE[power];
  const player = who === 'human';
  return (
    <button
      className={player ? 'seat-card player' : 'seat-card'}
      style={{ '--power': style.color, '--power-text': style.text } as CSSProperties}
      onClick={onToggle}
      onPointerEnter={() => onHover(power)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(power)}
      onBlur={() => onHover(null)}
      aria-pressed={player}
    >
      <span className="seat-band" />
      <span className="seat-name">{style.name}</span>
      <span className="seat-facts">
        {SIDE[power]} · {SETUP.treasury[power]} IPCs
      </span>
      <span className="seat-who">
        <span className="seat-icon">{player ? '♟' : '⚙'}</span>
        {player ? 'Player' : 'Computer'}
      </span>
    </button>
  );
}

export function SetupScreen({ saved, onStart }: Props) {
  const [seats, setSeats] = useState<Seats>(PRESETS[0]!.seats);
  const [where, setWhere] = useState<Where>('here');
  const [victory, setVictory] = useState<Options['victory']>('standard');
  const [straits, setStraits] = useState(false);
  const [escorts, setEscorts] = useState(false);
  const [lit, setLit] = useState<Power | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = POWERS.filter((p) => seats[p] === 'human').length;
  const options: Partial<Options> = { victory, turkishStraitsClosed: straits, sbrEscortsInterceptors: escorts };
  const rulesSummary = [
    victory === 'standard' ? 'Standard victory' : 'Total victory',
    straits && 'straits closed',
    escorts && 'raid escorts',
  ]
    .filter(Boolean)
    .join(' · ');

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const s = parseSession(await file.text());
    if (typeof s === 'string') setError(s);
    else onStart(s);
  };

  const playOnline = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options, computer: POWERS.filter((p) => seats[p] === 'ai') } satisfies CreateRoomRequest),
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
    if (where === 'online') return void playOnline();
    if (saved && !replacing) return setReplacing(true);
    onStart(newSession(newGame(Math.floor(Math.random() * 1_000_000_000), options), seats));
  };

  const cast =
    players === 0
      ? 'The computer plays all five powers. Sit back and watch the war.'
      : players === 5
        ? where === 'here'
          ? 'Five players take turns at this screen.'
          : 'Up to five friends each take a power from the invite link.'
        : `${players} ${players === 1 ? 'player' : 'players'} against ${5 - players} computer ${5 - players === 1 ? 'power' : 'powers'}.`;
  const blocked = where === 'online' && players === 0 ? 'An online game needs at least one player seat.' : null;

  return (
    <div className="home">
      <Backdrop lit={lit} />
      <main className="home-panel">
        <header className="home-head">
          <div className="eyebrow">Second Edition · Spring 1942</div>
          <h1>Axis &amp; Allies 1942</h1>
          <p className="tagline">Five powers, one world at war. Command them at one screen, or send friends a link.</p>
        </header>

        {saved && (
          <button className="resume" onClick={() => onStart(saved)}>
            <span className="resume-dot" style={{ background: POWER_STYLE[saved.state.power].color }} />
            <span className="grow">
              <strong>Continue your game</strong>
              <span className="dim">
                Round {saved.state.round} · {powerName(saved.state.power)} · {PHASE_LABEL[saved.state.phase]}
              </span>
            </span>
            <span className="resume-go">▶</span>
          </button>
        )}

        <section>
          <div className="home-step">
            <h2>Who plays?</h2>
            <span className="presets">
              {PRESETS.map((p) => (
                <button key={p.label} className={same(seats, p.seats) ? 'on' : undefined} onClick={() => setSeats(p.seats)}>
                  {p.label}
                </button>
              ))}
            </span>
          </div>
          <div className="seat-cards">
            {POWERS.map((p) => (
              <SeatCard
                key={p}
                power={p}
                who={seats[p]}
                onHover={setLit}
                onToggle={() => setSeats((s) => ({ ...s, [p]: s[p] === 'human' ? 'ai' : 'human' }))}
              />
            ))}
          </div>
          <p className="cast">{cast} Tap a power to switch it. Powers move in this order.</p>
        </section>

        <section>
          <h2>Where?</h2>
          <div className="where">
            {(
              [
                ['here', 'On this screen', 'Pass and play. Saved in this browser as you go.'],
                ['online', 'Online with friends', 'Get a link. Play live, or take turns whenever you like.'],
              ] as const
            ).map(([w, title, text]) => (
              <button
                key={w}
                className={where === w ? 'where-card on' : 'where-card'}
                onClick={() => setWhere(w)}
                aria-pressed={where === w}
              >
                <strong>{title}</strong>
                <span>{text}</span>
              </button>
            ))}
          </div>
        </section>

        <details className="rules">
          <summary>
            Rules <span className="dim">· {rulesSummary}</span>
          </summary>
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
            <span className="grow">Turkey closes the straits to ships (sea zone 16)</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={escorts} onChange={(e) => setEscorts(e.target.checked)} />
            <span className="grow">Fighters escort and intercept bombing raids</span>
          </label>
        </details>

        {replacing && saved && where === 'here' && (
          <div className="warn-text">
            This replaces your saved game at round {saved.state.round}, {powerName(saved.state.power)}. Press again to confirm.
          </div>
        )}
        {blocked && <div className="warn-text">{blocked}</div>}
        {error && <div className="bad">{error}</div>}
        <button className="primary start" onClick={start} disabled={creating || !!blocked}>
          {where === 'online'
            ? creating
              ? 'Creating the game…'
              : 'Create game and get the link'
            : replacing
              ? 'Replace saved game and start'
              : 'Start the war'}
        </button>
        <label className="import">
          Import a saved game…
          <input type="file" accept="application/json,.json" onChange={(e) => void importFile(e.target.files?.[0])} />
        </label>
      </main>
    </div>
  );
}

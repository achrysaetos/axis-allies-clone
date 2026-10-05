import { useState } from 'react';
import { POWERS } from '../../engine/types';
import type { Power } from '../../engine/types';
import type { RoomConnection } from '../../net/client';
import { COMPUTER, NAME_MAX } from '../../net/protocol';
import { usePush } from '../../net/push';
import type { Bell } from '../../net/push';
import type { RoomView } from '../../net/protocol';
import { POWER_STYLE, powerName } from '../theme';

interface Props {
  room: RoomView;
  me: RoomConnection['me'];
  status: RoomConnection['status'];
  send: RoomConnection['send'];
  onInfo: (text: string) => void;
}

const BELL_TITLE: Record<Bell, string> = {
  on: "Notify me when it's my move: on",
  off: "Notify me when it's my move",
  blocked: "Notify me when it's my move: blocked in this browser's site settings",
};

type SeatTo = 'me' | 'computer' | 'open';

/** Who holds each power; clicking a seat offers what can be done with it. */
export function SeatStrip({ room, me, status, send, onInfo }: Props) {
  const [asking, setAsking] = useState<Power | null>(null);
  const player = (p: Power) => room.players.find((x) => x.id === room.seats[p]);
  const push = usePush(me, send);

  const seat = (power: Power, to: SeatTo) => {
    setAsking(null);
    if (to === 'me' && 'Notification' in window && Notification.permission === 'default') void push.enable();
    send({ t: 'seat', power, to });
  };

  const onSeat = (p: Power) => {
    if (!me) return onInfo('Pick a name first.');
    const h = player(p);
    if (h && h.id !== me && h.online) return onInfo(`${h.name} is playing ${powerName(p)}.`);
    setAsking(p);
  };

  /** The question and the choices for a seat, by who holds it now. */
  const choices = (p: Power): { question: string; options: [SeatTo, string][] } => {
    const name = powerName(p);
    const holder = room.seats[p];
    if (holder === null)
      return {
        question: `${name} is open.`,
        options: [
          ['me', `Play ${name}`],
          ['computer', 'Let the computer play it'],
        ],
      };
    if (holder === COMPUTER)
      return {
        question: `The computer plays ${name}.`,
        options: [
          ['me', `Take ${name}`],
          ['open', 'Open the seat'],
        ],
      };
    if (holder === me)
      return {
        question: `You play ${name}.`,
        options: [
          ['computer', 'Hand it to the computer'],
          ['open', `Release ${name}`],
        ],
      };
    return {
      question: `${player(p)?.name ?? 'Someone'} holds ${name} but is offline.`,
      options: [
        ['me', `Take ${name}`],
        ['computer', 'Hand it to the computer'],
      ],
    };
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(location.href).then(
      () => onInfo('Invite link copied. Send it to a friend.'),
      () => onInfo(`Copy this link: ${location.href}`),
    );
  };

  const ask = asking && choices(asking);
  return (
    <div className="seats">
      {POWERS.map((p) => {
        const h = player(p);
        const computer = room.seats[p] === COMPUTER;
        const style = POWER_STYLE[p];
        const label = computer ? 'Computer' : h ? h.name : 'open';
        return (
          <button
            key={p}
            className={h?.id === me && me ? 'seat mine' : 'seat'}
            onClick={() => onSeat(p)}
            title={`${powerName(p)}: ${computer ? 'played by the computer' : h ? `${h.name}${h.online ? '' : ' (offline)'}` : 'open seat'}`}
          >
            <span className="seat-tag" style={{ background: style.color, color: style.ink }}>
              {style.short}
            </span>
            <span className={h || computer ? 'seat-name' : 'seat-name dim'}>{label}</span>
            {(h || computer) && <span className={computer || h?.online ? 'dot on' : 'dot'} />}
          </button>
        );
      })}
      <button className="link" onClick={copyInvite}>
        Copy invite link
      </button>
      {me && push.bell && (
        <button
          className={`bell ${push.bell}`}
          title={BELL_TITLE[push.bell]}
          aria-pressed={push.bell === 'on'}
          onClick={() => {
            if (push.bell === 'blocked')
              onInfo("This browser blocks this site's notifications. Allow them in the site settings.");
            else void (push.bell === 'on' ? push.disable() : push.enable());
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v3L2 11.5h12L12.5 9V6A4.5 4.5 0 0 0 8 1.5zM6.2 13a1.8 1.8 0 0 0 3.6 0z" />
            {push.bell !== 'on' && <path d="M2 2l12 12" strokeWidth="1.6" />}
          </svg>
        </button>
      )}
      {status !== 'open' && <span className="reconnecting">Reconnecting…</span>}
      {asking && ask && (
        <div className="seat-ask">
          <div className="dim">{ask.question}</div>
          {ask.options.map(([to, text], i) => (
            <button key={to} className={i === 0 ? 'primary' : undefined} autoFocus={i === 0} onClick={() => seat(asking, to)}>
              {text}
            </button>
          ))}
          <button onClick={() => setAsking(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export function NamePrompt({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="overlay">
      <form
        className="turn-card name-prompt"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onJoin(name.trim());
        }}
      >
        <h2>Join this game</h2>
        <input autoFocus maxLength={NAME_MAX} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary wide" type="submit" disabled={!name.trim()}>
          Join
        </button>
      </form>
    </div>
  );
}

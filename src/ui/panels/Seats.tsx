import { useState } from 'react';
import { POWERS } from '../../engine/types';
import type { Power } from '../../engine/types';
import type { RoomConnection } from '../../net/client';
import { NAME_MAX } from '../../net/protocol';
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

/** Who holds each power; clicking a seat takes, reclaims or releases it. */
export function SeatStrip({ room, me, status, send, onInfo }: Props) {
  const [asking, setAsking] = useState<{ power: Power; release: boolean } | null>(null);
  const holder = (p: Power) => room.players.find((x) => x.id === room.seats[p]);
  const push = usePush(me, send);

  const take = (power: Power) => {
    setAsking(null);
    if ('Notification' in window && Notification.permission === 'default') void push.enable();
    send({ t: 'seat', power, take: true });
  };

  const onSeat = (p: Power) => {
    const h = holder(p);
    if (!me) return onInfo('Pick a name first.');
    if (!h) return take(p);
    if (h.id === me) return setAsking({ power: p, release: true });
    if (h.online) return onInfo(`${h.name} is playing ${powerName(p)}.`);
    setAsking({ power: p, release: false });
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(location.href).then(
      () => onInfo('Invite link copied. Send it to a friend.'),
      () => onInfo(`Copy this link: ${location.href}`),
    );
  };

  const asked = asking && holder(asking.power);
  return (
    <div className="seats">
      {POWERS.map((p) => {
        const h = holder(p);
        const style = POWER_STYLE[p];
        return (
          <button
            key={p}
            className={h?.id === me && me ? 'seat mine' : 'seat'}
            onClick={() => onSeat(p)}
            title={
              h ? `${powerName(p)}: ${h.name}${h.online ? '' : ' (offline)'}` : `${powerName(p)}: open seat, click to take it`
            }
          >
            <span className="seat-tag" style={{ background: style.color, color: style.ink }}>
              {style.short}
            </span>
            <span className={h ? 'seat-name' : 'seat-name dim'}>{h ? h.name : 'open'}</span>
            {h && <span className={h.online ? 'dot on' : 'dot'} />}
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
      {asking && (
        <div className="seat-ask">
          <div className="dim">
            {asking.release
              ? `Give up ${powerName(asking.power)}? Anyone can then take it.`
              : `${asked?.name ?? 'Someone'} holds ${powerName(asking.power)} but is offline. Take it over?`}
          </div>
          <button
            className="primary"
            autoFocus
            onClick={() => {
              setAsking(null);
              if (asking.release) send({ t: 'seat', power: asking.power, take: false });
              else take(asking.power);
            }}
          >
            {asking.release ? `Release ${powerName(asking.power)}` : `Take ${powerName(asking.power)}`}
          </button>
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

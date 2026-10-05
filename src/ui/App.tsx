import { useEffect, useMemo, useRef, useState } from 'react';
import { actingPower } from '../engine/game';
import { POWERS } from '../engine/types';
import type { Power } from '../engine/types';
import { useRoom } from '../net/client';
import { ROOM_ID } from '../net/protocol';
import { Game } from './Game';
import { NamePrompt } from './panels/Seats';
import { SetupScreen } from './panels/SetupScreen';
import { loadAutosave } from './saves';
import type { Controller, Session } from './session';
import { powerName } from './theme';

function roomInHash(): string | null {
  const id = location.hash.match(/^#\/g\/([^/]+)$/)?.[1];
  return id && ROOM_ID.test(id) ? id : null;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState(roomInHash);
  useEffect(() => {
    const onHash = () => setRoom(roomInHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (room) {
    const leave = () => {
      history.pushState(null, '', location.pathname + location.search);
      setRoom(null);
    };
    return <OnlineGame key={room} id={room} onLeave={leave} />;
  }
  if (!session) return <SetupScreen saved={loadAutosave()} onStart={setSession} />;
  return <Game session={session} setSession={setSession} onMenu={() => setSession(null)} />;
}

const TITLE = document.title;

function OnlineGame({ id, onLeave }: { id: string; onLeave: () => void }) {
  const conn = useRoom(id);
  const { room, me, synced } = conn;
  const [local, setLocal] = useState<Pick<Session, 'state' | 'fallen'> | null>(null);
  useEffect(() => {
    // While this tab's own actions are in flight, its optimistic board is ahead of the server's last word.
    if (room && synced) setLocal({ state: room.state, fallen: room.fallen });
  }, [room, synced]);
  const seats = room?.seats;
  const controllers = useMemo(
    () => Object.fromEntries(POWERS.map((p) => [p, me && seats?.[p] === me ? 'human' : 'remote'])) as Record<Power, Controller>,
    [seats, me],
  );

  const myTurn = !!room && !!me && !room.state.winner && room.seats[actingPower(room.state)] === me;
  // Null until the first room arrives, so opening the link on your own turn is not announced as a new turn.
  const wasMyTurn = useRef<boolean | null>(null);
  useEffect(() => {
    if (!room) return;
    if (myTurn && wasMyTurn.current === false && document.hidden) {
      document.title = `▶ ${TITLE}`;
      if ('Notification' in window && Notification.permission === 'granted')
        new Notification(TITLE, { body: `Your move as ${powerName(actingPower(room.state))}.`, tag: `aa1942-${id}` });
    }
    if (!myTurn) document.title = TITLE;
    wasMyTurn.current = myTurn;
  }, [myTurn, room, id]);
  useEffect(() => {
    const clear = () => {
      if (!document.hidden) document.title = TITLE;
    };
    window.addEventListener('focus', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('focus', clear);
      document.removeEventListener('visibilitychange', clear);
      document.title = TITLE;
    };
  }, []);

  if (!room || !local) {
    return (
      <div className="setup">
        <div className="setup-card">
          <h1>Axis &amp; Allies 1942</h1>
          <p className={conn.lastError ? 'bad' : 'dim'}>{conn.lastError?.message ?? 'Connecting to the game…'}</p>
          <button className="wide" onClick={onLeave}>
            Main menu
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      <Game
        session={{ ...local, controllers, undo: [] }}
        setSession={(s) => setLocal({ state: s.state, fallen: s.fallen })}
        onMenu={onLeave}
        online={{ ...conn, room }}
      />
      {conn.status === 'open' && !me && <NamePrompt onJoin={(name) => conn.send({ t: 'join', name })} />}
    </>
  );
}

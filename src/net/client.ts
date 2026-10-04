import { useCallback, useEffect, useRef, useState } from 'react';
import { NO_SUCH_ROOM } from './protocol';
import type { ClientMsg, PlayerId, RoomView, ServerMsg } from './protocol';

export type Status = 'connecting' | 'open' | 'closed';

type Unversioned<M> = M extends { version: number } ? Omit<M, 'version'> : M;
/** The hook stamps game messages with the version the server will be at once everything already sent is accepted. */
export type Request = Unversioned<ClientMsg>;

export interface RoomConnection {
  room: RoomView | null;
  me: PlayerId | null;
  status: Status;
  send: (m: Request) => void;
  lastError: { message: string; id: number } | null;
  /** False while a game message this tab sent has not come back as a room update. */
  synced: boolean;
}

const tokenKey = (id: string) => `aa1942.room.${id}`;
const MAX_BACKOFF_MS = 10_000;

function loadToken(id: string): string | null {
  try {
    return localStorage.getItem(tokenKey(id));
  } catch {
    return null;
  }
}

function saveToken(id: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(tokenKey(id), token);
    else localStorage.removeItem(tokenKey(id));
  } catch {
    // Without storage this tab rejoins as a new player after a reload.
  }
}

function stamp(m: Request, version: number): ClientMsg {
  switch (m.t) {
    case 'act':
    case 'resolve':
    case 'undo':
      return { ...m, version };
    default:
      return m;
  }
}

export function useRoom(id: string): RoomConnection {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [me, setMe] = useState<PlayerId | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [lastError, setLastError] = useState<RoomConnection['lastError']>(null);
  const [synced, setSynced] = useState(true);
  const socket = useRef<WebSocket | null>(null);
  const expected = useRef(0);
  const resync = useRef(true);

  useEffect(() => {
    let ws: WebSocket;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    const connect = () => {
      setStatus('connecting');
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${id}/ws`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        resync.current = true;
        setStatus('open');
        ws.send(JSON.stringify({ t: 'hello', token: loadToken(id) } satisfies ClientMsg));
      };
      ws.onmessage = (e: MessageEvent<string>) => {
        const m = JSON.parse(e.data) as ServerMsg;
        if (m.t === 'welcome') {
          setMe(m.player);
          saveToken(id, m.token);
        } else if (m.t === 'error') {
          // The server follows every refusal with the room, which this tab then takes as the truth.
          resync.current = true;
          setLastError({ message: m.message, id: Date.now() });
        } else {
          const v = m.room.version;
          expected.current = resync.current ? v : Math.max(expected.current, v);
          resync.current = false;
          setRoom(m.room);
          setSynced(v === expected.current);
        }
      };
      ws.onclose = (e) => {
        if (socket.current === ws) socket.current = null;
        if (stopped) return;
        setStatus('closed');
        if (e.code === NO_SUCH_ROOM) return;
        retry = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt++));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ws.close();
    };
  }, [id]);

  const send = useCallback((m: Request) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setLastError({ message: 'Not connected to the game right now. Try again in a moment.', id: Date.now() });
      return;
    }
    const msg = stamp(m, expected.current);
    if ('version' in msg) {
      expected.current += 1;
      setSynced(false);
    }
    ws.send(JSON.stringify(msg));
  }, []);

  return { room, me, status, send, lastError, synced };
}

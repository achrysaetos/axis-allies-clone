import { DurableObject } from 'cloudflare:workers';
import { NO_SUCH_ROOM, ROOM_ID } from '../src/net/protocol';
import type { CreateRoomResponse, PlayerId, ServerMsg } from '../src/net/protocol';
import type { Options } from '../src/engine/types';
import { handle, newRoom, parseClientMsg, parseOptions, view } from './room';
import type { Outcome, RoomRecord } from './room';

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
}

interface Attachment {
  player: PlayerId | null;
}

const RECORD_KEY = 'room';
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

const roomId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => BASE32[b & 31]).join('');

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const body: unknown = await req.json().catch(() => null);
      const options = parseOptions(typeof body === 'object' && body !== null ? (body as { options?: unknown }).options : null);
      const id = roomId();
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
      await env.ROOMS.get(env.ROOMS.idFromName(id)).create(id, seed, options);
      return json({ id } satisfies CreateRoomResponse);
    }
    const ws = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (ws) {
      if (!ROOM_ID.test(ws[1]!)) return json({ error: 'no such game' }, 404);
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected a WebSocket upgrade' }, 426);
      return env.ROOMS.get(env.ROOMS.idFromName(ws[1]!)).fetch(req);
    }
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  private record: RoomRecord | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.record = await ctx.storage.get<RoomRecord>(RECORD_KEY);
    });
  }

  async create(id: string, seed: number, options: Partial<Options>): Promise<void> {
    if (this.record) throw new Error(`room ${id} already exists`);
    this.record = newRoom(id, seed, options);
    await this.ctx.storage.put(RECORD_KEY, this.record);
  }

  override async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ player: null } satisfies Attachment);
    if (!this.record) {
      server.send(JSON.stringify({ t: 'error', message: 'There is no game at this link.' } satisfies ServerMsg));
      server.close(NO_SUCH_ROOM, 'no such game');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const record = this.record;
    if (!record) return;
    const send = (m: ServerMsg) => ws.send(JSON.stringify(m));
    const msg = typeof data === 'string' ? parseClientMsg(data) : null;
    if (!msg) return send({ t: 'error', message: 'The server did not understand that message.' });
    const me = (ws.deserializeAttachment() as Attachment).player;
    let out: Outcome;
    try {
      out = handle(record, me, msg, this.online());
    } catch (e) {
      out = { record, error: `the server could not apply that: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (out.reply?.t === 'welcome') ws.serializeAttachment({ player: out.reply.player } satisfies Attachment);
    if (out.reply) send(out.reply);
    if (out.error) {
      send({ t: 'error', message: out.error });
      return send({ t: 'room', room: view(record, this.online()) });
    }
    if (out.record !== record) {
      this.record = out.record;
      await this.ctx.storage.put(RECORD_KEY, out.record);
    }
    // A welcome changes who is online even when the record stays the same.
    if (out.record !== record || out.reply?.t === 'welcome') this.broadcast();
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {
      // Already closed.
    }
    this.broadcast(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcast(ws);
  }

  private sockets(leaving?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => w !== leaving && w.readyState === WebSocket.OPEN);
  }

  private online(leaving?: WebSocket): Set<PlayerId> {
    const ids = this.sockets(leaving).map((w) => (w.deserializeAttachment() as Attachment | null)?.player);
    return new Set(ids.filter((p): p is PlayerId => !!p));
  }

  private broadcast(leaving?: WebSocket): void {
    if (!this.record) return;
    const text = JSON.stringify({ t: 'room', room: view(this.record, this.online(leaving)) } satisfies ServerMsg);
    for (const w of this.sockets(leaving)) w.send(text);
  }
}

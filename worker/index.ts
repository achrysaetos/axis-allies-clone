import { DurableObject } from 'cloudflare:workers';
import { NO_SUCH_ROOM, ROOM_ID } from '../src/net/protocol';
import type { CreateRoomResponse, PlayerId, PushKeyResponse, PushPayload, ServerMsg } from '../src/net/protocol';
import { POWERS } from '../src/engine/types';
import type { Options, Power } from '../src/engine/types';
import { loadVapid, pushRequest } from './push';
import type { VapidEnv } from './push';
import { computerToMove, computerTurn, handle, newRoom, parseClientMsg, parseOptions, view, whoToNotify } from './room';
import type { Notice, Outcome, RoomRecord } from './room';

interface Env extends VapidEnv {
  ROOMS: DurableObjectNamespace<Room>;
}

interface Attachment {
  player: PlayerId | null;
}

const RECORD_KEY = 'room';
const COMPUTER_PAUSE_MS = 150;
const COMPUTER_BURST_MS = 200;
const COMPUTER_RETRY_MS = 3000;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

const roomId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((b) => BASE32[b & 31]).join('');

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const body: unknown = await req.json().catch(() => null);
      const request = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const options = parseOptions(request.options);
      const computer = Array.isArray(request.computer) ? POWERS.filter((p) => (request.computer as unknown[]).includes(p)) : [];
      const id = roomId();
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
      await env.ROOMS.get(env.ROOMS.idFromName(id)).create(id, seed, options, computer);
      return json({ id } satisfies CreateRoomResponse);
    }
    if (req.method === 'GET' && url.pathname === '/api/push-key') {
      const on = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK && env.VAPID_SUBJECT);
      return json({ key: on ? env.VAPID_PUBLIC_KEY! : null } satisfies PushKeyResponse);
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
      const stored = await ctx.storage.get<RoomRecord>(RECORD_KEY);
      // Rooms created before push notifications have no subscriptions.
      this.record = stored && { ...stored, pushes: stored.pushes ?? [] };
    });
  }

  async create(id: string, seed: number, options: Partial<Options>, computer: Power[]): Promise<void> {
    if (this.record) throw new Error(`room ${id} already exists`);
    this.record = newRoom(id, seed, options, computer);
    await this.ctx.storage.put(RECORD_KEY, this.record);
    if (computerToMove(this.record)) await this.ctx.storage.setAlarm(Date.now() + COMPUTER_PAUSE_MS);
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
    if (out.record !== record) await this.commit(record, out.record);
    // A welcome changes who is online even when the record stays the same.
    else if (out.reply?.t === 'welcome') this.broadcast();
  }

  /** Stores an accepted change, tells everyone, and wakes the computer if one of its seats is now to act. */
  private async commit(before: RoomRecord, after: RoomRecord): Promise<void> {
    this.record = after;
    await this.ctx.storage.put(RECORD_KEY, after);
    const notices = whoToNotify(before, after, this.online());
    if (notices.length > 0) this.ctx.waitUntil(this.push(notices));
    this.broadcast();
    if (computerToMove(after)) await this.ctx.storage.setAlarm(Date.now() + COMPUTER_PAUSE_MS);
  }

  /** The computer plays in short bursts, so friends watch its moves arrive one after another. */
  override async alarm(): Promise<void> {
    const record = this.record;
    if (!record) return;
    const out = computerTurn(record, COMPUTER_BURST_MS);
    if (!out) return;
    if (out.error) {
      console.warn(`computer is stuck: ${out.error}`);
      await this.ctx.storage.setAlarm(Date.now() + COMPUTER_RETRY_MS);
      return;
    }
    await this.commit(record, out.record);
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

  private async push(notices: Notice[]): Promise<void> {
    const vapid = await loadVapid(this.env);
    if (!vapid || !this.record) return;
    const url = `/#/g/${this.record.id}`;
    const gone = new Set<string>();
    const sends = notices.flatMap(({ player, title, body }) =>
      this.record!.pushes.filter((s) => s.player === player).map(async (s) => {
        const res = await fetch(await pushRequest(s, JSON.stringify({ title, body, url } satisfies PushPayload), vapid));
        console.log(`push to ${new URL(s.endpoint).host}: ${res.status}${res.ok ? '' : ` ${await res.text()}`}`);
        if (res.status === 404 || res.status === 410) gone.add(s.endpoint);
      }),
    );
    for (const r of await Promise.allSettled(sends)) if (r.status === 'rejected') console.warn('push failed', r.reason);
    if (gone.size === 0 || !this.record) return;
    this.record = { ...this.record, pushes: this.record.pushes.filter((s) => !gone.has(s.endpoint)) };
    await this.ctx.storage.put(RECORD_KEY, this.record);
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

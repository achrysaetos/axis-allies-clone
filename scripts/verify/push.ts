/**
 * End to end check of push notifications against a running Worker and a real push service.
 * This script plays a browser at Mozilla's push service (the protocol Firefox speaks), subscribes Alex
 * as Germany, closes Alex's tab, lets Bea end the Soviet turn, and decrypts the push that arrives.
 *
 *   npx tsx scripts/verify/push.ts [http://127.0.0.1:8787]
 */
import { b64url, decrypt, fromB64url } from '../../worker/push';
import type { ClientMsg, PushKeyResponse, RoomView, ServerMsg } from '../../src/net/protocol';

const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const AUTOPUSH = 'wss://push.services.mozilla.com/';
const TIMEOUT_MS = 30_000;

function messages(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiting: ((m: unknown) => void)[] = [];
  ws.addEventListener('message', (e) => {
    const m: unknown = JSON.parse(String(e.data));
    const w = waiting.shift();
    if (w) w(m);
    else queue.push(m);
  });
  const next = () =>
    new Promise<unknown>((resolve, reject) => {
      const m = queue.shift();
      if (m !== undefined) return resolve(m);
      const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), TIMEOUT_MS);
      waiting.push((x) => {
        clearTimeout(timer);
        resolve(x);
      });
    });
  return async <T>(match: (m: any) => m is T): Promise<T> => {
    for (;;) {
      const m = await next();
      if (match(m)) return m;
    }
  };
}

const opened = (ws: WebSocket) => new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

async function player(room: string, name: string) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${room}/ws`);
  const next = messages(ws);
  await opened(ws);
  const send = (m: ClientMsg) => ws.send(JSON.stringify(m));
  const roomMsg = () => next((m): m is { t: 'room'; room: RoomView } => m.t === 'room' || m.t === 'error').then(check);
  const check = (m: ServerMsg) => {
    if (m.t === 'error') throw new Error(`${name}: ${m.message}`);
    return (m as { room: RoomView }).room;
  };
  send({ t: 'hello', token: null });
  send({ t: 'join', name });
  return { ws, send, roomMsg };
}

const { key } = (await (await fetch(`${base}/api/push-key`)).json()) as PushKeyResponse;
if (!key) throw new Error('the Worker has no VAPID keys; write .dev.vars first (see the README)');

const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
const auth = crypto.getRandomValues(new Uint8Array(16));
const autopush = new WebSocket(AUTOPUSH);
const fromAutopush = messages(autopush);
await opened(autopush);
autopush.send(JSON.stringify({ messageType: 'hello', use_webpush: true }));
await fromAutopush((m): m is unknown => m.messageType === 'hello');
const channelID = crypto.randomUUID();
autopush.send(JSON.stringify({ messageType: 'register', channelID, key }));
const { pushEndpoint } = await fromAutopush((m): m is { pushEndpoint: string } => m.messageType === 'register');
console.log(`subscribed at ${new URL(pushEndpoint).host}`);

const { id } = (await (await fetch(`${base}/api/rooms`, { method: 'POST', body: '{}' })).json()) as { id: string };
const alex = await player(id, 'Alex');
alex.send({ t: 'seat', power: 'Germans', to: 'me' });
const p256dh = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)));
alex.send({ t: 'subscribe', subscription: { endpoint: pushEndpoint, keys: { p256dh, auth: b64url(auth) } } });
await alex.roomMsg();
alex.ws.close();

const bea = await player(id, 'Bea');
bea.send({ t: 'seat', power: 'Russians', to: 'me' });
let room = await bea.roomMsg();
while (room.seats.Russians === null) room = await bea.roomMsg();
while (room.state.power === 'Russians') {
  bea.send({ t: 'act', version: room.version, actions: [{ type: 'endPhase' }] });
  const v = room.version;
  do room = await bea.roomMsg();
  while (room.version === v);
}
console.log(`Bea ended the Soviet turn; ${room.state.power} is up`);

const note = await fromAutopush((m): m is { data: string; version: string } => m.messageType === 'notification');
autopush.send(JSON.stringify({ messageType: 'ack', updates: [{ channelID, version: note.version }] }));
console.log('push received and decrypted:', await decrypt(fromB64url(note.data), ua, auth));
bea.ws.close();
autopush.close();

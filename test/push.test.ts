import { describe, expect, it } from 'vitest';
import { b64url, encrypt, fromB64url, loadVapid, pushRequest, vapidAuthorization } from '../worker/push';
import type { Ephemeral } from '../worker/push';
import type { PushPayload, PushSubscriptionKeys } from '../src/net/protocol';

type Bytes = Uint8Array<ArrayBuffer>;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const ES256 = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const encoder = new TextEncoder();
const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** RFC 8291 Appendix A. */
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

async function rfcEphemeral(): Promise<Ephemeral> {
  const raw = fromB64url(RFC.asPublic);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33)), d: RFC.asPrivate };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, ECDH, true, ['deriveBits']);
  const publicKey = await crypto.subtle.importKey('raw', raw, ECDH, true, []);
  return { salt: fromB64url(RFC.salt), keys: { privateKey, publicKey } };
}

async function hkdf(salt: Bytes, ikm: Bytes, info: string | Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const i = typeof info === 'string' ? encoder.encode(info) : info;
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: i }, key, bytes * 8));
}

/** What the browser does on receipt (RFC 8291 section 3), with the subscription's private key. */
async function decrypt(body: Bytes, ua: CryptoKeyPair, auth: Bytes): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const as = await crypto.subtle.importKey('raw', asPublic, ECDH, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: as }, ua.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, new Uint8Array([...encoder.encode('WebPush: info\0'), ...uaPublic, ...asPublic]), 32);
  const cek = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16);
  const iv = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body.slice(21 + idlen)));
  let end = padded.length - 1;
  while (padded[end] === 0) end--;
  expect(padded[end], 'the last record ends with the 0x02 delimiter').toBe(2);
  return text(padded.slice(0, end));
}

async function newVapidEnv() {
  const pair = await crypto.subtle.generateKey(ES256, true, ['sign', 'verify']);
  return {
    VAPID_PUBLIC_KEY: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)),
    VAPID_SUBJECT: 'mailto:host@example.com',
  };
}

describe('payload encryption', () => {
  it('matches the RFC 8291 example byte for byte', async () => {
    const body = await encrypt(fromB64url(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, await rfcEphemeral());
    expect(b64url(body)).toBe(b64url(new Uint8Array([...fromB64url(RFC.header), ...fromB64url(RFC.ciphertext)])));
  });
});

describe('VAPID', () => {
  it('signs a JWT for the push service origin that verifies with the public key', async () => {
    const env = await newVapidEnv();
    const now = Date.UTC(2026, 9, 4);
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', (await loadVapid(env))!, now);
    const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(env.VAPID_PUBLIC_KEY);
    const [head, claims, sig] = jwt!.split('.') as [string, string, string];
    const publicKey = await crypto.subtle.importKey('raw', fromB64url(k!), ES256, false, ['verify']);
    expect(await crypto.subtle.verify(ES256, publicKey, fromB64url(sig), encoder.encode(`${head}.${claims}`))).toBe(true);
    expect(JSON.parse(text(fromB64url(head)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(text(fromB64url(claims)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now / 1000 + 12 * 3600,
      sub: 'mailto:host@example.com',
    });
  });

  it('stays off without every key', async () => {
    const env = await newVapidEnv();
    expect(await loadVapid({ ...env, VAPID_PRIVATE_JWK: undefined })).toBeNull();
    expect(await loadVapid({ ...env, VAPID_PUBLIC_KEY: '' })).toBeNull();
    expect(await loadVapid({ ...env, VAPID_SUBJECT: undefined })).toBeNull();
  });
});

describe('a push request', () => {
  it('carries the headers a push service needs and a body only the subscriber can read', async () => {
    const ua = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const to: PushSubscriptionKeys = {
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/xyz',
      keys: { p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64url(auth) },
    };
    const payload: PushPayload = {
      title: 'Your move: Germany',
      body: 'Round 3 · Alex finished the Soviet turn',
      url: '/#/g/abcdefghij',
    };
    const req = await pushRequest(to, JSON.stringify(payload), (await loadVapid(await newVapidEnv()))!);

    expect(req.method).toBe('POST');
    expect(req.url).toBe(to.endpoint);
    expect(req.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(req.headers.get('TTL')).toBe('172800');
    expect(req.headers.get('Urgency')).toBe('high');
    expect(req.headers.get('Authorization')).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
    const body = new Uint8Array(await req.arrayBuffer());
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(JSON.parse(await decrypt(body, ua, auth))).toEqual(payload);
  });
});

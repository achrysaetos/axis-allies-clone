import type { PushSubscriptionKeys } from '../src/net/protocol';

/** Web Push with WebCrypto only: VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291). */

export interface Vapid {
  /** The uncompressed P-256 public key, base64url. */
  publicKey: string;
  privateKey: CryptoKey;
  /** A `mailto:` or `https:` contact for the push service. */
  subject: string;
}

export interface VapidEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
}

const ES256 = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const RECORD_SIZE = 4096;
const TTL_SECONDS = 2 * 24 * 3600;
const JWT_LIFETIME_SECONDS = 12 * 3600;

type Bytes = Uint8Array<ArrayBuffer>;
const encoder = new TextEncoder();
const utf8 = (text: string): Bytes => new Uint8Array(encoder.encode(text));

export function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text: string): Bytes {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Null when any key is missing, which leaves push switched off. */
export async function loadVapid(env: VapidEnv): Promise<Vapid | null> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT) return null;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey;
  const privateKey = await crypto.subtle.importKey('jwk', jwk, ES256, false, ['sign']);
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey, subject: env.VAPID_SUBJECT };
}

/** The `Authorization` header value for a push to `endpoint`. */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const part = (x: object) => b64url(utf8(JSON.stringify(x)));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + JWT_LIFETIME_SECONDS, sub: vapid.subject };
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part(claims)}`;
  const signature = await crypto.subtle.sign(ES256, vapid.privateKey, utf8(unsigned));
  return `vapid t=${unsigned}.${b64url(new Uint8Array(signature))}, k=${vapid.publicKey}`;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export interface Ephemeral {
  salt: Bytes;
  keys: CryptoKeyPair;
}

export async function newEphemeral(): Promise<Ephemeral> {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return { salt: crypto.getRandomValues(new Uint8Array(16)), keys };
}

/** One aes128gcm record: salt | rs | idlen | keyid | ciphertext. */
export async function encrypt(plaintext: Uint8Array, to: PushSubscriptionKeys['keys'], e: Ephemeral): Promise<Bytes> {
  const uaPublic = fromB64url(to.p256dh);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', e.keys.publicKey)) as ArrayBuffer);
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // A variable, not a literal: workers-types spells the standard `public` member `$public`.
  const agreement = { name: 'ECDH', public: ua };
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(agreement, e.keys.privateKey, 256));
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(fromB64url(to.auth), ecdh, keyInfo, 32);
  const cek = await hkdf(e.salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(e.salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, Uint8Array.of(2)));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE);
  return concat(e.salt, rs, Uint8Array.of(asPublic.length), asPublic, new Uint8Array(ciphertext));
}

export async function pushRequest(
  to: PushSubscriptionKeys,
  payload: string,
  vapid: Vapid,
  ephemeral?: Ephemeral,
): Promise<Request> {
  const body = await encrypt(utf8(payload), to.keys, ephemeral ?? (await newEphemeral()));
  return new Request(to.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(to.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(TTL_SECONDS),
      Urgency: 'high',
    },
    body,
  });
}

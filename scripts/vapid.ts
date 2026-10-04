import { b64url } from '../worker/push';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));

console.log(`Public key, for "VAPID_PUBLIC_KEY" in wrangler.jsonc:\n${publicKey}\n`);
console.log(`Private key, to paste into \`npx wrangler secret put VAPID_PRIVATE_JWK\`:\n${privateJwk}\n`);
console.log(`.dev.vars, for wrangler dev:\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_JWK='${privateJwk}'`);

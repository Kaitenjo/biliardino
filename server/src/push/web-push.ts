import { env } from 'cloudflare:workers';

/*
  Web Push without libraries, with the WebCrypto of the worker:
  - the payload is encrypted for the browser that subscribed (RFC 8291, "aes128gcm" content encoding of RFC 8188):
    an ECDH secret between a new key pair and the key of the browser, mixed with its auth secret by HKDF, gives the AES key;
  - the request is signed by the application (VAPID, RFC 8292): a JWT ES256 for the origin of the push service.
*/

/**
 * A browser subscribed to the notifications.
 */
export interface PushSubscriptionKeys {
  /**
   * URL of the push service for this browser.
   */
  endpoint: string;
  /**
   * Public ECDH key of the browser (P-256, uncompressed, base64url).
   */
  p256dh: string;
  /**
   * Auth secret of the browser (16 bytes, base64url).
   */
  auth: string;
}

/**
 * How long a push service keeps a notification for an offline browser, in seconds.
 */
const TTL_SECONDS = 30 * 60;

/**
 * How long the VAPID signature is valid, in seconds (at most 24 hours).
 */
const JWT_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

/**
 * Sends a notification to a browser.
 *
 * @param subscription - The browser.
 * @param payload - The content, read by the service worker (JSON).
 * @returns The HTTP status of the push service: 201 when accepted, 404 or 410 when the subscription is gone.
 */
export async function sendPush(subscription: PushSubscriptionKeys, payload: string): Promise<number> {
  const body = await encrypt(subscription, encoder.encode(payload));
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(new URL(subscription.endpoint).origin),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(TTL_SECONDS),
      Urgency: 'high'
    },
    body
  });
  return response.status;
}

/**
 * Encrypts a payload for a browser (RFC 8291), as a single aes128gcm record.
 *
 * @param subscription - The browser.
 * @param payload - The content.
 * @returns The body of the request: header (salt, record size, key of the sender) and ciphertext.
 */
async function encrypt(subscription: PushSubscriptionKeys, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  const receiverKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const senderKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', senderKeys.publicKey)) as ArrayBuffer);
  // The types of the worker call the field `$public` (a C++ name); in JavaScript it is `public`, as in the standard
  const ecdhAlgorithm = { name: 'ECDH', public: receiverKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhAlgorithm, senderKeys.privateKey, 256));

  // IKM = HKDF(auth secret, ECDH secret, "WebPush: info" || 0 || ua public || as public)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const ikm = await hmac(prkKey, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(encoder.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(encoder.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  // One record: the payload and the delimiter of the last record (2), no padding
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

/**
 * The `Authorization` header of VAPID: a JWT signed with the private key of the application, and its public key.
 *
 * @param audience - The origin of the push service.
 * @returns The header.
 */
async function vapidAuthorization(audience: string): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + JWT_SECONDS, sub: env.VAPID_SUBJECT })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto signs as r || s, the format of JWS
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/**
 * HMAC-SHA-256, the extract and expand steps of HKDF.
 *
 * @param key - The key.
 * @param data - The data.
 * @returns The 32 bytes of the MAC.
 */
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, data));
}

/**
 * Joins byte arrays.
 *
 * @param parts - The arrays.
 * @returns One array with all of them, in order.
 */
function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Decodes base64url.
 *
 * @param value - The text.
 * @returns The bytes.
 */
function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

/**
 * Encodes in base64url, without padding.
 *
 * @param bytes - The bytes.
 * @returns The text.
 */
function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/*
  Generates the VAPID keys of the push notifications (one pair for the application, generated once):
    npm run vapid-keys
  The public key goes in "vars" of wrangler.jsonc (VAPID_PUBLIC_KEY), the private one is a secret:
    npx wrangler secret put VAPID_PRIVATE_JWK      # paste the JSON printed below
  and, for wrangler dev, a line VAPID_PRIVATE_JWK=<the JSON> in server/.dev.vars (not committed).
  Changing the keys invalidates every subscription: the users have to turn the notifications on again.
*/
const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
const publicKey = Buffer.from((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer).toString('base64url');
const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_JWK=${JSON.stringify(privateJwk)}`);

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { deleteSubscription, saveSubscription } from '../push/notifications.ts';
import { readBody } from './read-body.ts';

/**
 * The push notifications: the public key the browsers subscribe with, and the browsers of the logged user.
 */
export const pushRouter = new Hono<AppEnv>();

pushRouter.get('/key', c => c.json({ publicKey: env.VAPID_PUBLIC_KEY }));

pushRouter.post('/subscriptions', requireAuth, async c => {
  const { endpoint, keys } = await readBody(c);
  const { p256dh, auth } = (typeof keys === 'object' && keys !== null ? keys : {}) as Record<string, unknown>;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return c.json({ error: 'Iscrizione non valida' }, 400);
  }

  await saveSubscription(c.get('user').id, { endpoint, p256dh, auth });
  return c.body(null, 204);
});

pushRouter.delete('/subscriptions', requireAuth, async c => {
  const { endpoint } = await readBody(c);
  if (typeof endpoint !== 'string') {
    return c.json({ error: 'Iscrizione non valida' }, 400);
  }

  await deleteSubscription(c.get('user').id, endpoint);
  return c.body(null, 204);
});

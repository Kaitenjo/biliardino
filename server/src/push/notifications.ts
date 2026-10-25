import { all, run, statement } from '../db/db.ts';
import { sendPush } from './web-push.ts';
import type { PushSubscriptionKeys } from './web-push.ts';

/**
 * A notification, as the service worker of the client shows it.
 */
export interface Notice {
  /**
   * The title.
   */
  title: string;
  /**
   * The text.
   */
  body: string;
  /**
   * The page opened by a tap on the notification, e.g. `/#/lobby`.
   */
  url: string;
}

/**
 * Who receives a notification: every subscribed browser, or the ones of some players.
 */
export type Recipients = 'everybody' | readonly number[];

/**
 * Saves the browser of a user that turned the notifications on. A browser belongs to one user: logging in with another
 * one moves it.
 *
 * @param userId - The user.
 * @param subscription - The browser.
 */
export async function saveSubscription(userId: number, subscription: PushSubscriptionKeys): Promise<void> {
  await run(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    subscription.endpoint,
    userId,
    subscription.p256dh,
    subscription.auth
  );
}

/**
 * Forgets the browser of a user: it turned the notifications off, or logged out.
 *
 * @param userId - The user.
 * @param endpoint - The browser.
 */
export async function deleteSubscription(userId: number, endpoint: string): Promise<void> {
  await run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', endpoint, userId);
}

/**
 * Sends a notification. A failure doesn't stop the others; the browsers that the push service doesn't know anymore are
 * forgotten.
 *
 * @param recipients - Who receives it.
 * @param notice - The notification.
 */
export async function notify(recipients: Recipients, notice: Notice): Promise<void> {
  if (recipients !== 'everybody' && !recipients.length) {
    return;
  }

  const subscriptions =
    recipients === 'everybody'
      ? await all<PushSubscriptionKeys>('SELECT endpoint, p256dh, auth FROM push_subscriptions')
      : await all<PushSubscriptionKeys>(
          `SELECT s.endpoint, s.p256dh, s.auth FROM push_subscriptions s JOIN users u ON u.id = s.user_id
           WHERE u.player_id IN (${recipients.map(() => '?').join(', ')})`,
          ...recipients
        );
  const payload = JSON.stringify(notice);
  const results = await Promise.allSettled(subscriptions.map(subscription => sendPush(subscription, payload)));
  const gone: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error('Notifica non inviata', result.reason);
    } else if (result.value === 404 || result.value === 410) {
      gone.push(subscriptions[i]!.endpoint);
    } else if (result.value >= 400) {
      console.error(`Notifica rifiutata dal servizio push: ${result.value}`);
    }
  });

  if (gone.length) {
    await statement(`DELETE FROM push_subscriptions WHERE endpoint IN (${gone.map(() => '?').join(', ')})`, ...gone).run();
  }
}

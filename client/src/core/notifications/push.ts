import { signal } from '@xaendar/core/signals';
import { deletePushSubscription, fetchPushKey, postPushSubscription } from '../api/api';

/**
 * Whether this browser can receive push notifications. On iPhone only once the site is added to the Home screen.
 */
export const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * Whether the logged user receives the notifications in this browser.
 */
export const pushEnabled = signal(false);

/**
 * The service worker that shows the notifications, registered once.
 */
let registration: Promise<ServiceWorkerRegistration> | null = null;

/**
 * Reads whether this browser is subscribed, and tells the server again that it belongs to the logged user (another
 * user may have used it, or the server may have forgotten it). Called once logged in.
 */
export async function syncPush(): Promise<void> {
  if (!pushSupported || Notification.permission !== 'granted') {
    pushEnabled.set(false);
    return;
  }

  try {
    const subscription = await (await serviceWorker()).pushManager.getSubscription();
    if (subscription) {
      await postPushSubscription(subscription.toJSON());
    }

    pushEnabled.set(Boolean(subscription));
  } catch {
    pushEnabled.set(false);
  }
}

/**
 * Turns the notifications on in this browser: asks the permission, subscribes and tells the server.
 *
 * @throws {Error} When the user denies the permission, or the subscription fails.
 */
export async function enablePush(): Promise<void> {
  if (!pushSupported) {
    throw new Error('Questo browser non supporta le notifiche (su iPhone aggiungi prima il sito alla schermata Home)');
  }

  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error('Notifiche bloccate: abilitale per questo sito nelle impostazioni del browser');
  }

  const worker = await serviceWorker();
  const { publicKey } = await fetchPushKey();
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) }));
  await postPushSubscription(subscription.toJSON());
  pushEnabled.set(true);
}

/**
 * Turns the notifications off in this browser, also on the server. Called on logout too: the next user turns them on
 * again for itself. Never fails: at worst the server forgets the browser at the next notification.
 */
export async function disablePush(): Promise<void> {
  pushEnabled.set(false);
  if (!pushSupported) {
    return;
  }

  try {
    const subscription = await (await serviceWorker()).pushManager.getSubscription();
    if (subscription) {
      await deletePushSubscription(subscription.endpoint).catch(() => undefined);
      await subscription.unsubscribe();
    }
  } catch {
    // Nothing to undo
  }
}

/**
 * Registers the service worker, once.
 *
 * @returns Its registration, once active.
 */
function serviceWorker(): Promise<ServiceWorkerRegistration> {
  registration ??= navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);
  return registration;
}

/**
 * Decodes the base64url VAPID key.
 *
 * @param value - The key.
 * @returns Its bytes.
 */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

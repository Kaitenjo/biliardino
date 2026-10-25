import { computed, signal } from '@xaendar/core/signals';
import type { AuthUser, Session } from '../api/api.models';

/**
 * Key under which the session is kept in the browser.
 */
const SESSION_STORAGE_KEY = 'biliardino-session';

/**
 * Reads the session kept in the browser.
 *
 * @returns The session, `null` when there is none.
 */
function readStoredSession(): Session | null {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    // Storage unavailable or corrupted: the user logs in again
    return null;
  }
}

/**
 * The current session.
 */
const session = signal<Session | null>(readStoredSession());

/**
 * The logged user, `null` when nobody is logged.
 */
export const user = computed<AuthUser | null>(() => session()?.user ?? null);

/**
 * The token of the current session.
 *
 * @returns The token, `undefined` when nobody is logged.
 */
export function sessionToken(): string | undefined {
  return session()?.token;
}

/**
 * Replaces the current session, and keeps it in the browser.
 *
 * @param next - The new session, `null` to close it.
 */
export function setSession(next: Session | null): void {
  session.set(next);
  try {
    if (next) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // The session still works, it just won't survive a reload
  }
}

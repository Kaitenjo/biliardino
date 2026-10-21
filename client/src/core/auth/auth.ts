import { untracked } from '@xaendar/core/signals';
import { fetchMe, postLogin, postLogout, putPassword } from '../api/api';
import { sessionToken, setSession } from './session';

/**
 * Logs in, and opens the session.
 *
 * @param name - The name of the player.
 * @param password - The password.
 * @returns When the session is open.
 * @throws {ApiError} When the credentials are wrong.
 */
export async function login(name: string, password: string): Promise<void> {
  setSession(await postLogin(name, password));
}

/**
 * Logs out. The session is closed locally even when the server cannot be reached.
 *
 * @returns When done.
 */
export async function logout(): Promise<void> {
  try {
    await postLogout();
  } finally {
    setSession(null);
  }
}

/**
 * Changes the password of the logged user.
 *
 * @param currentPassword - The current password.
 * @param newPassword - The new password.
 * @returns When done.
 * @throws {ApiError} When the current password is wrong or the new one is too short.
 */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return putPassword(currentPassword, newPassword);
}

/**
 * Checks that the session kept in the browser is still open, and refreshes the name and icon of the user.
 * A closed session is dropped by the API layer.
 */
export function verifySession(): void {
  const token = untracked(sessionToken);
  if (token) {
    fetchMe()
      .then(user => setSession({ token, user }))
      .catch(() => {
        // 401 already closed the session; other errors keep it for now
      });
  }
}

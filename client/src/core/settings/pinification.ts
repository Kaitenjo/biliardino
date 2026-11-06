import { signal } from '@xaendar/core/signals';

/**
 * Key under which the choice is kept in the browser.
 */
const PINIFICATION_STORAGE_KEY = 'biliardino-pinification';

/**
 * Reads the choice kept in the browser.
 *
 * @returns Whether the pinification is on, `false` when none was chosen.
 */
function readStoredPinification(): boolean {
  try {
    return localStorage.getItem(PINIFICATION_STORAGE_KEY) === 'on';
  } catch {
    // Storage unavailable: the usual way
    return false;
  }
}

/**
 * The pinification: in the aquarium of the lobby the creature of every player is a penis, as big as its ELO, in place
 * of its fish. Off unless chosen (a player can still be a penis by chance, of the usual size).
 */
export const pinification = signal<boolean>(readStoredPinification());

/**
 * Turns the pinification on or off, and keeps the choice in the browser.
 *
 * @param on - Whether it is on.
 */
export function setPinification(on: boolean): void {
  pinification.set(on);
  try {
    localStorage.setItem(PINIFICATION_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // It still applies, it just won't survive a reload
  }
}

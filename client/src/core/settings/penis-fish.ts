import { signal } from '@xaendar/core/signals';

/**
 * Key under which the choice is kept in the browser.
 */
const PENIS_FISH_STORAGE_KEY = 'biliardino-penis-fish';

/**
 * Reads the choice kept in the browser.
 *
 * @returns Whether every creature of the lobby is a penis, `false` when none was chosen.
 */
function readStoredPenisFish(): boolean {
  try {
    return localStorage.getItem(PENIS_FISH_STORAGE_KEY) === 'on';
  } catch {
    // Storage unavailable: the usual way
    return false;
  }
}

/**
 * Whether, in the aquarium of the lobby, the creature of every player is a penis in place of its fish. Off unless
 * chosen.
 */
export const penisFish = signal<boolean>(readStoredPenisFish());

/**
 * Turns every creature of the lobby into a penis, or back into fish, and keeps the choice in the browser.
 *
 * @param on - Whether they are penises.
 */
export function setPenisFish(on: boolean): void {
  penisFish.set(on);
  try {
    localStorage.setItem(PENIS_FISH_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // It still applies, it just won't survive a reload
  }
}

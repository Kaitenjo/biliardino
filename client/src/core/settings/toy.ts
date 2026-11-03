import { signal } from '@xaendar/core/signals';

/**
 * Key under which the choice is kept in the browser.
 */
const TOY_STORAGE_KEY = 'biliardino-purple-toy';

/**
 * Reads the choice kept in the browser.
 *
 * @returns Whether the purple dildo is shown, `false` when none was chosen.
 */
function readStoredToy(): boolean {
  try {
    return localStorage.getItem(TOY_STORAGE_KEY) === 'on';
  } catch {
    // Storage unavailable: the usual way
    return false;
  }
}

/**
 * Whether the aquarium of the lobby shows the purple dildo: the one floating in the background and the one a player
 * swims as. Hidden unless chosen.
 */
export const purpleToy = signal<boolean>(readStoredToy());

/**
 * Shows or hides the purple dildo, and keeps the choice in the browser.
 *
 * @param on - Whether it is shown.
 */
export function setPurpleToy(on: boolean): void {
  purpleToy.set(on);
  try {
    localStorage.setItem(TOY_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // It still applies, it just won't survive a reload
  }
}

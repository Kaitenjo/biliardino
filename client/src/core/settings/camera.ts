import { signal } from '@xaendar/core/signals';

/**
 * Key under which the choice is kept in the browser.
 */
const CAMERA_TRANSITIONS_STORAGE_KEY = 'biliardino-camera-transitions';

/**
 * Reads the choice kept in the browser.
 *
 * @returns Whether the camera travels between the places, `true` when none was chosen.
 */
function readStoredTransitions(): boolean {
  try {
    return localStorage.getItem(CAMERA_TRANSITIONS_STORAGE_KEY) !== 'off';
  } catch {
    // Storage unavailable: the usual way
    return true;
  }
}

/**
 * Whether the camera of the 3D scene travels from a place to the next, or jumps to it at once.
 */
export const cameraTransitions = signal<boolean>(readStoredTransitions());

/**
 * Turns the transitions of the camera on or off, and keeps the choice in the browser.
 *
 * @param on - Whether the camera travels.
 */
export function setCameraTransitions(on: boolean): void {
  cameraTransitions.set(on);
  try {
    localStorage.setItem(CAMERA_TRANSITIONS_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // It still applies, it just won't survive a reload
  }
}

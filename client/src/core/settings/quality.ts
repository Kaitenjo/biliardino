import { signal } from '@xaendar/core/signals';

/**
 * How detailed the 3D scene is: `low` leaves out what only decorates it (the jellyfish, the schools and the fish in the
 * background, the seaweed, the light of the treasure), for slower devices; `high` draws everything.
 */
export type Quality = 'low' | 'high';

/**
 * Key under which the quality is kept in the browser.
 */
const QUALITY_STORAGE_KEY = 'biliardino-quality';

/**
 * Reads the quality kept in the browser.
 *
 * @returns The quality, `low` when none was chosen.
 */
function readStoredQuality(): Quality {
  try {
    return localStorage.getItem(QUALITY_STORAGE_KEY) === 'high' ? 'high' : 'low';
  } catch {
    // Storage unavailable: the lighter one
    return 'low';
  }
}

/**
 * The quality of the scene on this device.
 */
export const quality = signal<Quality>(readStoredQuality());

/**
 * Changes the quality of the scene, and keeps it in the browser.
 *
 * @param next - The new quality.
 */
export function setQuality(next: Quality): void {
  quality.set(next);
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, next);
  } catch {
    // It still applies, it just won't survive a reload
  }
}

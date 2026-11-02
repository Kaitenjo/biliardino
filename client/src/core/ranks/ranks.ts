import { signal } from '@xaendar/core/signals';
import { fetchRanks } from '../api/api';
import type { Rank } from '../api/api.models';

/**
 * Fraction of the width of the image of a border taken by the hole where the icon of the player goes.
 */
export const RANK_HOLE = 0.58;

/**
 * The ranks, from the lowest to the highest; empty until loaded.
 */
export const ranks = signal<Rank[]>([]);

/**
 * Loads the ranks. Without them the icons simply have no border.
 *
 * @returns When done.
 */
export async function loadRanks(): Promise<void> {
  try {
    ranks.set(await fetchRanks());
  } catch {
    // The borders are decoration: the leaderboard works without them
  }
}

/**
 * The rank an ELO falls in. Reads `ranks`, so a template calling it is updated when they load or change.
 *
 * @param elo - The ELO.
 * @returns The highest rank whose threshold the ELO reaches, `''` when the ranks are not loaded.
 */
export function rankKeyOf(elo: number): string {
  let key = '';
  for (const rank of ranks()) {
    if (elo >= rank.minElo) {
      key = rank.key;
    }
  }

  return key;
}

/**
 * The URL of the image of the border of a rank.
 *
 * @param key - The rank.
 * @returns The URL.
 */
export function rankImage(key: string): string {
  return `/ranks/${key}.webp`;
}

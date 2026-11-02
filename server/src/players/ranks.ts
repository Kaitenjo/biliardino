import { all, batch, statement } from '../db/db.ts';

/**
 * A rank: the border of the icon of the players whose ELO is at least `minElo` and below the next rank.
 */
export interface Rank {
  /**
   * Name of the image of the border.
   */
  key: string;
  /**
   * Name shown to the users.
   */
  label: string;
  /**
   * The lowest ELO of the rank.
   */
  minElo: number;
}

/**
 * Allowed range of the threshold of a rank.
 */
export const RANK_LIMITS = { min: 0, max: 5000 };

/**
 * Loads the ranks.
 *
 * @returns The ranks, from the lowest to the highest.
 */
export function listRanks(): Promise<Rank[]> {
  return all<Rank>('SELECT key, label, min_elo AS minElo FROM ranks ORDER BY position');
}

/**
 * Checks the thresholds sent by the client and saves them.
 *
 * @param body - The fields of the request: `{ ranks: [{ key, minElo }] }`, one for each rank.
 * @returns The ranks saved, or the message of what is wrong.
 */
export async function saveRanks(body: Record<string, unknown>): Promise<Rank[] | string> {
  const current = await listRanks();
  const sent = body['ranks'];
  if (!Array.isArray(sent) || sent.length !== current.length) {
    return 'Servono le soglie di tutti i rank';
  }

  const minElos = new Map<string, number>();
  for (const item of sent as Array<Record<string, unknown>>) {
    const { key, minElo } = item ?? {};
    if (typeof key !== 'string' || !current.some(rank => rank.key === key) || minElos.has(key)) {
      return 'Rank non valido';
    }

    if (typeof minElo !== 'number' || !Number.isFinite(minElo) || minElo < RANK_LIMITS.min || minElo > RANK_LIMITS.max) {
      return `Soglia non valida: ${key}`;
    }

    minElos.set(key, minElo);
  }

  const next = current.map(rank => ({ ...rank, minElo: minElos.get(rank.key)! }));
  if (next[0]!.minElo !== 0) {
    return `Il rank più basso parte da 0: ${next[0]!.label}`;
  }

  for (let i = 1; i < next.length; i++) {
    if (next[i]!.minElo <= next[i - 1]!.minElo) {
      return `${next[i]!.label} deve partire più in alto di ${next[i - 1]!.label}`;
    }
  }

  await batch(next.map(rank => statement('UPDATE ranks SET min_elo = ? WHERE key = ?', rank.minElo, rank.key)));
  return next;
}

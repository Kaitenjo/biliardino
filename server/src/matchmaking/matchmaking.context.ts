import { all } from '../db/db.ts';
import { pairKey } from './matchmaking.ts';
import type { MatchmakingContext, MatchmakingPlayer } from './matchmaking.ts';

/**
 * Loads from the database what the matchmaking needs: the players with their roles, ELOs and matches, and how often
 * each pair played together or against each other (`player_pairs`).
 *
 * @returns The context.
 */
export async function loadMatchmakingContext(): Promise<MatchmakingContext> {
  const players = new Map<number, MatchmakingPlayer>();
  const [rows, pairs] = await Promise.all([
    all<{
      id: number;
      name: string;
      icon: string;
      eloAttack: number;
      eloDefense: number;
      playsAttack: number;
      playsDefense: number;
      matches: number;
    }>(
      `SELECT p.id, p.name, p.icon, p.elo_attack AS eloAttack, p.elo_defense AS eloDefense,
         p.plays_attack AS playsAttack, p.plays_defense AS playsDefense, COALESCE(s.matches, 0) AS matches
       FROM players p LEFT JOIN player_stats s ON s.player_id = p.id AND s.scope = 'all'`
    ),
    all<{ playerId: number; otherId: number; together: number; against: number }>(
      'SELECT player_id AS playerId, other_id AS otherId, together, against FROM player_pairs'
    )
  ]);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    players.set(row.id, {
      id: row.id,
      name: row.name,
      icon: row.icon,
      elo: Math.round(Math.max(row.eloAttack, row.eloDefense)),
      eloAttack: row.eloAttack,
      eloDefense: row.eloDefense,
      playsAttack: Boolean(row.playsAttack),
      playsDefense: Boolean(row.playsDefense),
      matches: row.matches
    });
  }

  const teammates = new Map<string, number>();
  const opponents = new Map<string, number>();
  for (let i = 0; i < pairs.length; i++) {
    const { playerId, otherId, together, against } = pairs[i]!;
    const key = pairKey(playerId, otherId);
    if (together) {
      teammates.set(key, together);
    }

    if (against) {
      opponents.set(key, against);
    }
  }

  return { players, teammates, opponents };
}

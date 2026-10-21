import { all } from '../db/db.ts';
import type { Team } from '../models.ts';
import { pairKey } from './matchmaking.ts';
import type { MatchmakingContext, MatchmakingPlayer } from './matchmaking.ts';

/**
 * Loads from the database what the matchmaking needs: the players with their roles and ELOs, and how often each pair
 * played together or against each other.
 *
 * @returns The context.
 */
export function loadMatchmakingContext(): MatchmakingContext {
  const players = new Map<number, MatchmakingPlayer>();
  const rows = all<{
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
       p.plays_attack AS playsAttack, p.plays_defense AS playsDefense, COUNT(mp.match_id) AS matches
     FROM players p LEFT JOIN match_players mp ON mp.player_id = p.id
     GROUP BY p.id`
  );
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
  const lineups = all<{ matchId: number; playerId: number; team: Team }>(
    `SELECT mp.match_id AS matchId, mp.player_id AS playerId, mp.team
     FROM match_players mp JOIN matches m ON m.id = mp.match_id
     ORDER BY m.played_at, m.id`
  );
  for (let i = 0; i < lineups.length;) {
    // The rows of a match are contiguous: take them all, whatever their number
    let end = i + 1;
    while (end < lineups.length && lineups[end]!.matchId === lineups[i]!.matchId) {
      end++;
    }

    const match = lineups.slice(i, end);
    i = end;
    for (let j = 0; j < match.length; j++) {
      const player = match[j]!;
      for (let k = j + 1; k < match.length; k++) {
        const other = match[k]!;
        const counts = player.team === other.team ? teammates : opponents;
        const key = pairKey(player.playerId, other.playerId);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return { players, teammates, opponents };
}

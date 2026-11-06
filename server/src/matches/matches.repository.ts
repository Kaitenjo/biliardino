import { all, get } from '../db/db.ts';
import type { Lineup, Team } from '../models.ts';
import type { PlayerRef } from '../players/players.repository.ts';

/**
 * A played match, as a row of the list of matches.
 */
export interface MatchSummary {
  /**
   * Id of the match.
   */
  id: number;
  /**
   * When it was played (UTC, `YYYY-MM-DD HH:MM:SS`).
   */
  playedAt: string;
  /**
   * Goals of the white team.
   */
  whiteScore: number;
  /**
   * Goals of the brown team.
   */
  brownScore: number;
  /**
   * The winning team.
   */
  winner: Team;
  /**
   * The white team.
   */
  white: Lineup<PlayerRef>;
  /**
   * The brown team.
   */
  brown: Lineup<PlayerRef>;
  /**
   * Change of ELO of each white player, rounded.
   */
  whiteDelta: number;
  /**
   * Change of ELO of each brown player, rounded.
   */
  brownDelta: number;
}

/**
 * A page of the list of matches.
 */
export interface MatchPage {
  /**
   * The matches of the page, newest first.
   */
  matches: MatchSummary[];
  /**
   * The page, from 1.
   */
  page: number;
  /**
   * How many matches a page holds.
   */
  pageSize: number;
  /**
   * How many matches were played.
   */
  total: number;
}

/**
 * A match with its four players, as read from the database.
 */
interface MatchSummaryRow {
  id: number;
  playedAt: string;
  whiteScore: number;
  brownScore: number;
  winner: Team;
  whiteAttackId: number;
  whiteAttackName: string | null;
  whiteAttackIcon: string | null;
  whiteDefenseId: number;
  whiteDefenseName: string | null;
  whiteDefenseIcon: string | null;
  brownAttackId: number;
  brownAttackName: string | null;
  brownAttackIcon: string | null;
  brownDefenseId: number;
  brownDefenseName: string | null;
  brownDefenseIcon: string | null;
  whiteDelta: number;
  brownDelta: number;
}

/**
 * Loads a page of the played matches, newest first.
 *
 * @param page - The page, from 1.
 * @param pageSize - How many matches a page holds.
 * @returns The matches of the page and how many there are in all.
 */
export async function listMatches(page: number, pageSize: number): Promise<MatchPage> {
  const slot = (alias: string, team: Team, role: string): string =>
    `JOIN match_players ${alias} ON ${alias}.match_id = m.id AND ${alias}.team = '${team}' AND ${alias}.role = '${role}'
     LEFT JOIN players ${alias}p ON ${alias}p.id = ${alias}.player_id`;
  const [rows, count] = await Promise.all([
    all<MatchSummaryRow>(
      `SELECT m.id, m.played_at AS playedAt, m.white_score AS whiteScore, m.brown_score AS brownScore, m.winner,
         wa.player_id AS whiteAttackId, wap.name AS whiteAttackName, wap.icon AS whiteAttackIcon,
         wd.player_id AS whiteDefenseId, wdp.name AS whiteDefenseName, wdp.icon AS whiteDefenseIcon,
         ba.player_id AS brownAttackId, bap.name AS brownAttackName, bap.icon AS brownAttackIcon,
         bd.player_id AS brownDefenseId, bdp.name AS brownDefenseName, bdp.icon AS brownDefenseIcon,
         wd.elo_delta AS whiteDelta, bd.elo_delta AS brownDelta
       FROM matches m
       ${slot('wa', 'white', 'attack')}
       ${slot('wd', 'white', 'defense')}
       ${slot('ba', 'brown', 'attack')}
       ${slot('bd', 'brown', 'defense')}
       ORDER BY m.played_at DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      pageSize,
      (page - 1) * pageSize
    ),
    get<{ total: number }>('SELECT COUNT(*) AS total FROM matches')
  ]);

  const matches = rows.map(row => ({
    id: row.id,
    playedAt: row.playedAt,
    whiteScore: row.whiteScore,
    brownScore: row.brownScore,
    winner: row.winner,
    white: {
      attack: toRef(row.whiteAttackId, row.whiteAttackName, row.whiteAttackIcon),
      defense: toRef(row.whiteDefenseId, row.whiteDefenseName, row.whiteDefenseIcon)
    },
    brown: {
      attack: toRef(row.brownAttackId, row.brownAttackName, row.brownAttackIcon),
      defense: toRef(row.brownDefenseId, row.brownDefenseName, row.brownDefenseIcon)
    },
    whiteDelta: Math.round(row.whiteDelta),
    brownDelta: Math.round(row.brownDelta)
  }));

  return { matches, page, pageSize, total: count?.total ?? 0 };
}

/**
 * Builds the reference to a player of a match.
 *
 * @param id - The id of the player.
 * @param name - Its name, `null` when it doesn't exist anymore.
 * @param icon - Its icon.
 * @returns The player.
 */
function toRef(id: number, name: string | null, icon: string | null): PlayerRef {
  return { id, name: name ?? '?', icon: icon ?? '' };
}

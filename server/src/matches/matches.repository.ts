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
   * Goals of the brown team.
   */
  brownScore: number;
  /**
   * Goals of the white team.
   */
  whiteScore: number;
  /**
   * The winning team.
   */
  winner: Team;
  /**
   * The brown team.
   */
  brown: Lineup<PlayerRef>;
  /**
   * The white team.
   */
  white: Lineup<PlayerRef>;
  /**
   * Change of ELO of each brown player, rounded.
   */
  brownDelta: number;
  /**
   * Change of ELO of each white player, rounded.
   */
  whiteDelta: number;
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
  brownScore: number;
  whiteScore: number;
  winner: Team;
  brownAttackId: number;
  brownAttackName: string | null;
  brownAttackIcon: string | null;
  brownDefenseId: number;
  brownDefenseName: string | null;
  brownDefenseIcon: string | null;
  whiteAttackId: number;
  whiteAttackName: string | null;
  whiteAttackIcon: string | null;
  whiteDefenseId: number;
  whiteDefenseName: string | null;
  whiteDefenseIcon: string | null;
  brownDelta: number;
  whiteDelta: number;
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
      `SELECT m.id, m.played_at AS playedAt, m.brown_score AS brownScore, m.white_score AS whiteScore, m.winner,
         ra.player_id AS brownAttackId, rap.name AS brownAttackName, rap.icon AS brownAttackIcon,
         rd.player_id AS brownDefenseId, rdp.name AS brownDefenseName, rdp.icon AS brownDefenseIcon,
         ba.player_id AS whiteAttackId, bap.name AS whiteAttackName, bap.icon AS whiteAttackIcon,
         bd.player_id AS whiteDefenseId, bdp.name AS whiteDefenseName, bdp.icon AS whiteDefenseIcon,
         rd.elo_delta AS brownDelta, bd.elo_delta AS whiteDelta
       FROM matches m
       ${slot('ra', 'brown', 'attack')}
       ${slot('rd', 'brown', 'defense')}
       ${slot('ba', 'white', 'attack')}
       ${slot('bd', 'white', 'defense')}
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
    brownScore: row.brownScore,
    whiteScore: row.whiteScore,
    winner: row.winner,
    brown: {
      attack: toRef(row.brownAttackId, row.brownAttackName, row.brownAttackIcon),
      defense: toRef(row.brownDefenseId, row.brownDefenseName, row.brownDefenseIcon)
    },
    white: {
      attack: toRef(row.whiteAttackId, row.whiteAttackName, row.whiteAttackIcon),
      defense: toRef(row.whiteDefenseId, row.whiteDefenseName, row.whiteDefenseIcon)
    },
    brownDelta: Math.round(row.brownDelta),
    whiteDelta: Math.round(row.whiteDelta)
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

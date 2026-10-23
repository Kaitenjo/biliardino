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
   * Goals of the red team.
   */
  redScore: number;
  /**
   * Goals of the blue team.
   */
  blueScore: number;
  /**
   * The winning team.
   */
  winner: Team;
  /**
   * The red team.
   */
  red: Lineup<PlayerRef>;
  /**
   * The blue team.
   */
  blue: Lineup<PlayerRef>;
  /**
   * Change of ELO of each red player, rounded.
   */
  redDelta: number;
  /**
   * Change of ELO of each blue player, rounded.
   */
  blueDelta: number;
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
  redScore: number;
  blueScore: number;
  winner: Team;
  redAttackId: number;
  redAttackName: string | null;
  redAttackIcon: string | null;
  redDefenseId: number;
  redDefenseName: string | null;
  redDefenseIcon: string | null;
  blueAttackId: number;
  blueAttackName: string | null;
  blueAttackIcon: string | null;
  blueDefenseId: number;
  blueDefenseName: string | null;
  blueDefenseIcon: string | null;
  redDelta: number;
  blueDelta: number;
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
      `SELECT m.id, m.played_at AS playedAt, m.red_score AS redScore, m.blue_score AS blueScore, m.winner,
         ra.player_id AS redAttackId, rap.name AS redAttackName, rap.icon AS redAttackIcon,
         rd.player_id AS redDefenseId, rdp.name AS redDefenseName, rdp.icon AS redDefenseIcon,
         ba.player_id AS blueAttackId, bap.name AS blueAttackName, bap.icon AS blueAttackIcon,
         bd.player_id AS blueDefenseId, bdp.name AS blueDefenseName, bdp.icon AS blueDefenseIcon,
         rd.elo_delta AS redDelta, bd.elo_delta AS blueDelta
       FROM matches m
       ${slot('ra', 'red', 'attack')}
       ${slot('rd', 'red', 'defense')}
       ${slot('ba', 'blue', 'attack')}
       ${slot('bd', 'blue', 'defense')}
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
    redScore: row.redScore,
    blueScore: row.blueScore,
    winner: row.winner,
    red: {
      attack: toRef(row.redAttackId, row.redAttackName, row.redAttackIcon),
      defense: toRef(row.redDefenseId, row.redDefenseName, row.redDefenseIcon)
    },
    blue: {
      attack: toRef(row.blueAttackId, row.blueAttackName, row.blueAttackIcon),
      defense: toRef(row.blueDefenseId, row.blueDefenseName, row.blueDefenseIcon)
    },
    redDelta: Math.round(row.redDelta),
    blueDelta: Math.round(row.blueDelta)
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

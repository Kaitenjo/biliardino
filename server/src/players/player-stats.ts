import { statement } from '../db/db.ts';
import type { Lineup, Role, Team } from '../models.ts';

/**
 * Number of matches of the "form" column.
 */
export const FORM_LENGTH = 5;

/**
 * The result of a match for a player, as in the "form" column.
 */
export interface FormEntry {
  /**
   * Whether the player won.
   */
  won: boolean;
  /**
   * Change of ELO, rounded.
   */
  delta: number;
}

/**
 * Which matches a record counts: all of them, or only the ones in a role.
 */
export type StatsScope = 'all' | Role;

/**
 * The record of a player in a scope, as stored in `player_stats`.
 */
export interface PlayerRecord {
  /**
   * Matches played.
   */
  matches: number;
  /**
   * Matches won.
   */
  wins: number;
  /**
   * Goals scored by the teams of the player.
   */
  goalsFor: number;
  /**
   * Goals conceded by the teams of the player.
   */
  goalsAgainst: number;
  /**
   * The last matches, oldest first.
   */
  form: FormEntry[];
}

/**
 * The records of a player, by scope.
 */
export type PlayerRecords = Record<StatsScope, PlayerRecord>;

/**
 * How often two players played together and against each other, as stored in `player_pairs`.
 */
export interface PairCount {
  /**
   * The id of a player, the lower one.
   */
  playerId: number;
  /**
   * The id of the other player.
   */
  otherId: number;
  /**
   * Matches in the same team.
   */
  together: number;
  /**
   * Matches in opposite teams.
   */
  against: number;
}

/**
 * The records of a player that never played.
 *
 * @returns The records, all zero.
 */
export function emptyRecords(): PlayerRecords {
  const empty = (): PlayerRecord => ({ matches: 0, wins: 0, goalsFor: 0, goalsAgainst: 0, form: [] });
  return { all: empty(), attack: empty(), defense: empty() };
}

/**
 * Adds a match to the records of one of its players, in the scope of all matches and in the one of its role.
 *
 * @param records - The records of the player, changed.
 * @param role - The role it played.
 * @param won - Whether it won.
 * @param goalsFor - Goals of its team.
 * @param goalsAgainst - Goals of the other team.
 * @param delta - Its change of ELO, not rounded.
 */
export function addMatch(records: PlayerRecords, role: Role, won: boolean, goalsFor: number, goalsAgainst: number, delta: number): void {
  for (const record of [records.all, records[role]]) {
    record.matches++;
    record.wins += won ? 1 : 0;
    record.goalsFor += goalsFor;
    record.goalsAgainst += goalsAgainst;
    record.form.push({ won, delta: Math.round(delta) });
    if (record.form.length > FORM_LENGTH) {
      record.form.shift();
    }
  }
}

/**
 * The pairs of the players of a match: two pairs of teammates and four of opponents.
 *
 * @param lineup - The ids of the players of the two teams.
 * @returns The pairs, each counting this match once.
 */
export function pairsOf(lineup: Record<Team, Lineup<number>>): PairCount[] {
  const players = [lineup.brown.attack, lineup.brown.defense, lineup.white.attack, lineup.white.defense];
  const pairs: PairCount[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      // The first two are brown, the last two white
      const together = i < 2 === j < 2;
      const [playerId, otherId] = players[i]! < players[j]! ? [players[i]!, players[j]!] : [players[j]!, players[i]!];
      pairs.push({ playerId, otherId, together: together ? 1 : 0, against: together ? 0 : 1 });
    }
  }

  return pairs;
}

/**
 * A row of `player_stats`.
 */
export interface RecordRow extends Omit<PlayerRecord, 'form'> {
  /**
   * Id of the player.
   */
  playerId: number;
  /**
   * The matches it counts.
   */
  scope: StatsScope;
  /**
   * The form, as JSON.
   */
  form: string;
}

/**
 * The query of the records of players, giving `RecordRow`s.
 *
 * @param playerIds - The ids of the players, every player when missing.
 * @returns The statement.
 */
export function selectRecords(playerIds?: readonly number[]): D1PreparedStatement {
  const filter = playerIds ? `WHERE player_id IN (${playerIds.map(() => '?').join(', ')})` : '';
  return statement(
    `SELECT player_id AS playerId, scope, matches, wins, goals_for AS goalsFor, goals_against AS goalsAgainst, form
     FROM player_stats ${filter}`,
    ...(playerIds ?? [])
  );
}

/**
 * Loads the records of players.
 *
 * @param playerIds - The ids of the players, every player when missing.
 * @returns The records, by player; a player that never played may be missing.
 */
export async function loadRecords(playerIds?: readonly number[]): Promise<Map<number, PlayerRecords>> {
  const { results } = await selectRecords(playerIds).all<RecordRow>();
  return parseRecords(results);
}

/**
 * Groups rows of `player_stats` by player.
 *
 * @param rows - The rows.
 * @returns The records, by player.
 */
export function parseRecords(rows: readonly RecordRow[]): Map<number, PlayerRecords> {
  const records = new Map<number, PlayerRecords>();
  for (let i = 0; i < rows.length; i++) {
    const { playerId, scope, form, ...record } = rows[i]!;
    let playerRecords = records.get(playerId);
    if (!playerRecords) {
      playerRecords = emptyRecords();
      records.set(playerId, playerRecords);
    }

    playerRecords[scope] = { ...record, form: JSON.parse(form) as FormEntry[] };
  }

  return records;
}

/**
 * The statement storing records, replacing the ones of the same players.
 *
 * @param records - The records, by player.
 * @returns The statement.
 */
export function storeRecords(records: Map<number, PlayerRecords>): D1PreparedStatement {
  const rows: Array<[number, StatsScope, number, number, number, number, FormEntry[]]> = [];
  for (const [playerId, playerRecords] of records) {
    for (const scope of ['all', 'attack', 'defense'] as const) {
      const { matches, wins, goalsFor, goalsAgainst, form } = playerRecords[scope];
      rows.push([playerId, scope, matches, wins, goalsFor, goalsAgainst, form]);
    }
  }

  // `WHERE true` tells SQLite that ON CONFLICT belongs to the INSERT, not to the join of the SELECT
  return statement(
    `INSERT INTO player_stats (player_id, scope, matches, wins, goals_for, goals_against, form)
     SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
       json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]')
     FROM json_each(?) WHERE true
     ON CONFLICT (player_id, scope) DO UPDATE SET matches = excluded.matches, wins = excluded.wins,
       goals_for = excluded.goals_for, goals_against = excluded.goals_against, form = excluded.form`,
    JSON.stringify(rows)
  );
}

/**
 * The statement adding counts of pairs to the stored ones.
 *
 * @param pairs - The counts to add.
 * @returns The statement.
 */
export function addPairs(pairs: readonly PairCount[]): D1PreparedStatement {
  return statement(
    `INSERT INTO player_pairs (player_id, other_id, together, against)
     SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]')
     FROM json_each(?) WHERE true
     ON CONFLICT (player_id, other_id) DO UPDATE SET together = together + excluded.together, against = against + excluded.against`,
    JSON.stringify(pairs.map(pair => [pair.playerId, pair.otherId, pair.together, pair.against]))
  );
}

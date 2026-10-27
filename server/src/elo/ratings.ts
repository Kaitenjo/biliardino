import { all, batch, get, statement } from '../db/db.ts';
import type { Lineup, Role, Team } from '../models.ts';
import { addMatch, addPairs, emptyRecords, pairsOf, parseRecords, selectRecords, storeRecords } from '../players/player-stats.ts';
import type { PairCount, PlayerRecords, RecordRow } from '../players/player-stats.ts';
import { loadEloConfig, saveEloConfig } from './elo-config.ts';
import { computeMatchElo, roundAwayFromZero } from './elo.ts';
import type { EloConfig, EloPlayer } from './elo.ts';

/**
 * A match saved by `recordMatch`.
 */
export interface RecordedMatch {
  /**
   * Id of the match.
   */
  id: number;
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
 * Recomputes every ELO and every derived statistic from scratch, as the previous project did at each load: starting
 * from the initial ELO of each player, in both roles, the matches are replayed in the order they were played; each
 * player changes only the ELO of the role it played. The results are stored in `match_players` (ELO in the role before
 * the match, change), `matches.white_expected`, `players.elo_attack` / `players.elo_defense`, `player_stats` and
 * `player_pairs`.
 *
 * It reads every match, so it runs only on request (the admin page), after a manual change to the database (initial
 * ELO, matches added, fixed or removed): a saved match updates only what it changes, in `recordMatch`. Only the rows
 * whose values change are written.
 *
 * @param change - New variables of the system (and, optionally, an initial ELO for every player), saved in the same
 * transaction as the results, so that new matches are computed like the replayed ones. Without it, the saved variables
 * are used.
 * @param change.config - The variables of the system.
 * @param change.startElo - The initial ELO to give to every player, `undefined` to keep each player's own.
 */
export async function recomputeRatings(change?: { config: EloConfig; startElo?: number | undefined }): Promise<void> {
  const config = change?.config ?? (await loadEloConfig());
  const players = new Map<number, Record<Role, EloPlayer>>();
  const records = new Map<number, PlayerRecords>();
  const [playerRows, matches, lineupRows] = await Promise.all([
    all<{ id: number; startElo: number }>('SELECT id, start_elo AS startElo FROM players'),
    all<{ id: number; brownScore: number; whiteScore: number }>('SELECT id, brown_score AS brownScore, white_score AS whiteScore FROM matches ORDER BY played_at, id'),
    all<{ matchId: number; playerId: number; team: Team; role: Role }>('SELECT match_id AS matchId, player_id AS playerId, team, role FROM match_players')
  ]);
  for (let i = 0; i < playerRows.length; i++) {
    const id = playerRows[i]!.id;
    const startElo = change?.startElo ?? playerRows[i]!.startElo;
    players.set(id, { attack: { elo: startElo, matches: 0 }, defense: { elo: startElo, matches: 0 } });
    records.set(id, emptyRecords());
  }

  const lineups = new Map<number, { brown: Partial<Lineup<number>>; white: Partial<Lineup<number>> }>();
  for (let i = 0; i < lineupRows.length; i++) {
    const { matchId, playerId, team, role } = lineupRows[i]!;
    let lineup = lineups.get(matchId);
    if (!lineup) {
      lineup = { brown: {}, white: {} };
      lineups.set(matchId, lineup);
    }

    lineup[team][role] = playerId;
  }

  // [id, white expected], [match id, player id, ELO before, ELO in the role, change], [id, ELO attack, ELO defense]
  const matchUpdates: Array<[number, number]> = [];
  const matchPlayerUpdates: Array<[number, number, number, number, number]> = [];
  const playerUpdates: Array<[number, number, number]> = [];
  const pairs = new Map<string, PairCount>();
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const ids = lineups.get(match.id);
    const brown = ids && resolveLineup(ids.brown, players);
    const white = ids && resolveLineup(ids.white, players);
    if (!ids || !brown || !white) {
      console.warn(`Partita ${match.id} ignorata nel calcolo dell'ELO: formazione incompleta`);
      continue;
    }

    const result = computeMatchElo(brown, white, match.brownScore, match.whiteScore, config);
    matchUpdates.push([match.id, result.whiteExpected]);
    for (const team of ['brown', 'white'] as const) {
      const delta = team === 'brown' ? result.brownDelta : result.whiteDelta;
      const [goalsFor, goalsAgainst] = team === 'brown' ? [match.brownScore, match.whiteScore] : [match.whiteScore, match.brownScore];
      for (const role of ['attack', 'defense'] as const) {
        const player = team === 'brown' ? brown[role] : white[role];
        const playerId = ids[team][role]!;
        matchPlayerUpdates.push([match.id, playerId, player.elo, player.elo, delta]);
        addMatch(records.get(playerId)!, role, goalsFor > goalsAgainst, goalsFor, goalsAgainst, delta);
      }
    }

    const matchPairs = pairsOf({ brown: ids.brown as Lineup<number>, white: ids.white as Lineup<number> });
    for (let j = 0; j < matchPairs.length; j++) {
      const pair = matchPairs[j]!;
      const key = `${pair.playerId}-${pair.otherId}`;
      const total = pairs.get(key);
      if (total) {
        total.together += pair.together;
        total.against += pair.against;
      } else {
        pairs.set(key, { ...pair });
      }
    }

    // The four players are updated only once the match is computed: each one entered it with its previous ELO
    for (const player of [brown.attack, brown.defense]) {
      player.elo += result.brownDelta;
      player.matches++;
    }

    for (const player of [white.attack, white.defense]) {
      player.elo += result.whiteDelta;
      player.matches++;
    }
  }

  for (const [id, player] of players) {
    playerUpdates.push([id, player.attack.elo, player.defense.elo]);
  }

  await batch([
    ...(change ? [saveEloConfig(change.config)] : []),
    ...(change?.startElo === undefined ? [] : [statement('UPDATE players SET start_elo = ?', change.startElo)]),
    statement(
      `UPDATE matches SET white_expected = json_extract(u.value, '$[1]')
       FROM json_each(?) u
       WHERE matches.id = json_extract(u.value, '$[0]') AND matches.white_expected IS NOT json_extract(u.value, '$[1]')`,
      JSON.stringify(matchUpdates)
    ),
    statement(
      `UPDATE match_players
       SET elo_before = json_extract(u.value, '$[2]'), role_elo = json_extract(u.value, '$[3]'), elo_delta = json_extract(u.value, '$[4]')
       FROM json_each(?) u
       WHERE match_players.match_id = json_extract(u.value, '$[0]') AND match_players.player_id = json_extract(u.value, '$[1]')
         AND (match_players.elo_before IS NOT json_extract(u.value, '$[2]') OR match_players.role_elo IS NOT json_extract(u.value, '$[3]')
           OR match_players.elo_delta IS NOT json_extract(u.value, '$[4]'))`,
      JSON.stringify(matchPlayerUpdates)
    ),
    statement(
      `UPDATE players SET elo_attack = json_extract(u.value, '$[1]'), elo_defense = json_extract(u.value, '$[2]')
       FROM json_each(?) u
       WHERE players.id = json_extract(u.value, '$[0]')
         AND (players.elo_attack IS NOT json_extract(u.value, '$[1]') OR players.elo_defense IS NOT json_extract(u.value, '$[2]'))`,
      JSON.stringify(playerUpdates)
    ),
    statement('DELETE FROM player_stats'),
    storeRecords(records),
    statement('DELETE FROM player_pairs'),
    addPairs([...pairs.values()])
  ]);
}

/**
 * Saves a played match, as the last one: its ELO is computed from the current ELOs of its players, and only what it
 * changes is written (the match, the ELOs and records of its four players, their pairs), with the end of the match to
 * play, in one transaction. The result is the one `recomputeRatings` would give.
 *
 * @param runningId - The id of the match to play whose result this is: only one save can end it.
 * @param brown - The ids of the brown players.
 * @param white - The ids of the white players.
 * @param brownScore - Goals of the brown team.
 * @param whiteScore - Goals of the white team.
 * @param userId - The user who saves it.
 * @returns The match with the changes of ELO; `'unknown-player'` when a player doesn't exist, `'not-running'` when the
 * match to play is not that one anymore (somebody else saved or deleted it), `'conflict'` when another match was saved
 * in the meantime (the ELOs it was computed from changed): nothing was saved.
 */
export async function recordMatch(
  runningId: number,
  brown: Lineup<number>,
  white: Lineup<number>,
  brownScore: number,
  whiteScore: number,
  userId: number
): Promise<RecordedMatch | 'unknown-player' | 'not-running' | 'conflict'> {
  const ids = [brown.attack, brown.defense, white.attack, white.defense];
  const marks = ids.map(() => '?').join(', ');
  const config = await loadEloConfig();
  // One read transaction: the match to play, the last match and the state it left
  const [runningRows, lastRows, playerRows, recordRows] = await batch([
    statement('SELECT id FROM running_match WHERE id = ?', runningId),
    statement('SELECT COALESCE(MAX(id), 0) AS id FROM matches'),
    statement(`SELECT id, elo_attack AS eloAttack, elo_defense AS eloDefense FROM players WHERE id IN (${marks})`, ...ids),
    selectRecords(ids)
  ]);
  if (!runningRows!.results.length) {
    return 'not-running';
  }

  const lastId = (lastRows!.results[0] as { id: number }).id;
  const players = new Map((playerRows!.results as Array<{ id: number; eloAttack: number; eloDefense: number }>).map(player => [player.id, player]));
  if (players.size !== 4) {
    return 'unknown-player';
  }

  // The players that never played have no records yet
  const records = parseRecords(recordRows!.results as RecordRow[]);
  for (let i = 0; i < ids.length; i++) {
    if (!records.has(ids[i]!)) {
      records.set(ids[i]!, emptyRecords());
    }
  }

  const inRole = (id: number, role: Role): EloPlayer => {
    const player = players.get(id)!;
    return { elo: role === 'attack' ? player.eloAttack : player.eloDefense, matches: records.get(id)![role].matches };
  };
  const brownPlayers = { attack: inRole(brown.attack, 'attack'), defense: inRole(brown.defense, 'defense') };
  const whitePlayers = { attack: inRole(white.attack, 'attack'), defense: inRole(white.defense, 'defense') };
  const result = computeMatchElo(brownPlayers, whitePlayers, brownScore, whiteScore, config);

  // [player id, team, role, ELO before, ELO in the role, change]
  const matchPlayers: Array<[number, Team, Role, number, number, number]> = [];
  const elos = new Map<number, Lineup<number>>();
  for (const team of ['brown', 'white'] as const) {
    const delta = team === 'brown' ? result.brownDelta : result.whiteDelta;
    const [goalsFor, goalsAgainst] = team === 'brown' ? [brownScore, whiteScore] : [whiteScore, brownScore];
    for (const role of ['attack', 'defense'] as const) {
      const id = (team === 'brown' ? brown : white)[role];
      const before = (team === 'brown' ? brownPlayers : whitePlayers)[role].elo;
      const player = players.get(id)!;
      matchPlayers.push([id, team, role, before, before, delta]);
      elos.set(id, { attack: role === 'attack' ? before + delta : player.eloAttack, defense: role === 'defense' ? before + delta : player.eloDefense });
      addMatch(records.get(id)!, role, goalsFor > goalsAgainst, goalsFor, goalsAgainst, delta);
    }
  }

  let saved: D1Result[];
  try {
    saved = await batch([
      // Fails the transaction if another match was saved after the read, or the match to play was ended: json() refuses
      // the text. Two users saving the same match at the same time: only the first one passes
      statement(
        "SELECT CASE WHEN COALESCE(MAX(id), 0) <> ? OR NOT EXISTS (SELECT 1 FROM running_match WHERE id = ?) THEN json('conflict') END FROM matches",
        lastId,
        runningId
      ),
      statement(
        'INSERT INTO matches (brown_score, white_score, winner, white_expected, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id',
        brownScore,
        whiteScore,
        brownScore > whiteScore ? 'brown' : 'white',
        result.whiteExpected,
        userId
      ),
      // The batch is a transaction: the last match is the one just inserted
      statement(
        `INSERT INTO match_players (match_id, player_id, team, role, elo_before, role_elo, elo_delta)
         SELECT (SELECT MAX(id) FROM matches), json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
           json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]')
         FROM json_each(?)`,
        JSON.stringify(matchPlayers)
      ),
      statement(
        `UPDATE players SET elo_attack = json_extract(u.value, '$[1]'), elo_defense = json_extract(u.value, '$[2]')
         FROM json_each(?) u WHERE players.id = json_extract(u.value, '$[0]')`,
        JSON.stringify([...elos].map(([id, elo]) => [id, elo.attack, elo.defense]))
      ),
      storeRecords(records),
      addPairs(pairsOf({ brown, white })),
      statement('DELETE FROM running_match')
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('malformed JSON')) {
      return (await get('SELECT 1 FROM running_match WHERE id = ?', runningId)) ? 'conflict' : 'not-running';
    }

    throw error;
  }

  return {
    id: (saved[1]!.results[0] as { id: number }).id,
    brownDelta: roundAwayFromZero(result.brownDelta),
    whiteDelta: roundAwayFromZero(result.whiteDelta)
  };
}

/**
 * Finds the players of a team, each in the role it plays.
 *
 * @param ids - The ids of the team, by role.
 * @param players - The players with their two roles, by id.
 * @returns The players in their roles, `undefined` when the team is incomplete.
 */
function resolveLineup(ids: Partial<Lineup<number>>, players: Map<number, Record<Role, EloPlayer>>): Lineup<EloPlayer> | undefined {
  const attack = ids.attack === undefined ? undefined : players.get(ids.attack)?.attack;
  const defense = ids.defense === undefined ? undefined : players.get(ids.defense)?.defense;
  return attack && defense ? { attack, defense } : undefined;
}

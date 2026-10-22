import { all, batch, statement } from '../db/db.ts';
import type { Lineup, Role, Team } from '../models.ts';
import { addMatch, addPairs, emptyRecords, pairsOf, parseRecords, selectRecords, storeRecords } from '../players/player-stats.ts';
import type { PairCount, PlayerRecords, RecordRow } from '../players/player-stats.ts';
import { computeMatchElo, roundAwayFromZero } from './elo.ts';
import type { EloPlayer } from './elo.ts';

/**
 * A match saved by `recordMatch`.
 */
export interface RecordedMatch {
  /**
   * Id of the match.
   */
  id: number;
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
 * Recomputes every ELO and every derived statistic from scratch, as the previous project did at each load: starting
 * from the initial ELO of each player, in both roles, the matches are replayed in the order they were played; each
 * player changes only the ELO of the role it played. The results are stored in `match_players` (ELO in the role before
 * the match, change), `matches.red_expected`, `players.elo_attack` / `players.elo_defense`, `player_stats` and
 * `player_pairs`.
 *
 * It reads every match, so it runs only on request (the admin page), after a manual change to the database (initial
 * ELO, matches added, fixed or removed): a saved match updates only what it changes, in `recordMatch`. Only the rows
 * whose values change are written.
 */
export async function recomputeRatings(): Promise<void> {
  const players = new Map<number, Record<Role, EloPlayer>>();
  const records = new Map<number, PlayerRecords>();
  const [playerRows, matches, lineupRows] = await Promise.all([
    all<{ id: number; startElo: number }>('SELECT id, start_elo AS startElo FROM players'),
    all<{ id: number; redScore: number; blueScore: number }>('SELECT id, red_score AS redScore, blue_score AS blueScore FROM matches ORDER BY played_at, id'),
    all<{ matchId: number; playerId: number; team: Team; role: Role }>('SELECT match_id AS matchId, player_id AS playerId, team, role FROM match_players')
  ]);
  for (let i = 0; i < playerRows.length; i++) {
    const { id, startElo } = playerRows[i]!;
    players.set(id, { attack: { elo: startElo, matches: 0 }, defense: { elo: startElo, matches: 0 } });
    records.set(id, emptyRecords());
  }

  const lineups = new Map<number, { red: Partial<Lineup<number>>; blue: Partial<Lineup<number>> }>();
  for (let i = 0; i < lineupRows.length; i++) {
    const { matchId, playerId, team, role } = lineupRows[i]!;
    let lineup = lineups.get(matchId);
    if (!lineup) {
      lineup = { red: {}, blue: {} };
      lineups.set(matchId, lineup);
    }

    lineup[team][role] = playerId;
  }

  // [id, red expected], [match id, player id, ELO before, ELO in the role, change], [id, ELO attack, ELO defense]
  const matchUpdates: Array<[number, number]> = [];
  const matchPlayerUpdates: Array<[number, number, number, number, number]> = [];
  const playerUpdates: Array<[number, number, number]> = [];
  const pairs = new Map<string, PairCount>();
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const ids = lineups.get(match.id);
    const red = ids && resolveLineup(ids.red, players);
    const blue = ids && resolveLineup(ids.blue, players);
    if (!ids || !red || !blue) {
      console.warn(`Partita ${match.id} ignorata nel calcolo dell'ELO: formazione incompleta`);
      continue;
    }

    const result = computeMatchElo(red, blue, match.redScore, match.blueScore);
    matchUpdates.push([match.id, result.redExpected]);
    for (const team of ['red', 'blue'] as const) {
      const delta = team === 'red' ? result.redDelta : result.blueDelta;
      const [goalsFor, goalsAgainst] = team === 'red' ? [match.redScore, match.blueScore] : [match.blueScore, match.redScore];
      for (const role of ['attack', 'defense'] as const) {
        const player = team === 'red' ? red[role] : blue[role];
        const playerId = ids[team][role]!;
        matchPlayerUpdates.push([match.id, playerId, player.elo, player.elo, delta]);
        addMatch(records.get(playerId)!, role, goalsFor > goalsAgainst, goalsFor, goalsAgainst, delta);
      }
    }

    const matchPairs = pairsOf({ red: ids.red as Lineup<number>, blue: ids.blue as Lineup<number> });
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
    for (const player of [red.attack, red.defense]) {
      player.elo += result.redDelta;
      player.matches++;
    }

    for (const player of [blue.attack, blue.defense]) {
      player.elo += result.blueDelta;
      player.matches++;
    }
  }

  for (const [id, player] of players) {
    playerUpdates.push([id, player.attack.elo, player.defense.elo]);
  }

  await batch([
    statement(
      `UPDATE matches SET red_expected = json_extract(u.value, '$[1]')
       FROM json_each(?) u
       WHERE matches.id = json_extract(u.value, '$[0]') AND matches.red_expected IS NOT json_extract(u.value, '$[1]')`,
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
 * @param red - The ids of the red players.
 * @param blue - The ids of the blue players.
 * @param redScore - Goals of the red team.
 * @param blueScore - Goals of the blue team.
 * @param userId - The user who saves it.
 * @returns The match with the changes of ELO; `'unknown-player'` when a player doesn't exist, `'conflict'` when another
 * match was saved in the meantime (the ELOs it was computed from changed): nothing was saved.
 */
export async function recordMatch(
  red: Lineup<number>,
  blue: Lineup<number>,
  redScore: number,
  blueScore: number,
  userId: number
): Promise<RecordedMatch | 'unknown-player' | 'conflict'> {
  const ids = [red.attack, red.defense, blue.attack, blue.defense];
  const marks = ids.map(() => '?').join(', ');
  // One read transaction: the last match and the state it left
  const [lastRows, playerRows, recordRows] = await batch([
    statement('SELECT COALESCE(MAX(id), 0) AS id FROM matches'),
    statement(`SELECT id, elo_attack AS eloAttack, elo_defense AS eloDefense FROM players WHERE id IN (${marks})`, ...ids),
    selectRecords(ids)
  ]);
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
  const redPlayers = { attack: inRole(red.attack, 'attack'), defense: inRole(red.defense, 'defense') };
  const bluePlayers = { attack: inRole(blue.attack, 'attack'), defense: inRole(blue.defense, 'defense') };
  const result = computeMatchElo(redPlayers, bluePlayers, redScore, blueScore);

  // [player id, team, role, ELO before, ELO in the role, change]
  const matchPlayers: Array<[number, Team, Role, number, number, number]> = [];
  const elos = new Map<number, Lineup<number>>();
  for (const team of ['red', 'blue'] as const) {
    const delta = team === 'red' ? result.redDelta : result.blueDelta;
    const [goalsFor, goalsAgainst] = team === 'red' ? [redScore, blueScore] : [blueScore, redScore];
    for (const role of ['attack', 'defense'] as const) {
      const id = (team === 'red' ? red : blue)[role];
      const before = (team === 'red' ? redPlayers : bluePlayers)[role].elo;
      const player = players.get(id)!;
      matchPlayers.push([id, team, role, before, before, delta]);
      elos.set(id, { attack: role === 'attack' ? before + delta : player.eloAttack, defense: role === 'defense' ? before + delta : player.eloDefense });
      addMatch(records.get(id)!, role, goalsFor > goalsAgainst, goalsFor, goalsAgainst, delta);
    }
  }

  let saved: D1Result[];
  try {
    saved = await batch([
      // Fails the transaction if another match was saved after the read: json() refuses the text
      statement("SELECT CASE WHEN COALESCE(MAX(id), 0) <> ? THEN json('conflict') END FROM matches", lastId),
      statement(
        'INSERT INTO matches (red_score, blue_score, winner, red_expected, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id',
        redScore,
        blueScore,
        redScore > blueScore ? 'red' : 'blue',
        result.redExpected,
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
      addPairs(pairsOf({ red, blue })),
      statement('DELETE FROM running_match')
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('malformed JSON')) {
      return 'conflict';
    }

    throw error;
  }

  return {
    id: (saved[1]!.results[0] as { id: number }).id,
    redDelta: roundAwayFromZero(result.redDelta),
    blueDelta: roundAwayFromZero(result.blueDelta)
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

import { all, batch, statement } from '../db/db.ts';
import type { Lineup, Role, Team } from '../models.ts';
import { computeMatchElo } from './elo.ts';
import type { EloPlayer } from './elo.ts';

/**
 * Recomputes every ELO from scratch, as the previous project did at each load: starting from the initial ELO of
 * each player, in both roles, the matches are replayed in the order they were played; each player changes only the
 * ELO of the role it played. The results are stored in `match_players` (ELO in the role before the match, change),
 * `matches.red_expected` and `players.elo_attack` / `players.elo_defense`.
 *
 * Replaying everything keeps the ratings consistent after any manual change to the database (initial ELO, matches
 * added, fixed or removed), and costs a few milliseconds for thousands of matches. The new values are written by three
 * statements, each reading them from a JSON array, in one transaction.
 */
export async function recomputeRatings(): Promise<void> {
  const players = new Map<number, Record<Role, EloPlayer>>();
  const [playerRows, matches, lineupRows] = await Promise.all([
    all<{ id: number; startElo: number }>('SELECT id, start_elo AS startElo FROM players'),
    all<{ id: number; redScore: number; blueScore: number }>('SELECT id, red_score AS redScore, blue_score AS blueScore FROM matches ORDER BY played_at, id'),
    all<{ matchId: number; playerId: number; team: Team; role: Role }>('SELECT match_id AS matchId, player_id AS playerId, team, role FROM match_players')
  ]);
  for (let i = 0; i < playerRows.length; i++) {
    const { id, startElo } = playerRows[i]!;
    players.set(id, { attack: { elo: startElo, matches: 0 }, defense: { elo: startElo, matches: 0 } });
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
      for (const role of ['attack', 'defense'] as const) {
        const player = team === 'red' ? red[role] : blue[role];
        matchPlayerUpdates.push([match.id, ids[team][role]!, player.elo, player.elo, delta]);
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
       FROM json_each(?) u WHERE matches.id = json_extract(u.value, '$[0]')`,
      JSON.stringify(matchUpdates)
    ),
    statement(
      `UPDATE match_players
       SET elo_before = json_extract(u.value, '$[2]'), role_elo = json_extract(u.value, '$[3]'), elo_delta = json_extract(u.value, '$[4]')
       FROM json_each(?) u
       WHERE match_players.match_id = json_extract(u.value, '$[0]') AND match_players.player_id = json_extract(u.value, '$[1]')`,
      JSON.stringify(matchPlayerUpdates)
    ),
    statement(
      `UPDATE players SET elo_attack = json_extract(u.value, '$[1]'), elo_defense = json_extract(u.value, '$[2]')
       FROM json_each(?) u WHERE players.id = json_extract(u.value, '$[0]')`,
      JSON.stringify(playerUpdates)
    )
  ]);
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

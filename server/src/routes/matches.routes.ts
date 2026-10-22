import { Hono } from 'hono';
import { requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { all, batch, statement } from '../db/db.ts';
import { recomputeRatings } from '../elo/ratings.ts';
import { clearRunningMatch, getRunningMatch, setRunningMatch } from '../matches/running-match.ts';
import type { MatchView } from '../matches/running-match.ts';
import { loadMatchmakingContext } from '../matchmaking/matchmaking.context.ts';
import { findBestMatch } from '../matchmaking/matchmaking.ts';
import type { Lineup, Team } from '../models.ts';
import { readBody } from './read-body.ts';

/**
 * Goals that win a match: it ends when a team scores them, so one team has exactly this and the other fewer.
 */
const WINNING_SCORE = 8;

/**
 * The match to play (only one at a time) and the saving of the results.
 */
export const matchesRouter = new Hono<AppEnv>();

matchesRouter.get('/running', async c => c.json(await getRunningMatch()));

matchesRouter.post('/generate', requireAuth, async c => {
  const { playerIds, priorityIds } = await readBody(c);
  if (!isIdList(playerIds) || new Set(playerIds).size !== playerIds.length || playerIds.length < 4) {
    return c.json({ error: 'Seleziona almeno 4 giocatori diversi' }, 400);
  }

  const priority = priorityIds === undefined ? [] : priorityIds;
  if (!isIdList(priority) || priority.length > 4 || !priority.every(id => playerIds.includes(id))) {
    return c.json({ error: 'I giocatori con priorità devono essere al massimo 4, tra quelli selezionati' }, 400);
  }

  // One match at a time: a page that doesn't show it (somebody generated it in the meantime) learns it from this answer
  const running = await getRunningMatch();
  if (running) {
    return c.json(alreadyGenerated(running), 409);
  }

  const context = await loadMatchmakingContext();
  if (!playerIds.every(id => context.players.has(id))) {
    return c.json({ error: 'Giocatore non trovato' }, 400);
  }

  const proposal = findBestMatch(context, playerIds, priority);
  if (!proposal) {
    return c.json({ error: 'Nessuna partita possibile con questi giocatori: i ruoli richiesti non tornano' }, 422);
  }

  const generated = await setRunningMatch(
    { attack: proposal.red.attack.id, defense: proposal.red.defense.id },
    { attack: proposal.blue.attack.id, defense: proposal.blue.defense.id },
    c.get('user').id
  );
  if (generated) {
    return c.json(generated);
  }

  // Two users generated at the same time: the one that was stored first stays
  const winner = await getRunningMatch();
  return c.json(winner ? alreadyGenerated(winner) : { error: 'Riprova' }, 409);
});

matchesRouter.delete('/running', requireAuth, async c => {
  await clearRunningMatch();
  return c.body(null, 204);
});

matchesRouter.post('/', requireAuth, async c => {
  const { red, blue, redScore, blueScore } = await readBody(c);
  if (!isLineup(red) || !isLineup(blue) || new Set([red.attack, red.defense, blue.attack, blue.defense]).size !== 4) {
    return c.json({ error: 'Formazioni non valide' }, 400);
  }

  if (!isScore(redScore) || !isScore(blueScore) || Math.max(redScore, blueScore) !== WINNING_SCORE || redScore === blueScore) {
    return c.json({ error: `Si vince a ${WINNING_SCORE}: una squadra deve fare ${WINNING_SCORE} e l'altra meno (ad esempio 8-5)` }, 400);
  }

  const ids = [red.attack, red.defense, blue.attack, blue.defense];
  const found = await all<{ id: number }>(`SELECT id FROM players WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids);
  if (found.length !== 4) {
    return c.json({ error: 'Giocatore non trovato' }, 400);
  }

  // The match, its lineup and the end of the match to play together. The ELO columns are filled by the recomputation,
  // which replays every match in order
  const statements = [
    statement(
      'INSERT INTO matches (red_score, blue_score, winner, created_by) VALUES (?, ?, ?, ?) RETURNING id',
      redScore,
      blueScore,
      redScore > blueScore ? 'red' : 'blue',
      c.get('user').id
    )
  ];
  for (const team of ['red', 'blue'] as const) {
    for (const role of ['attack', 'defense'] as const) {
      // The batch is a transaction: the last match is the one just inserted
      statements.push(statement(
        'INSERT INTO match_players (match_id, player_id, team, role) VALUES ((SELECT MAX(id) FROM matches), ?, ?, ?)',
        (team === 'red' ? red : blue)[role],
        team,
        role
      ));
    }
  }

  statements.push(statement('DELETE FROM running_match'));
  const [inserted] = await batch(statements);
  const matchId = (inserted!.results[0] as { id: number }).id;
  await recomputeRatings();

  const deltas = await all<{ team: Team; delta: number }>(
    'SELECT team, CAST(ROUND(MAX(elo_delta)) AS INTEGER) AS delta FROM match_players WHERE match_id = ? GROUP BY team',
    matchId
  );
  return c.json({
    id: matchId,
    redDelta: deltas.find(row => row.team === 'red')?.delta ?? 0,
    blueDelta: deltas.find(row => row.team === 'blue')?.delta ?? 0
  }, 201);
});

/**
 * The answer for a request that needs no match to play, when there is one.
 *
 * @param running - The match to play.
 * @returns The message and the match, so that the page shows it.
 */
function alreadyGenerated(running: MatchView): { error: string; running: MatchView } {
  return {
    error: `Risulta già una partita generata${running.generatedBy ? ` da ${running.generatedBy}` : ''}: salvala o eliminala prima di generarne un'altra`,
    running
  };
}

/**
 * Checks a list of ids sent by the client.
 *
 * @param value - The value sent.
 * @returns Whether it is an array of integers.
 */
function isIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isInteger);
}

/**
 * Checks the lineup of a team sent by the client.
 *
 * @param value - The value sent.
 * @returns Whether it holds the ids of the two players.
 */
function isLineup(value: unknown): value is Lineup<number> {
  const lineup = value as Partial<Lineup<unknown>> | null;
  return typeof lineup === 'object' && lineup !== null && Number.isInteger(lineup.attack) && Number.isInteger(lineup.defense);
}

/**
 * Checks a score sent by the client.
 *
 * @param value - The value sent.
 * @returns Whether it is a valid score.
 */
function isScore(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= WINNING_SCORE;
}

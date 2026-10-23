import { Hono } from 'hono';
import { requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { recordMatch } from '../elo/ratings.ts';
import { listMatches } from '../matches/matches.repository.ts';
import { clearRunningMatch, getRunningMatch, setRunningMatch } from '../matches/running-match.ts';
import type { MatchView } from '../matches/running-match.ts';
import { loadMatchmakingContext } from '../matchmaking/matchmaking.context.ts';
import { findBestMatch } from '../matchmaking/matchmaking.ts';
import type { Lineup } from '../models.ts';
import { listLeaderboard } from '../players/players.repository.ts';
import { readBody } from './read-body.ts';

/**
 * Goals that win a match: it ends when a team scores them, so one team has exactly this and the other fewer.
 */
const WINNING_SCORE = 8;

/**
 * How many matches a page of the list holds.
 */
const PAGE_SIZE = 20;

/**
 * The match to play (only one at a time) and the saving of the results.
 */
export const matchesRouter = new Hono<AppEnv>();

// The played matches, newest first, a page at a time (?page=1, from 1)
matchesRouter.get('/', async c => {
  const page = Number(c.req.query('page') ?? 1);
  if (!Number.isInteger(page) || page < 1) {
    return c.json({ error: 'Pagina non valida' }, 400);
  }

  return c.json(await listMatches(page, PAGE_SIZE));
});

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
  const { runningId, red, blue, redScore, blueScore } = await readBody(c);
  if (!Number.isInteger(runningId)) {
    return c.json({ error: 'Partita da salvare non indicata' }, 400);
  }

  if (!isLineup(red) || !isLineup(blue) || new Set([red.attack, red.defense, blue.attack, blue.defense]).size !== 4) {
    return c.json({ error: 'Formazioni non valide' }, 400);
  }

  if (!isScore(redScore) || !isScore(blueScore) || Math.max(redScore, blueScore) !== WINNING_SCORE || redScore === blueScore) {
    return c.json({ error: `Si vince a ${WINNING_SCORE}: una squadra deve fare ${WINNING_SCORE} e l'altra meno (ad esempio 8-5)` }, 400);
  }

  const saved = await recordMatch(runningId as number, red, blue, redScore, blueScore, c.get('user').id);
  if (saved === 'unknown-player') {
    return c.json({ error: 'Giocatore non trovato' }, 400);
  }

  // Somebody else saved (or deleted) it first: the page drops it and shows the match to play now, if any
  if (saved === 'not-running') {
    return c.json({ error: 'La partita è già stata salvata (o eliminata) da qualcun altro', running: await getRunningMatch() }, 409);
  }

  if (saved === 'conflict') {
    return c.json({ error: "Nel frattempo è stata salvata un'altra partita: riprova" }, 409);
  }

  // The players with their new ELOs, so that the page doesn't ask for them again
  return c.json({ ...saved, players: await listLeaderboard() }, 201);
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

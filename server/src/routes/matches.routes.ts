import { Hono } from 'hono';
import { requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { recordMatch } from '../elo/ratings.ts';
import { replaceRunningMatch } from '../lobby/lobby.ts';
import { listMatches } from '../matches/matches.repository.ts';
import { getRunningMatch } from '../matches/running-match.ts';
import type { Lineup } from '../models.ts';
import { listLeaderboard } from '../players/players.repository.ts';
import { readBody } from './read-body.ts';

/**
 * Goals that win a match: it ends when a team scores them, so one team has exactly this and the other fewer.
 */
const WINNING_SCORE = 8;

/**
 * How many matches a page of the list holds, unless asked otherwise, and the most it can hold.
 */
const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/**
 * The match to play (only one at a time) and the saving of the results.
 */
export const matchesRouter = new Hono<AppEnv>();

// The played matches, newest first, a page at a time (?page=1, from 1; ?size=10, how many in a page)
matchesRouter.get('/', async c => {
  const page = Number(c.req.query('page') ?? 1);
  const size = Number(c.req.query('size') ?? PAGE_SIZE);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    return c.json({ error: 'Pagina non valida' }, 400);
  }

  return c.json(await listMatches(page, size));
});

matchesRouter.get('/running', async c => c.json(await getRunningMatch()));

// Deleting the match to play generates another one at once, while a lobby is open after its match: the answer is it
matchesRouter.delete('/running', requireAuth, async c => {
  return c.json(await replaceRunningMatch(c.get('user').id));
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

import { Hono } from 'hono';
import { requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { get } from '../db/db.ts';
import { generateNextMatch, getLobbyState, setInLobby, setLobbyPriority, tick } from '../lobby/lobby.ts';
import type { LobbyMatchFailure } from '../lobby/lobby.ts';
import { readBody } from './read-body.ts';

/**
 * The lobby page: the open lobby, entering and leaving it (or putting another player in and out), and the matches
 * generated after the one of its time.
 */
export const lobbyRouter = new Hono<AppEnv>();

lobbyRouter.use(requireAuth);

// The lobby is brought up to date with the clock first: a late cron doesn't keep it closed (or open)
lobbyRouter.get('/', async c => {
  await tick();
  return c.json(await getLobbyState());
});

lobbyRouter.post('/:id/join', async c => setInside(c.req.param('id'), c.get('user').playerId, true).then(answer => c.json(answer.body, answer.status)));

lobbyRouter.post('/:id/leave', async c => setInside(c.req.param('id'), c.get('user').playerId, false).then(answer => c.json(answer.body, answer.status)));

// Another player put in or taken out by hand ({ priority: true } puts it in as obligatory for the next match), or made
// obligatory or not. Somebody else may have done it first, since the page isn't live: then the answer is a conflict with
// the lobby as it is now, for the page to show it
lobbyRouter.put('/:id/players/:playerId', async c => {
  const { priority } = await readBody(c);
  const answer = await setOtherInside(c.req.param('id'), c.req.param('playerId'), true, priority === true);
  return c.json(answer.body, answer.status);
});

lobbyRouter.delete('/:id/players/:playerId', async c => setOtherInside(c.req.param('id'), c.req.param('playerId'), false).then(answer => c.json(answer.body, answer.status)));

lobbyRouter.put('/:id/players/:playerId/priority', async c => {
  const { priority } = await readBody(c);
  if (typeof priority !== 'boolean') {
    return c.json({ error: 'Dati mancanti' }, 400);
  }

  const answer = await setOtherInside(c.req.param('id'), c.req.param('playerId'), true, priority, true);
  return c.json(answer.body, answer.status);
});

lobbyRouter.post('/:id/generate', async c => {
  const lobbyId = Number(c.req.param('id'));
  if (!Number.isInteger(lobbyId)) {
    return c.json({ error: 'Lobby non trovata' }, 404);
  }

  await tick();
  const result = await generateNextMatch(lobbyId, c.get('user').id);
  if (typeof result !== 'string') {
    return c.json(result);
  }

  const errors: Record<LobbyMatchFailure | 'closed' | 'too-early', string> = {
    closed: 'La lobby è chiusa',
    'too-early': "La prima partita della lobby viene generata all'orario stabilito",
    'not-enough': 'Servono almeno 4 giocatori in lobby',
    running: "C'è già una partita in corso: salvala o eliminala prima di generarne un'altra",
    impossible: 'Con i ruoli di chi è in lobby (e i giocatori obbligatori) non si può formare una partita'
  };
  return c.json({ error: errors[result] }, result === 'impossible' ? 422 : 409);
});

/**
 * Enters the logged player in a lobby, or takes it out.
 *
 * @param id - The id of the lobby, as in the path.
 * @param playerId - The player.
 * @param inside - Whether it enters.
 * @returns The answer: the lobby page, or the error.
 */
async function setInside(id: string, playerId: number, inside: boolean): Promise<{ body: object; status: 200 | 404 | 409 }> {
  const lobbyId = Number(id);
  if (!Number.isInteger(lobbyId)) {
    return { body: { error: 'Lobby non trovata' }, status: 404 };
  }

  await tick();
  if ((await setInLobby(lobbyId, playerId, inside)) === 'closed') {
    return { body: { error: 'La lobby è chiusa' }, status: 409 };
  }

  return { body: await getLobbyState(), status: 200 };
}

/**
 * Puts another player in a lobby, or takes it out; or makes one already in obligatory for the next match, or not.
 *
 * @param id - The id of the lobby, as in the path.
 * @param player - The id of the player, as in the path.
 * @param inside - Whether it enters.
 * @param priority - Whether the next match must include it.
 * @param onlyPriority - Whether the player stays in, and only `priority` changes.
 * @returns The answer: the lobby page; or the error, with the lobby page in `state` when the player was already in (or
 * already out, or no longer in when only `priority` changes).
 */
async function setOtherInside(id: string, player: string, inside: boolean, priority = false, onlyPriority = false): Promise<{ body: object; status: 200 | 404 | 409 }> {
  const lobbyId = Number(id);
  const playerId = Number(player);
  if (!Number.isInteger(lobbyId)) {
    return { body: { error: 'Lobby non trovata' }, status: 404 };
  }

  const row = Number.isInteger(playerId) ? await get<{ name: string }>('SELECT name FROM players WHERE id = ?', playerId) : undefined;
  if (!row) {
    return { body: { error: 'Giocatore non trovato' }, status: 404 };
  }

  await tick();
  const result = onlyPriority ? await setLobbyPriority(lobbyId, playerId, priority) : await setInLobby(lobbyId, playerId, inside, priority);
  switch (result) {
    case 'closed':
      return { body: { error: 'La lobby è chiusa' }, status: 409 };
    case 'unchanged':
      return {
        body: { error: inside && !onlyPriority ? `${row.name} è già in lobby` : `${row.name} non è più in lobby`, state: await getLobbyState() },
        status: 409
      };
    default:
      return { body: await getLobbyState(), status: 200 };
  }
}

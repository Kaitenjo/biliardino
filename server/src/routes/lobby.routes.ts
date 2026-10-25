import { Hono } from 'hono';
import { requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { generateNextMatch, getLobbyState, setInLobby, tick } from '../lobby/lobby.ts';
import type { LobbyMatchFailure } from '../lobby/lobby.ts';

/**
 * The lobby page: the open lobby, entering and leaving it, and the matches generated after the one of its time.
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
    impossible: 'Con i ruoli di chi è in lobby non si può formare una partita'
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
  if (!(await setInLobby(lobbyId, playerId, inside))) {
    return { body: { error: 'La lobby è chiusa' }, status: 409 };
  }

  return { body: await getLobbyState(), status: 200 };
}

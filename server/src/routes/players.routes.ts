import { Hono } from 'hono';
import { findPlayerDetail, listLeaderboard } from '../players/players.repository.ts';

/**
 * Leaderboard and players.
 */
export const playersRouter = new Hono();

playersRouter.get('/', async c => c.json(await listLeaderboard()));

// The leaderboard: only the players with at least one match (in the role), ranked by the best of their two ELOs or
// by the ELO of a role (?by=attack|defense). Before `/:id`, so that it doesn't read "ranking" as an id
playersRouter.get('/ranking', async c => {
  const by = c.req.query('by');
  return c.json(await listLeaderboard(by === 'attack' || by === 'defense' ? by : 'best', true));
});

playersRouter.get('/:id', async c => {
  const id = Number(c.req.param('id'));
  const detail = Number.isInteger(id) ? await findPlayerDetail(id) : undefined;
  if (!detail) {
    return c.json({ error: 'Giocatore non trovato' }, 404);
  }

  return c.json(detail);
});

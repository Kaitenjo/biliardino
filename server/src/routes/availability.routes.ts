import { Hono } from 'hono';
import { requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { get, run } from '../db/db.ts';
import { today } from '../dates.ts';
import { readBody } from './read-body.ts';

/**
 * Whether each player is available today. It is read with the leaderboard (`availableToday`) and resets each day, and
 * each player changes its own (the super admin, anybody's).
 */
export const availabilityRouter = new Hono<AppEnv>();

availabilityRouter.put('/:playerId', requireAuth, async c => {
  const playerId = Number(c.req.param('playerId'));
  const { available } = await readBody(c);
  if (!Number.isInteger(playerId) || !(await get('SELECT 1 FROM players WHERE id = ?', playerId))) {
    return c.json({ error: 'Giocatore non trovato' }, 404);
  }

  // Everybody changes only their own availability; the super admin changes anybody's
  const user = c.get('user');
  if (playerId !== user.playerId && !user.isAdmin) {
    return c.json({ error: 'Puoi modificare solo la tua disponibilità' }, 403);
  }

  if (typeof available !== 'boolean') {
    return c.json({ error: 'Dati mancanti' }, 400);
  }

  await run('UPDATE players SET available_on = ? WHERE id = ?', available ? today() : null, playerId);
  return c.json({ playerId, available });
});

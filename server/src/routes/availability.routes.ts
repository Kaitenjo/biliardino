import { Hono } from 'hono';
import { requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { batch, get, statement } from '../db/db.ts';
import { readBody } from './read-body.ts';

/**
 * The days of the week each player is usually available. They are read with the leaderboard (`weekdays`).
 */
export const availabilityRouter = new Hono<AppEnv>();

availabilityRouter.put('/:playerId', requireAuth, async c => {
  const playerId = Number(c.req.param('playerId'));
  const { weekdays } = await readBody(c);
  if (!Number.isInteger(playerId) || !(await get('SELECT 1 FROM players WHERE id = ?', playerId))) {
    return c.json({ error: 'Giocatore non trovato' }, 404);
  }

  if (!Array.isArray(weekdays) || !weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)) {
    return c.json({ error: 'I giorni vanno da 0 (domenica) a 6 (sabato)' }, 400);
  }

  const days = [...new Set(weekdays as number[])].sort();
  await batch([
    statement('DELETE FROM player_availability WHERE player_id = ?', playerId),
    ...days.map(day => statement('INSERT INTO player_availability (player_id, weekday) VALUES (?, ?)', playerId, day))
  ]);

  return c.json({ playerId, weekdays: days });
});

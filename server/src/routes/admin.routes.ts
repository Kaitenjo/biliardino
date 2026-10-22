import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { all, get, run } from '../db/db.ts';
import { readBody } from './read-body.ts';

/**
 * The pages of the super admin, who can change the roles of any player without the limit of once a day. The change
 * doesn't use up the day of the player either.
 */
export const adminRouter = new Hono<AppEnv>();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/roles', async c => {
  const players = await all<{ id: number; name: string; icon: string; attack: number; defense: number }>(
    'SELECT id, name, icon, plays_attack AS attack, plays_defense AS defense FROM players ORDER BY name'
  );
  return c.json(players.map(player => ({ id: player.id, name: player.name, icon: player.icon, attack: Boolean(player.attack), defense: Boolean(player.defense) })));
});

adminRouter.put('/roles/:playerId', async c => {
  const playerId = Number(c.req.param('playerId'));
  const { attack, defense } = await readBody(c);
  if (!Number.isInteger(playerId) || !(await get('SELECT 1 FROM players WHERE id = ?', playerId))) {
    return c.json({ error: 'Giocatore non trovato' }, 404);
  }

  if (typeof attack !== 'boolean' || typeof defense !== 'boolean') {
    return c.json({ error: 'Dati mancanti' }, 400);
  }

  if (!attack && !defense) {
    return c.json({ error: 'Serve almeno un ruolo' }, 400);
  }

  await run('UPDATE players SET plays_attack = ?, plays_defense = ? WHERE id = ?', attack ? 1 : 0, defense ? 1 : 0, playerId);
  return c.json({ id: playerId, attack, defense });
});

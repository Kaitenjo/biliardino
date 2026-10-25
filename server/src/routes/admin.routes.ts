import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { get, run } from '../db/db.ts';
import { loadEloConfig, parseEloConfig, START_ELO_LIMITS } from '../elo/elo-config.ts';
import { DEFAULT_ELO_CONFIG } from '../elo/elo.ts';
import { recomputeRatings } from '../elo/ratings.ts';
import { getLobbyState, tick } from '../lobby/lobby.ts';
import { readBody } from './read-body.ts';

/**
 * The pages of the super admin, who can change the roles of any player without the limit of once a day. The change
 * doesn't use up the day of the player either.
 */
export const adminRouter = new Hono<AppEnv>();

adminRouter.use(requireAuth, requireAdmin);

// Runs the scheduler of the lobbies now, or as at another moment ({ at: ISO date }): to try the lobbies without waiting
// for their times. A moment in the past or the future acts on the lobbies of that day, as the cron would
adminRouter.post('/lobby/tick', async c => {
  const { at } = await readBody(c);
  const now = typeof at === 'string' ? new Date(at) : new Date();
  if (Number.isNaN(now.getTime())) {
    return c.json({ error: 'Data non valida' }, 400);
  }

  await tick(now);
  return c.json(await getLobbyState());
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

// The saved variables of the ELO system, with the defaults to restore
adminRouter.get('/elo-config', async c => c.json({ config: await loadEloConfig(), defaults: DEFAULT_ELO_CONFIG, startEloLimits: START_ELO_LIMITS }));

// Saves the variables sent and rebuilds every ELO and statistic from the matches with them (one transaction). With no
// body, it only rebuilds with the saved ones, e.g. after a manual change to the database (initial ELOs, matches)
adminRouter.post('/recompute', async c => {
  const body = await readBody(c);
  if (!Object.keys(body).length) {
    await recomputeRatings();
    return c.body(null, 204);
  }

  const config = parseEloConfig(body);
  if (typeof config === 'string') {
    return c.json({ error: config }, 400);
  }

  const startElo = body['startElo'];
  if (startElo !== undefined && startElo !== null && (typeof startElo !== 'number' || !(startElo >= START_ELO_LIMITS.min && startElo <= START_ELO_LIMITS.max))) {
    return c.json({ error: 'Valore non valido: startElo' }, 400);
  }

  await recomputeRatings({ config, startElo: startElo ?? undefined });
  return c.json({ config });
});

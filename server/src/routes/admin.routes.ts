import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { all, get, run } from '../db/db.ts';
import { loadEloConfig, parseEloConfig, START_ELO_LIMITS } from '../elo/elo-config.ts';
import { DEFAULT_ELO_CONFIG } from '../elo/elo.ts';
import { recomputeRatings } from '../elo/ratings.ts';
import { PRIVILEGED_PLAYER } from '../players/privileged-player.ts';
import { listRanks, RANK_LIMITS, saveRanks } from '../players/ranks.ts';
import { getLobbyState, removeBannedPlayer, tick } from '../lobby/lobby.ts';
import { readBody } from './read-body.ts';

/**
 * A player as the table of the super admin shows it.
 */
interface PlayerFlags {
  id: number;
  name: string;
  icon: string;
  isAdmin: boolean;
  /**
   * Whether it is `PRIVILEGED_PLAYER`, who can't be banned nor have the Felix rule.
   */
  privileged: boolean;
  banned: boolean;
  felixRule: boolean;
}

/**
 * Every player with its flags, by name.
 *
 * @returns The players.
 */
async function listPlayerFlags(): Promise<PlayerFlags[]> {
  const rows = await all<{ id: number; name: string; icon: string; isAdmin: number; privileged: number; banned: number; felixRule: number }>(
    'SELECT id, name, icon, is_admin AS isAdmin, name = ? AS privileged, banned, felix_rule AS felixRule FROM players ORDER BY name',
    PRIVILEGED_PLAYER
  );
  return rows.map(row => ({
    ...row,
    isAdmin: Boolean(row.isAdmin),
    privileged: Boolean(row.privileged),
    banned: Boolean(row.banned),
    felixRule: Boolean(row.felixRule)
  }));
}

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

// Every player with its flags, which the super admin changes one at a time ({ banned } or { felixRule }):
// - a banned player can't log in, is refused on any request, is taken out of the lobby and, if in the match to play,
//   the match is generated again without it;
// - a player with the Felix rule earns half the points when it wins and loses twice as many when it loses, in the
//   matches saved from now on: each match keeps the rule the player had, so the past ones never change.
// The super admin can't be banned; PRIVILEGED_PLAYER can't be banned nor have the Felix rule.
adminRouter.get('/players', async c => c.json({ players: await listPlayerFlags() }));

adminRouter.put('/players/:playerId', async c => {
  const playerId = Number(c.req.param('playerId'));
  const { banned, felixRule } = await readBody(c);
  const player = Number.isInteger(playerId)
    ? await get<{ name: string; isAdmin: number; privileged: number; banned: number; felixRule: number }>(
        'SELECT name, is_admin AS isAdmin, name = ? AS privileged, banned, felix_rule AS felixRule FROM players WHERE id = ?',
        PRIVILEGED_PLAYER,
        playerId
      )
    : undefined;
  if (!player) {
    return c.json({ error: 'Giocatore non trovato' }, 404);
  }

  if ((banned !== undefined && typeof banned !== 'boolean') || (felixRule !== undefined && typeof felixRule !== 'boolean') || (banned === undefined) === (felixRule === undefined)) {
    return c.json({ error: 'Dati mancanti' }, 400);
  }

  if (banned !== undefined && banned !== Boolean(player.banned)) {
    if (banned && player.privileged) {
      return c.json({ error: `${player.name} non si può bannare` }, 400);
    }

    if (banned && player.isAdmin) {
      return c.json({ error: "L'amministratore non si può bannare" }, 400);
    }

    await run('UPDATE players SET banned = ? WHERE id = ?', banned ? 1 : 0, playerId);
    if (banned) {
      await removeBannedPlayer(playerId, c.get('user').id);
    }
  }

  if (felixRule !== undefined && felixRule !== Boolean(player.felixRule)) {
    if (felixRule && player.privileged) {
      return c.json({ error: `${player.name} non può avere la regola Felix` }, 400);
    }

    await run('UPDATE players SET felix_rule = ? WHERE id = ?', felixRule ? 1 : 0, playerId);
  }

  return c.json({ players: await listPlayerFlags() });
});

// The thresholds of the ranks, that give the border of the icon of the players: saved at once, no recomputation needed
adminRouter.get('/ranks', async c => c.json({ ranks: await listRanks(), limits: RANK_LIMITS }));

adminRouter.put('/ranks', async c => {
  const ranks = await saveRanks(await readBody(c));
  return typeof ranks === 'string' ? c.json({ error: ranks }, 400) : c.json({ ranks, limits: RANK_LIMITS });
});

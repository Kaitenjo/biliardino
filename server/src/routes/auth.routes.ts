import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { createSession, deleteSession, findUserByName, readToken, requireAuth } from '../auth/auth.ts';
import type { AppEnv } from '../auth/auth.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { get, run } from '../db/db.ts';
import type { AuthUser } from '../models.ts';
import { readBody } from './read-body.ts';

/**
 * Minimum length of a new password.
 */
const MIN_PASSWORD_LENGTH = 4;

/**
 * The time zone of the day in which the roles can be changed once.
 */
const TIME_ZONE = 'Europe/Rome';

/**
 * Login, logout, current user, password change and the roles the user plays.
 */
export const authRouter = new Hono<AppEnv>();

authRouter.post('/login', async c => {
  const { name, password } = await readBody(c);
  // Checked before the password, which costs CPU (scrypt). Every attempt counts, also the right ones
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const account = typeof name === 'string' ? name.trim().toLowerCase() : '';
  const [byIp, byAccount] = await Promise.all([env.LOGIN_IP_LIMIT.limit({ key: ip }), env.LOGIN_ACCOUNT_LIMIT.limit({ key: account })]);
  if (!byIp.success || !byAccount.success) {
    return c.json({ error: 'Troppi tentativi di accesso: riprova tra un minuto' }, 429);
  }

  const found = typeof name === 'string' ? await findUserByName(name.trim()) : undefined;
  if (!found || typeof password !== 'string' || !verifyPassword(password, found.passwordHash)) {
    return c.json({ error: 'Nome o password errati' }, 401);
  }

  const user: AuthUser = { id: found.id, playerId: found.playerId, name: found.name, icon: found.icon, isAdmin: found.isAdmin };
  return c.json({ token: await createSession(user.id), user });
});

authRouter.post('/logout', async c => {
  const token = readToken(c.req.header('Authorization'));
  if (token) {
    await deleteSession(token);
  }

  return c.body(null, 204);
});

authRouter.get('/me', requireAuth, c => c.json(c.get('user')));

authRouter.put('/password', requireAuth, async c => {
  const user = c.get('user');
  const { currentPassword, newPassword } = await readBody(c);
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return c.json({ error: 'Dati mancanti' }, 400);
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `La nuova password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri` }, 400);
  }

  const stored = await get<{ passwordHash: string }>('SELECT password_hash AS passwordHash FROM users WHERE id = ?', user.id);
  if (!stored || !verifyPassword(currentPassword, stored.passwordHash)) {
    return c.json({ error: 'La password attuale non è corretta' }, 400);
  }

  await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), user.id);
  return c.body(null, 204);
});

/**
 * Today in Italy: D1 knows only UTC.
 *
 * @returns The date, `YYYY-MM-DD`.
 */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

/**
 * The roles of a player and whether they can be changed today: they can, once a day.
 *
 * @param playerId - The id of the player.
 * @returns The roles, `locked` when they were already changed today.
 */
async function readRoles(playerId: number): Promise<{ attack: boolean; defense: boolean; locked: boolean }> {
  const row = await get<{ attack: number; defense: number; locked: number }>(
    'SELECT plays_attack AS attack, plays_defense AS defense, COALESCE(roles_changed_on = ?, 0) AS locked FROM players WHERE id = ?',
    today(),
    playerId
  );
  return { attack: Boolean(row?.attack), defense: Boolean(row?.defense), locked: Boolean(row?.locked) };
}

authRouter.get('/roles', requireAuth, async c => c.json(await readRoles(c.get('user').playerId)));

authRouter.put('/roles', requireAuth, async c => {
  const user = c.get('user');
  const { attack, defense } = await readBody(c);
  if (typeof attack !== 'boolean' || typeof defense !== 'boolean') {
    return c.json({ error: 'Dati mancanti' }, 400);
  }

  if (!attack && !defense) {
    return c.json({ error: 'Scegli almeno un ruolo' }, 400);
  }

  const current = await readRoles(user.playerId);
  if (attack === current.attack && defense === current.defense) {
    return c.json(current);
  }

  if (current.locked) {
    return c.json({ error: 'Hai già cambiato ruolo oggi: potrai farlo di nuovo domani' }, 429);
  }

  await run('UPDATE players SET plays_attack = ?, plays_defense = ?, roles_changed_on = ? WHERE id = ?', attack ? 1 : 0, defense ? 1 : 0, today(), user.playerId);
  return c.json(await readRoles(user.playerId));
});

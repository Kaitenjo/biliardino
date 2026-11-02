import { randomBytes } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { get, run } from '../db/db.ts';
import type { AuthUser } from '../models.ts';

/**
 * The variables of a request: the logged user, set by `requireAuth`.
 */
export interface AppEnv {
  Variables: {
    user: AuthUser;
  };
}

/**
 * Opens a session for a user.
 *
 * @param userId - The id of the user.
 * @returns The token of the session.
 */
export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', token, userId);
  return token;
}

/**
 * Closes a session.
 *
 * @param token - The token of the session.
 */
export async function deleteSession(token: string): Promise<void> {
  await run('DELETE FROM sessions WHERE token = ?', token);
}

/**
 * Reads the bearer token of a request.
 *
 * @param header - The `Authorization` header of the request.
 * @returns The token, `undefined` when the request has none.
 */
export function readToken(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/**
 * Finds a user by name, with its password hash.
 *
 * @param name - The name of its player, case insensitive.
 * @returns The user, `undefined` when no player has that name.
 */
export async function findUserByName(name: string): Promise<(AuthUser & { passwordHash: string; banned: boolean }) | undefined> {
  const user = await get<AuthUser & { passwordHash: string; banned: number }>(
    `SELECT u.id, u.player_id AS playerId, p.name, p.icon, p.is_admin AS isAdmin, p.banned, u.password_hash AS passwordHash
     FROM users u JOIN players p ON p.id = u.player_id
     WHERE p.name = ?`,
    name
  );
  return user && { ...user, isAdmin: Boolean(user.isAdmin), banned: Boolean(user.banned) };
}

/**
 * Finds the user of a session.
 *
 * @param token - The token of the session.
 * @returns The user, `undefined` when the token is unknown.
 */
async function findUserByToken(token: string): Promise<(AuthUser & { banned: boolean }) | undefined> {
  const user = await get<AuthUser & { banned: number }>(
    `SELECT u.id, u.player_id AS playerId, p.name, p.icon, p.is_admin AS isAdmin, p.banned
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN players p ON p.id = u.player_id
     WHERE s.token = ?`,
    token
  );
  return user && { ...user, isAdmin: Boolean(user.isAdmin), banned: Boolean(user.banned) };
}

/**
 * Middleware letting through only the super admin. It must come after `requireAuth`.
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user').isAdmin) {
    return c.json({ error: "Riservato all'amministratore" }, 403);
  }

  await next();
});

/**
 * Error answered to a banned player, who the client logs out.
 */
export const BANNED_ERROR = 'Sei stato bannato';

/**
 * Middleware letting through only logged requests, with their user in the `user` variable. A banned player is refused
 * also with a session opened before the ban.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readToken(c.req.header('Authorization'));
  const found = token ? await findUserByToken(token) : undefined;
  if (!found) {
    return c.json({ error: 'Login richiesto' }, 401);
  }

  const { banned, ...user } = found;
  if (banned) {
    return c.json({ error: BANNED_ERROR, banned: true }, 403);
  }

  c.set('user', user);
  await next();
});

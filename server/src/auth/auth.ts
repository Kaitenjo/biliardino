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
export async function findUserByName(name: string): Promise<(AuthUser & { passwordHash: string }) | undefined> {
  const user = await get<AuthUser & { passwordHash: string }>(
    `SELECT u.id, u.player_id AS playerId, p.name, p.icon, p.is_admin AS isAdmin, u.password_hash AS passwordHash
     FROM users u JOIN players p ON p.id = u.player_id
     WHERE p.name = ?`,
    name
  );
  return user && { ...user, isAdmin: Boolean(user.isAdmin) };
}

/**
 * Finds the user of a session.
 *
 * @param token - The token of the session.
 * @returns The user, `undefined` when the token is unknown.
 */
async function findUserByToken(token: string): Promise<AuthUser | undefined> {
  const user = await get<AuthUser>(
    `SELECT u.id, u.player_id AS playerId, p.name, p.icon, p.is_admin AS isAdmin
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN players p ON p.id = u.player_id
     WHERE s.token = ?`,
    token
  );
  return user && { ...user, isAdmin: Boolean(user.isAdmin) };
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
 * Middleware letting through only logged requests, with their user in the `user` variable.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = readToken(c.req.header('Authorization'));
  const user = token ? await findUserByToken(token) : undefined;
  if (!user) {
    return c.json({ error: 'Login richiesto' }, 401);
  }

  c.set('user', user);
  await next();
});

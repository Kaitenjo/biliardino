import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { get, run } from '../db/db.ts';
import type { AuthUser } from '../models.ts';

/**
 * Hashes a password with scrypt and a random salt.
 *
 * @param password - The password.
 * @returns `scrypt$<salt>$<hash>`, both hex.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

/**
 * Checks a password against a hash made by `hashPassword`.
 *
 * @param password - The password.
 * @param stored - The stored hash.
 * @returns Whether the password matches.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(password, salt, expected.length), expected);
}

/**
 * Opens a session for a user.
 *
 * @param userId - The id of the user.
 * @returns The token of the session.
 */
export function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', token, userId);
  return token;
}

/**
 * Closes a session.
 *
 * @param token - The token of the session.
 */
export function deleteSession(token: string): void {
  run('DELETE FROM sessions WHERE token = ?', token);
}

/**
 * Reads the bearer token of a request.
 *
 * @param req - The request.
 * @returns The token, `undefined` when the request has none.
 */
export function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/**
 * Finds a user by name, with its password hash.
 *
 * @param name - The name of its player, case insensitive.
 * @returns The user, `undefined` when no player has that name.
 */
export function findUserByName(name: string): (AuthUser & { passwordHash: string }) | undefined {
  const user = get<AuthUser & { passwordHash: string }>(
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
function findUserByToken(token: string): AuthUser | undefined {
  const user = get<AuthUser>(
    `SELECT u.id, u.player_id AS playerId, p.name, p.icon, p.is_admin AS isAdmin
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN players p ON p.id = u.player_id
     WHERE s.token = ?`,
    token
  );
  return user && { ...user, isAdmin: Boolean(user.isAdmin) };
}

/**
 * Middleware letting through only the super admin. It must come after `requireAuth`.
 *
 * @param _req - The request.
 * @param res - The response.
 * @param next - Passes to the next handler.
 */
export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if ((res.locals['user'] as AuthUser | undefined)?.isAdmin) {
    next();
  } else {
    res.status(403).json({ error: "Riservato all'amministratore" });
  }
}

/**
 * Middleware letting through only logged requests, with their user in `res.locals.user`.
 *
 * @param req - The request.
 * @param res - The response.
 * @param next - Passes to the next handler.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readToken(req);
  const user = token ? findUserByToken(token) : undefined;
  if (user) {
    res.locals['user'] = user;
    next();
  } else {
    res.status(401).json({ error: 'Login richiesto' });
  }
}

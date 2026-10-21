import { Router } from 'express';
import { createSession, deleteSession, findUserByName, hashPassword, readToken, requireAuth, verifyPassword } from '../auth/auth.ts';
import { get, run } from '../db/db.ts';
import type { AuthUser } from '../models.ts';

/**
 * Minimum length of a new password.
 */
const MIN_PASSWORD_LENGTH = 4;

/**
 * Login, logout, current user, password change and the roles the user plays.
 */
export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { name, password } = req.body ?? {};
  const found = typeof name === 'string' && typeof password === 'string' ? findUserByName(name.trim()) : undefined;
  if (!found || !verifyPassword(password, found.passwordHash)) {
    res.status(401).json({ error: 'Nome o password errati' });
    return;
  }

  const user: AuthUser = { id: found.id, playerId: found.playerId, name: found.name, icon: found.icon, isAdmin: found.isAdmin };
  res.json({ token: createSession(user.id), user });
});

authRouter.post('/logout', (req, res) => {
  const token = readToken(req);
  if (token) {
    deleteSession(token);
  }

  res.status(204).end();
});

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json(res.locals['user']);
});

authRouter.put('/password', requireAuth, (req, res) => {
  const user = res.locals['user'] as AuthUser;
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'Dati mancanti' });
    return;
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `La nuova password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri` });
    return;
  }

  const stored = get<{ passwordHash: string }>('SELECT password_hash AS passwordHash FROM users WHERE id = ?', user.id);
  if (!stored || !verifyPassword(currentPassword, stored.passwordHash)) {
    res.status(400).json({ error: 'La password attuale non è corretta' });
    return;
  }

  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), user.id);
  res.status(204).end();
});

/**
 * The roles of a player and whether they can be changed today: they can, once a day.
 *
 * @param playerId - The id of the player.
 * @returns The roles, `locked` when they were already changed today.
 */
function readRoles(playerId: number): { attack: boolean; defense: boolean; locked: boolean } {
  const row = get<{ attack: number; defense: number; locked: number }>(
    `SELECT plays_attack AS attack, plays_defense AS defense, COALESCE(roles_changed_on = date('now', 'localtime'), 0) AS locked
     FROM players WHERE id = ?`,
    playerId
  );
  return { attack: Boolean(row?.attack), defense: Boolean(row?.defense), locked: Boolean(row?.locked) };
}

authRouter.get('/roles', requireAuth, (_req, res) => {
  res.json(readRoles((res.locals['user'] as AuthUser).playerId));
});

authRouter.put('/roles', requireAuth, (req, res) => {
  const user = res.locals['user'] as AuthUser;
  const { attack, defense } = req.body ?? {};
  if (typeof attack !== 'boolean' || typeof defense !== 'boolean') {
    res.status(400).json({ error: 'Dati mancanti' });
    return;
  }

  if (!attack && !defense) {
    res.status(400).json({ error: 'Scegli almeno un ruolo' });
    return;
  }

  const current = readRoles(user.playerId);
  if (attack === current.attack && defense === current.defense) {
    res.json(current);
    return;
  }

  if (current.locked) {
    res.status(429).json({ error: 'Hai già cambiato ruolo oggi: potrai farlo di nuovo domani' });
    return;
  }

  run("UPDATE players SET plays_attack = ?, plays_defense = ?, roles_changed_on = date('now', 'localtime') WHERE id = ?", attack ? 1 : 0, defense ? 1 : 0, user.playerId);
  res.json(readRoles(user.playerId));
});

import { Router } from 'express';
import { requireAdmin, requireAuth } from '../auth/auth.ts';
import { all, get, run } from '../db/db.ts';

/**
 * The pages of the super admin, who can change the roles of any player without the limit of once a day. The change
 * doesn't use up the day of the player either.
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/roles', (_req, res) => {
  res.json(
    all<{ id: number; name: string; icon: string; attack: number; defense: number }>(
      'SELECT id, name, icon, plays_attack AS attack, plays_defense AS defense FROM players ORDER BY name'
    ).map(player => ({ id: player.id, name: player.name, icon: player.icon, attack: Boolean(player.attack), defense: Boolean(player.defense) }))
  );
});

adminRouter.put('/roles/:playerId', (req, res) => {
  const playerId = Number(req.params.playerId);
  const { attack, defense } = req.body ?? {};
  if (!Number.isInteger(playerId) || !get('SELECT 1 FROM players WHERE id = ?', playerId)) {
    res.status(404).json({ error: 'Giocatore non trovato' });
    return;
  }

  if (typeof attack !== 'boolean' || typeof defense !== 'boolean') {
    res.status(400).json({ error: 'Dati mancanti' });
    return;
  }

  if (!attack && !defense) {
    res.status(400).json({ error: 'Serve almeno un ruolo' });
    return;
  }

  run('UPDATE players SET plays_attack = ?, plays_defense = ? WHERE id = ?', attack ? 1 : 0, defense ? 1 : 0, playerId);
  res.json({ id: playerId, attack, defense });
});

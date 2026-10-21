import { Router } from 'express';
import { requireAuth } from '../auth/auth.ts';
import { db, get, transaction } from '../db/db.ts';

/**
 * The days of the week each player is usually available. They are read with the leaderboard (`weekdays`).
 */
export const availabilityRouter = Router();

availabilityRouter.put('/:playerId', requireAuth, (req, res) => {
  const playerId = Number(req.params.playerId);
  const weekdays: unknown = req.body?.weekdays;
  if (!Number.isInteger(playerId) || !get('SELECT 1 FROM players WHERE id = ?', playerId)) {
    res.status(404).json({ error: 'Giocatore non trovato' });
    return;
  }

  if (!Array.isArray(weekdays) || !weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6)) {
    res.status(400).json({ error: 'I giorni vanno da 0 (domenica) a 6 (sabato)' });
    return;
  }

  const days = [...new Set(weekdays as number[])].sort();
  transaction(() => {
    db.prepare('DELETE FROM player_availability WHERE player_id = ?').run(playerId);
    const insert = db.prepare('INSERT INTO player_availability (player_id, weekday) VALUES (?, ?)');
    for (let i = 0; i < days.length; i++) {
      insert.run(playerId, days[i]!);
    }
  });

  res.json({ playerId, weekdays: days });
});

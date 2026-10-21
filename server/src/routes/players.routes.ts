import { Router } from 'express';
import { findPlayerDetail, listLeaderboard } from '../players/players.repository.ts';

/**
 * Leaderboard and players.
 */
export const playersRouter = Router();

playersRouter.get('/', (_req, res) => {
  res.json(listLeaderboard());
});

// The leaderboard: only the players with at least one match (in the role), ranked by the best of their two ELOs or
// by the ELO of a role (?by=attack|defense). Before `/:id`, so that it doesn't read "ranking" as an id
playersRouter.get('/ranking', (req, res) => {
  const by = req.query['by'];
  res.json(listLeaderboard(by === 'attack' || by === 'defense' ? by : 'best', true));
});

playersRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const detail = Number.isInteger(id) ? findPlayerDetail(id) : undefined;
  if (!detail) {
    res.status(404).json({ error: 'Giocatore non trovato' });
    return;
  }

  res.json(detail);
});

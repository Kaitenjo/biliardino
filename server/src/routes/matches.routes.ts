import { Router } from 'express';
import { requireAuth } from '../auth/auth.ts';
import { all, run, transaction } from '../db/db.ts';
import { recomputeRatings } from '../elo/ratings.ts';
import { clearRunningMatch, getRunningMatch, setRunningMatch } from '../matches/running-match.ts';
import type { MatchView } from '../matches/running-match.ts';
import { loadMatchmakingContext } from '../matchmaking/matchmaking.context.ts';
import { findBestMatch } from '../matchmaking/matchmaking.ts';
import type { AuthUser, Lineup, Team } from '../models.ts';

/**
 * Goals that win a match: it ends when a team scores them, so one team has exactly this and the other fewer.
 */
const WINNING_SCORE = 8;

/**
 * The match to play (only one at a time) and the saving of the results.
 */
export const matchesRouter = Router();

matchesRouter.get('/running', (_req, res) => {
  res.json(getRunningMatch());
});

matchesRouter.post('/generate', requireAuth, (req, res) => {
  const { playerIds, priorityIds } = req.body ?? {};
  if (!isIdList(playerIds) || new Set(playerIds).size !== playerIds.length || playerIds.length < 4) {
    res.status(400).json({ error: 'Seleziona almeno 4 giocatori diversi' });
    return;
  }

  const priority = priorityIds === undefined ? [] : priorityIds;
  if (!isIdList(priority) || priority.length > 4 || !priority.every(id => playerIds.includes(id))) {
    res.status(400).json({ error: 'I giocatori con priorità devono essere al massimo 4, tra quelli selezionati' });
    return;
  }

  // One match at a time: a page that doesn't show it (somebody generated it in the meantime) learns it from this answer
  const running = getRunningMatch();
  if (running) {
    res.status(409).json(alreadyGenerated(running));
    return;
  }

  const context = loadMatchmakingContext();
  if (!playerIds.every(id => context.players.has(id))) {
    res.status(400).json({ error: 'Giocatore non trovato' });
    return;
  }

  const proposal = findBestMatch(context, playerIds, priority);
  if (!proposal) {
    res.status(422).json({ error: 'Nessuna partita possibile con questi giocatori: i ruoli richiesti non tornano' });
    return;
  }

  const user = res.locals['user'] as AuthUser;
  const generated = setRunningMatch(
    { attack: proposal.red.attack.id, defense: proposal.red.defense.id },
    { attack: proposal.blue.attack.id, defense: proposal.blue.defense.id },
    user.id
  );
  if (generated) {
    res.json(generated);
    return;
  }

  // Two users generated at the same time: the one that was stored first stays
  const winner = getRunningMatch();
  res.status(409).json(winner ? alreadyGenerated(winner) : { error: 'Riprova' });
});

matchesRouter.delete('/running', requireAuth, (_req, res) => {
  clearRunningMatch();
  res.status(204).end();
});

matchesRouter.post('/', requireAuth, (req, res) => {
  const { red, blue, redScore, blueScore } = req.body ?? {};
  if (!isLineup(red) || !isLineup(blue) || new Set([red.attack, red.defense, blue.attack, blue.defense]).size !== 4) {
    res.status(400).json({ error: 'Formazioni non valide' });
    return;
  }

  if (!isScore(redScore) || !isScore(blueScore) || Math.max(redScore, blueScore) !== WINNING_SCORE || redScore === blueScore) {
    res.status(400).json({ error: `Si vince a ${WINNING_SCORE}: una squadra deve fare ${WINNING_SCORE} e l'altra meno (ad esempio 8-5)` });
    return;
  }

  const ids = [red.attack, red.defense, blue.attack, blue.defense];
  const found = all<{ id: number }>(`SELECT id FROM players WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids);
  if (found.length !== 4) {
    res.status(400).json({ error: 'Giocatore non trovato' });
    return;
  }

  const user = res.locals['user'] as AuthUser;

  // The ELO columns are filled by the recomputation, which replays every match in order
  const matchId = transaction(() => {
    const { lastInsertRowid } = run(
      'INSERT INTO matches (red_score, blue_score, winner, created_by) VALUES (?, ?, ?, ?)',
      redScore,
      blueScore,
      redScore > blueScore ? 'red' : 'blue',
      user.id
    );
    for (const team of ['red', 'blue'] as const) {
      for (const role of ['attack', 'defense'] as const) {
        // Explicit zeros: databases created by the first schema have these columns without a default
        run(
          'INSERT INTO match_players (match_id, player_id, team, role, elo_before, role_elo, elo_delta) VALUES (?, ?, ?, ?, 0, 0, 0)',
          lastInsertRowid,
          (team === 'red' ? red : blue)[role],
          team,
          role
        );
      }
    }

    clearRunningMatch();
    recomputeRatings();
    return Number(lastInsertRowid);
  });

  const deltas = all<{ team: Team; delta: number }>(
    'SELECT team, CAST(ROUND(MAX(elo_delta)) AS INTEGER) AS delta FROM match_players WHERE match_id = ? GROUP BY team',
    matchId
  );
  res.status(201).json({
    id: matchId,
    redDelta: deltas.find(row => row.team === 'red')?.delta ?? 0,
    blueDelta: deltas.find(row => row.team === 'blue')?.delta ?? 0
  });
});

/**
 * The answer for a request that needs no match to play, when there is one.
 *
 * @param running - The match to play.
 * @returns The message and the match, so that the page shows it.
 */
function alreadyGenerated(running: MatchView): { error: string; running: MatchView } {
  return {
    error: `Risulta già una partita generata${running.generatedBy ? ` da ${running.generatedBy}` : ''}: salvala o eliminala prima di generarne un'altra`,
    running
  };
}

/**
 * Checks a list of ids sent by the client.
 *
 * @param value - The value sent.
 * @returns Whether it is an array of integers.
 */
function isIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isInteger);
}

/**
 * Checks the lineup of a team sent by the client.
 *
 * @param value - The value sent.
 * @returns Whether it holds the ids of the two players.
 */
function isLineup(value: unknown): value is Lineup<number> {
  const lineup = value as Partial<Lineup<unknown>> | null;
  return typeof lineup === 'object' && lineup !== null && Number.isInteger(lineup.attack) && Number.isInteger(lineup.defense);
}

/**
 * Checks a score sent by the client.
 *
 * @param value - The value sent.
 * @returns Whether it is a valid score.
 */
function isScore(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= WINNING_SCORE;
}

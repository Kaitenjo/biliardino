import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { SEED_PASSWORD, seedDatabase } from './db/seed.ts';
import { recomputeRatings } from './elo/ratings.ts';
import { adminRouter } from './routes/admin.routes.ts';
import { authRouter } from './routes/auth.routes.ts';
import { availabilityRouter } from './routes/availability.routes.ts';
import { matchesRouter } from './routes/matches.routes.ts';
import { playersRouter } from './routes/players.routes.ts';

/**
 * Port of the server: `PORT`, or 3000.
 */
const PORT = Number(process.env['PORT'] ?? 3000);

/**
 * The build of the client, served when present.
 */
const CLIENT_DIST = resolve(import.meta.dirname, '../../client/dist');

// A new or emptied database (the file was deleted) gets the players of the previous project, so that there is
// somebody to log in as
const seeded = seedDatabase();
if (seeded) {
  console.log(`Database vuoto: importati ${seeded.players} giocatori (password "${SEED_PASSWORD}") e ${seeded.availability} disponibilità.`);
}

// The database may have been edited by hand (players, initial ELOs, matches): every ELO is rebuilt from the matches
recomputeRatings();

const app = express();

app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/players', playersRouter);
app.use('/api/matches', matchesRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Risorsa non trovata' });
});

if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
}

app.use((error: { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // Errors of the body parser (malformed JSON, …) carry their own 4xx status
  if (error.status && error.status < 500) {
    res.status(error.status).json({ error: 'Richiesta non valida' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'Errore del server' });
});

app.listen(PORT, () => {
  console.log(`Biliardino server su http://localhost:${PORT}`);
});

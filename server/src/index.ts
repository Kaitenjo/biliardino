import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { adminRouter } from './routes/admin.routes.ts';
import { authRouter } from './routes/auth.routes.ts';
import { availabilityRouter } from './routes/availability.routes.ts';
import { matchesRouter } from './routes/matches.routes.ts';
import { playersRouter } from './routes/players.routes.ts';

/**
 * The API. The build of the client is served by the static assets of the worker (wrangler.jsonc), before reaching it.
 */
const app = new Hono();

app.route('/api/auth', authRouter);
app.route('/api/admin', adminRouter);
app.route('/api/availability', availabilityRouter);
app.route('/api/players', playersRouter);
app.route('/api/matches', matchesRouter);
app.all('/api/*', c => c.json({ error: 'Risorsa non trovata' }, 404));

app.onError((error, c) => {
  // Errors of the request (malformed JSON, …) carry their own 4xx status
  if (error instanceof HTTPException && error.status < 500) {
    return c.json({ error: 'Richiesta non valida' }, error.status);
  }

  console.error(error);
  return c.json({ error: 'Errore del server' }, 500);
});

export default app;

-- Lobby: dal lunedì al venerdì (festività escluse) se ne apre una alle 10:30, 12:30, 15:30 e 17:30 (ora italiana); 30
-- minuti dopo il matchmaking genera la partita con chi è entrato, e la lobby si chiude 30 minuti dopo la partita (quella
-- delle 17:30 alle 20:00). Le apre e le chiude lo scheduler (cron del worker): day è la data italiana, slot l'ora di
-- apertura ('10:30'); matched = la partita automatica è già stata tentata, closed = la lobby è chiusa.
CREATE TABLE lobbies (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day     TEXT    NOT NULL,
  slot    TEXT    NOT NULL,
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0, 1)),
  closed  INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
  UNIQUE (day, slot)
);

-- Chi è in lobby: entra ed esce quando vuole finché è aperta.
CREATE TABLE lobby_players (
  lobby_id  INTEGER NOT NULL REFERENCES lobbies (id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lobby_id, player_id)
);

-- I browser in cui un utente ha attivato le notifiche push (Web Push): uno per dispositivo, tolto al logout o quando il
-- servizio push risponde che non esiste più.
CREATE TABLE push_subscriptions (
  endpoint   TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

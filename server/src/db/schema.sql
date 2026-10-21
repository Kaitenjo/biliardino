-- Giocatori: nome, icona (URL di un'immagine o emoji; vuota = sagoma), ELO iniziale e ruoli che gioca
-- (attacco, difesa o entrambi: il matchmaking lo propone solo in quei ruoli; li sceglie l'utente dal profilo, al massimo
-- una volta al giorno: roles_changed_on è la data, locale al server, dell'ultimo cambio).
-- Ogni giocatore ha due ELO, uno per ruolo, entrambi partono da start_elo: elo_attack ed elo_defense sono ricalcolati
-- dalle partite a ogni avvio e a ogni partita salvata, non vanno modificati a mano.
-- Partite giocate, vittorie e sconfitte si ricavano da match_players.
CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  icon          TEXT    NOT NULL DEFAULT '',
  start_elo     REAL    NOT NULL DEFAULT 1000,
  plays_attack  INTEGER NOT NULL DEFAULT 1 CHECK (plays_attack IN (0, 1)),
  plays_defense INTEGER NOT NULL DEFAULT 1 CHECK (plays_defense IN (0, 1)),
  roles_changed_on TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)), -- al massimo un super admin (indice in db.ts)
  elo_attack    REAL    NOT NULL DEFAULT 1000,
  elo_defense   REAL    NOT NULL DEFAULT 1000,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Giorni della settimana in cui un giocatore è di solito in ufficio (0 = domenica … 6 = sabato):
-- nella pagina Gioca i disponibili di oggi sono già selezionati.
CREATE TABLE IF NOT EXISTS player_availability (
  player_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  weekday   INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  PRIMARY KEY (player_id, weekday)
);

-- La partita generata dal matchmaking e non ancora giocata: una sola alla volta (la riga è unica per vincolo), visibile a
-- tutti come "in corso" finché si salva il risultato o la si elimina.
CREATE TABLE IF NOT EXISTS running_match (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  red_attack   INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  red_defense  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  blue_attack  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  blue_defense INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  created_by   INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  only_one     INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (only_one = 1)
);

-- Utenti: uno per giocatore, di cui riusano nome e icona. Solo la password è propria.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL UNIQUE REFERENCES players (id) ON DELETE CASCADE,
  password_hash TEXT    NOT NULL
);

-- Sessioni di login: un token casuale per dispositivo, cancellato al logout.
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Partite concluse. red_expected (probabilità di vittoria dei rossi) è calcolata con l'ELO.
CREATE TABLE IF NOT EXISTS matches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  red_score    INTEGER NOT NULL CHECK (red_score >= 0),
  blue_score   INTEGER NOT NULL CHECK (blue_score >= 0),
  winner       TEXT    NOT NULL CHECK (winner IN ('red', 'blue')),
  red_expected REAL    NOT NULL DEFAULT 0.5,
  created_by   INTEGER REFERENCES users (id) ON DELETE SET NULL,
  played_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (red_score <> blue_score)
);

-- I 4 giocatori di una partita: squadra, ruolo e, calcolati con l'ELO, l'ELO prima della partita,
-- quello nel ruolo (con il malus) e la variazione.
CREATE TABLE IF NOT EXISTS match_players (
  match_id   INTEGER NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  team       TEXT    NOT NULL CHECK (team IN ('red', 'blue')),
  role       TEXT    NOT NULL CHECK (role IN ('attack', 'defense')),
  elo_before REAL    NOT NULL DEFAULT 0,
  role_elo   REAL    NOT NULL DEFAULT 0,
  elo_delta  REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  UNIQUE (match_id, team, role)
);

CREATE INDEX IF NOT EXISTS match_players_player ON match_players (player_id);

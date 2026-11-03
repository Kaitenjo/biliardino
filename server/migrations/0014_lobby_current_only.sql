-- Della lobby si tiene solo quella corrente: alla chiusura la riga di lobbies viene cancellata (e con lei chi c'era, per
-- ON DELETE CASCADE), quindi la colonna closed non serve più. Si toglie lo storico delle lobby già chiuse e si
-- ricostruiscono le tabelle senza closed (il CHECK impedisce il DROP COLUMN); lobby_players si copia prima di togliere
-- lobbies, per non perdere chi è in quella aperta.
PRAGMA defer_foreign_keys = true;

DELETE FROM lobbies WHERE closed = 1;

CREATE TABLE lobbies_new (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day     TEXT    NOT NULL,
  slot    TEXT    NOT NULL,
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0, 1)),
  UNIQUE (day, slot)
);

CREATE TABLE lobby_players_new (
  lobby_id  INTEGER NOT NULL REFERENCES lobbies_new (id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
  priority  INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1)),
  PRIMARY KEY (lobby_id, player_id)
);

INSERT INTO lobbies_new (id, day, slot, matched) SELECT id, day, slot, matched FROM lobbies;
INSERT INTO lobby_players_new (lobby_id, player_id, joined_at, priority) SELECT lobby_id, player_id, joined_at, priority FROM lobby_players;

DROP TABLE lobby_players;
DROP TABLE lobbies;

ALTER TABLE lobbies_new RENAME TO lobbies;
ALTER TABLE lobby_players_new RENAME TO lobby_players;

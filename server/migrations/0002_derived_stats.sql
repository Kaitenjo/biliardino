-- Statistiche dei giocatori, derivate dalle partite come gli ELO: le pagine le leggono da qui invece di rileggere tutte le
-- partite a ogni richiesta. scope 'all' conta tutte le partite, 'attack' e 'defense' solo quelle nel ruolo; form sono le
-- ultime 5 (JSON, dalla più vecchia: [{"won": true, "delta": 12}, …]). Aggiornate a ogni partita salvata e ricostruite da
-- "Ricalcola" nella pagina admin: non vanno modificate a mano.
CREATE TABLE player_stats (
  player_id     INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  scope         TEXT    NOT NULL CHECK (scope IN ('all', 'attack', 'defense')),
  matches       INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  goals_for     INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  form          TEXT    NOT NULL DEFAULT '[]',
  PRIMARY KEY (player_id, scope)
);

-- Quante volte due giocatori hanno giocato insieme o contro, per la diversità del matchmaking. Una riga per coppia, con
-- l'id minore in player_id. Derivata come player_stats.
CREATE TABLE player_pairs (
  player_id INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  other_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  together  INTEGER NOT NULL DEFAULT 0,
  against   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, other_id),
  CHECK (player_id < other_id)
);

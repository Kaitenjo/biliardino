-- Le squadre si chiamano come gli omini del biliardino: marroni (prima rossi) e bianchi (prima blu). Rinomina le colonne e
-- converte i valori 'red' / 'blue' in 'brown' / 'white'.
--
-- I valori stanno in dei CHECK, che SQLite non sa modificare: matches e match_players vanno ricostruite. match_players
-- dipende da matches con ON DELETE CASCADE, e cancellare matches con le righe di match_players ancora collegate le
-- cancellerebbe: prima si creano e riempiono le tabelle nuove, poi si cancella la figlia, poi la madre, poi si rinominano.

PRAGMA defer_foreign_keys = true;

CREATE TABLE matches_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  brown_score    INTEGER NOT NULL CHECK (brown_score >= 0),
  white_score    INTEGER NOT NULL CHECK (white_score >= 0),
  winner         TEXT    NOT NULL CHECK (winner IN ('brown', 'white')),
  -- Probabilità di vittoria dei marroni, calcolata con l'ELO
  brown_expected REAL    NOT NULL DEFAULT 0.5,
  created_by     INTEGER REFERENCES users (id) ON DELETE SET NULL,
  played_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (brown_score <> white_score)
);

INSERT INTO matches_new (id, brown_score, white_score, winner, brown_expected, created_by, played_at)
SELECT id, red_score, blue_score, CASE winner WHEN 'red' THEN 'brown' ELSE 'white' END, red_expected, created_by, played_at
FROM matches;

CREATE TABLE match_players_new (
  match_id   INTEGER NOT NULL REFERENCES matches_new (id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  team       TEXT    NOT NULL CHECK (team IN ('brown', 'white')),
  role       TEXT    NOT NULL CHECK (role IN ('attack', 'defense')),
  elo_before REAL    NOT NULL DEFAULT 0,
  role_elo   REAL    NOT NULL DEFAULT 0,
  elo_delta  REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  UNIQUE (match_id, team, role)
);

INSERT INTO match_players_new (match_id, player_id, team, role, elo_before, role_elo, elo_delta)
SELECT match_id, player_id, CASE team WHEN 'red' THEN 'brown' ELSE 'white' END, role, elo_before, role_elo, elo_delta
FROM match_players;

-- Gli id delle partite continuano da dove erano arrivati, anche se le ultime fossero state cancellate
UPDATE sqlite_sequence SET seq = (SELECT seq FROM sqlite_sequence WHERE name = 'matches') WHERE name = 'matches_new';

DROP TABLE match_players;
DROP TABLE matches;
-- Rinominando matches_new, il riferimento di match_players_new la segue
ALTER TABLE matches_new RENAME TO matches;
ALTER TABLE match_players_new RENAME TO match_players;
CREATE INDEX match_players_player ON match_players (player_id);

-- La partita da giocare: nessun valore da convertire, bastano i nomi delle colonne
ALTER TABLE running_match RENAME COLUMN red_attack TO brown_attack;
ALTER TABLE running_match RENAME COLUMN red_defense TO brown_defense;
ALTER TABLE running_match RENAME COLUMN blue_attack TO white_attack;
ALTER TABLE running_match RENAME COLUMN blue_defense TO white_defense;

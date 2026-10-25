-- Le variabili del calcolo dell'ELO, modificabili dal super admin nella pagina ELO: una sola riga (id = 1). Sono usate sia
-- dal ricalcolo sia da ogni partita salvata, così i due danno lo stesso risultato. I valori iniziali sono quelli storici.
CREATE TABLE elo_settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  start_k           REAL NOT NULL DEFAULT 30,
  final_k           REAL NOT NULL DEFAULT 30,
  matches_k         REAL NOT NULL DEFAULT 10,
  scale             REAL NOT NULL DEFAULT 400,
  margin_goals      REAL NOT NULL DEFAULT 8,
  margin_weight     REAL NOT NULL DEFAULT 0.5,
  surprise_weight   REAL NOT NULL DEFAULT 3,
  surprise_exponent REAL NOT NULL DEFAULT 1.5
);

INSERT INTO elo_settings (id) VALUES (1);

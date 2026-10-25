-- Due limiti del calcolo dell'ELO, configurabili come gli altri nella pagina ELO: la probabilità minima di vittoria data a
-- una squadra (anche contro un grande favorito) e i punti minimi che guadagna chi vince.
ALTER TABLE elo_settings ADD COLUMN min_win_probability REAL NOT NULL DEFAULT 0.01;
ALTER TABLE elo_settings ADD COLUMN min_win_delta REAL NOT NULL DEFAULT 1;

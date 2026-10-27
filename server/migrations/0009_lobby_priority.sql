-- Chi è in lobby come obbligatorio: la prossima partita generata dalla lobby lo comprende per forza. Torna 0 appena una
-- partita lo comprende.
ALTER TABLE lobby_players ADD COLUMN priority INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1));

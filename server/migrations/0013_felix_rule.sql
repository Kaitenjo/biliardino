-- La regola Felix (prima regola Filippo): chi la ha guadagna la metà dei punti quando vince e ne perde il doppio quando
-- perde. Non è più un interruttore unico legato a Filippo Addabbo ma un flag di ogni giocatore, che il super admin attiva
-- dalla tabella dei giocatori nella pagina ELO. Vale solo per le partite salvate da quel momento: ogni partita ricorda se
-- il giocatore la aveva (match_players.felix_rule), così attivarla, disattivarla o ricalcolare non cambia quelle passate.
ALTER TABLE players ADD COLUMN felix_rule INTEGER NOT NULL DEFAULT 0 CHECK (felix_rule IN (0, 1));
ALTER TABLE match_players ADD COLUMN felix_rule INTEGER NOT NULL DEFAULT 0 CHECK (felix_rule IN (0, 1));

-- Filippo la tiene se era attiva, e le sue partite già giocate restano calcolate come finora
UPDATE players SET felix_rule = 1
WHERE lower(trim(name)) = 'filippo addabbo' AND COALESCE((SELECT filippo_rule FROM elo_settings WHERE id = 1), 1) = 1;

UPDATE match_players SET felix_rule = 1
WHERE player_id IN (SELECT id FROM players WHERE felix_rule = 1);

ALTER TABLE elo_settings DROP COLUMN filippo_rule;

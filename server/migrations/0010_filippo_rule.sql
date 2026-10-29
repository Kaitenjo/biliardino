-- Regola di Filippo Addabbo (vince guadagna la metà dei punti, perde ne perde il doppio): il super admin la attiva o
-- disattiva dalla pagina ELO. Attiva di default.
ALTER TABLE elo_settings ADD COLUMN filippo_rule INTEGER NOT NULL DEFAULT 1 CHECK (filippo_rule IN (0, 1));

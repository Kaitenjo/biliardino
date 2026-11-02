-- La banlist: un giocatore bannato non può fare login, ogni sua richiesta con una sessione aperta è rifiutata, non può
-- stare in una lobby e non entra nelle partite. Il super admin banna e riammette dalla pagina ELO.
ALTER TABLE players ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;

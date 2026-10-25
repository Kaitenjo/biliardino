-- Disponibilità: un giocatore è disponibile oggi se available_on è la data di oggi (ora italiana, YYYY-MM-DD), quindi si
-- azzera da sola a mezzanotte. Sostituisce i giorni della settimana di player_availability, che non è più usata (la tabella
-- resta, con i suoi dati, ma nessuna pagina la legge).
ALTER TABLE players ADD COLUMN available_on TEXT;

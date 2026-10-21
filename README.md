# CAlcio Balilla

Classifica e partite di biliardino tra colleghi: l'evoluzione di `biliardino-elo` (Firebase) in un client/server.

- `client/`: Xaendar (web components + signals), Vite
- `server/`: Express 5 + SQLite (`node:sqlite`, integrato in Node: nessuna dipendenza nativa), TypeScript eseguito direttamente da Node

## Avvio in sviluppo

```bash
# terminale 1: API su http://localhost:3000
cd server
npm install
npm run dev

# terminale 2: client su http://localhost:4200 (/api inoltrato al server)
cd client
npm start
```

Al primo avvio il server crea il database (`server/data/biliardino.db`) e, se non ha giocatori, importa da solo quelli
del vecchio progetto: per ripartire da zero basta cancellare quel file e riavviare. `npm run seed -- --reset` fa lo stesso
senza cancellare il file, anche a server spento (partite comprese).
Tutti partono da 1000 ELO, senza partite.

In produzione: `npm run build` in `client/`, poi `npm start` in `server/`, che serve anche `client/dist`.

Variabili del server: `PORT` (3000), `DB_PATH` (`server/data/biliardino.db`).

## Dati importati dal vecchio progetto

[server/seed/](server/seed) contiene i giocatori esportati (in sola lettura) dalla collezione Firestore `playersShark`,
con gli stessi ID, e la vecchia lista delle disponibilità per giorno; le vecchie partite non sono importate:

- 31 giocatori con nome e ruoli giocati, ricavati dalla vecchia predisposizione alla difesa: 0 → solo attacco,
  100 → solo difesa, altrimenti entrambi (9 giocatori dell'export sono stati tolti dall'elenco);
- gli avatar in [client/public/avatars](client/public/avatars), `<id>.webp`; chi non ne ha mostra una sagoma;
- ELO iniziale 1000 per tutti, come nel vecchio progetto;
- 3 nomi della lista disponibilità (Salvatore Defino, Loris Bevilacqua, Ilenia Taccogna) non sono più tra i giocatori.

## Giocatori e utenti

Non c'è registrazione. Ogni giocatore ha un utente, che ne riusa nome e icona e ha in più la password.
Per aggiungerne uno (la password va salvata come hash, quindi meglio lo script che un INSERT a mano):

```bash
cd server
npm run add-player -- "Mario Rossi" /avatars/50.webp passwordiniziale         # ELO iniziale 1000, attacco e difesa
npm run add-player -- "Anna Bianchi" "" pwd 1000 D                             # senza avatar, solo difesa
```

Le disponibilità per giorno si gestiscono dalla pagina **📅 Disponibilità** (con login): una griglia giocatori ×
lunedì–venerdì, un tocco per casella; la pagina Gioca preseleziona i disponibili di oggi.

I ruoli giocati (attacco, difesa o entrambi) e la password li sceglie ogni utente dal **profilo**.

Nome, icona e `start_elo` si possono poi cambiare direttamente nel DB, così come le partite in
`matches`/`match_players`: all'avvio il server ricalcola tutti gli ELO. Le colonne `elo_attack` ed `elo_defense` sono
derivate, non vanno toccate.

## Database

Schema in [server/src/db/schema.sql](server/src/db/schema.sql), applicato all'avvio:

| Tabella | Contenuto |
| --- | --- |
| `players` | nome, icona (URL, emoji o vuota), ELO iniziale (`start_elo`), ruoli giocati (`plays_attack`, `plays_defense`), ELO in attacco e in difesa (derivati) |
| `users` | un utente per giocatore (`player_id`) + hash scrypt della password |
| `sessions` | token di login (uno per dispositivo), cancellato al logout |
| `player_availability` | giorni della settimana in cui un giocatore c'è di solito (0 = domenica) |
| `running_match` | la partita generata e non ancora giocata (una sola per vincolo), mostrata a tutti come "in corso" |
| `matches` | punteggio rossi/blu (0–8), vincitore, probabilità attesa dei rossi (derivata), chi l'ha registrata, data |
| `match_players` | i 4 giocatori di ogni partita: squadra, ruolo (`attack`/`defense`); derivati: ELO prima, ELO nel ruolo, variazione |

Partite, vittorie, sconfitte, goal e statistiche non sono salvate: si calcolano dalle partite.

## Matchmaking

Il porting di `findBestMatch` del vecchio progetto ([matchmaking.ts](server/src/matchmaking/matchmaking.ts)). Nella
pagina **Gioca** si scelgono i giocatori disponibili (almeno 4; quelli disponibili oggi sono già selezionati) e,
con un secondo tocco, quelli con priorità ⭐ che devono giocare (al massimo 4). Il server valuta ogni partita
"difensore + attaccante contro difensore + attaccante" possibile tra loro e tiene la migliore:

| Criterio | Peso |
| --- | --- |
| equilibrio tra le due squadre (ELO nel ruolo) | 40% |
| equilibrio tra i due giocatori della stessa squadra | 20% |
| priorità a chi ha giocato meno | 20% |
| diversità: coppie di compagni e avversari viste meno spesso | 20% |
| casualità | ±5% |

Un giocatore è proposto solo nei ruoli che gioca (scelti dal profilo), e conta con il suo ELO in quel ruolo. La
partita scelta diventa la
**partita in corso**, visibile in home, finché qualcuno ne salva il risultato o la elimina. Ce n'è una sola alla volta: chi
prova a generarne un'altra riceve un avviso, vede la partita in corso e il pulsante resta disabilitato finché la partita
non viene salvata o eliminata.

Unica differenza voluta: nel vecchio calcolo del fattore di normalizzazione della diversità le 4 coppie di avversari
più frequenti venivano sovrascritte da un bug nell'inserimento ordinato; qui sono davvero le 4 più frequenti.

## ELO

Il sistema è quello del progetto precedente (`biliardino-elo/src/services/elo.service.ts`, in [elo.ts](server/src/elo/elo.ts)),
con una differenza: ogni giocatore ha **due ELO separati, uno in attacco e uno in difesa**, entrambi partono da
`start_elo`. In una partita ogni giocatore conta, e aggiorna, solo l'ELO del ruolo che gioca.

- **ELO di squadra** = media degli ELO dei due giocatori nei loro ruoli; risultato atteso classico
  `1 / (1 + 10^((B − A) / 400))`.
- **K** costante, 30 (il vecchio progetto partiva da 60 e scendeva a 40): in una partita equilibrata (50%) un 8-7 muove
  l'ELO di circa 16 punti e un 8-0 di circa 23. Le partite sbilanciate muovono di più per chi vince da sfavorito, di meno
  per chi vince da favorito. Una squadra usa la media dei K dei suoi giocatori.
- **Scarto**: ×(1 + diff / 8 × 0,5). **Sorpresa**: ×(1 ± 3 × |0,5 − atteso del vincitore|^1,5), più punti a chi
  vince da sfavorito, meno a chi vince da favorito.
- Entrambi i giocatori di una squadra ricevono la stessa variazione; le due squadre possono avere variazioni
  diverse (K diversi). Gli ELO sono decimali nel DB e arrotondati nell'API.

**Classifica**: di default ("Generale") ogni giocatore è classificato con il più alto dei suoi due ELO (contando solo
i ruoli in cui ha giocato); i pulsanti Attacco e Difesa mostrano la classifica per ruolo, con record, goal e forma
delle sole partite in quel ruolo. Compare solo chi ha almeno una partita (nel ruolo).

Come nel vecchio client, gli ELO si ottengono rigiocando tutte le partite in ordine dall'ELO iniziale
([ratings.ts](server/src/elo/ratings.ts)): all'avvio del server e a ogni partita salvata. Le statistiche della pagina
giocatore (streak, compagni e avversari, partite migliori e peggiori, goal) sono il porting di `stats.service.ts`.

## API

| Metodo | Percorso | Login | |
| --- | --- | --- | --- |
| GET | `/api/players` | | tutti i giocatori: ELO in attacco e in difesa, ruoli, record, goal, forma (ultime 5), disponibilità |
| GET | `/api/players/ranking?by=best\|attack\|defense` | | la classifica: solo chi ha giocato (nel ruolo), per ELO più alto o per ELO del ruolo |
| GET | `/api/players/:id` | | giocatore, statistiche, storico dei due ELO, partite |
| GET | `/api/matches/running` | | partita in corso, o `null` |
| POST | `/api/auth/login` | | `{ name, password }` → `{ token, user }` |
| POST | `/api/auth/logout` | | |
| GET | `/api/auth/me` | ✔ | utente corrente |
| PUT | `/api/auth/password` | ✔ | `{ currentPassword, newPassword }` |
| GET / PUT | `/api/auth/roles` | ✔ | `{ attack, defense }`: i ruoli che l'utente gioca (almeno uno) |
| POST | `/api/matches/generate` | ✔ | `{ playerIds: [≥4 id], priorityIds?: [≤4 id] }` → partita in corso; se ce n'è già una risponde 409 con quella |
| DELETE | `/api/matches/running` | ✔ | elimina la partita in corso |
| PUT | `/api/availability/:playerId` | ✔ | `{ weekdays: [0–6] }`: i giorni in cui il giocatore c'è (0 = domenica) |
| POST | `/api/matches` | ✔ | `{ red: { attack, defense }, blue: {…}, redScore, blueScore }` (0–8, niente pareggi) |

Il token va nell'header `Authorization: Bearer <token>`.

# CAlcio Balilla

Classifica e partite di biliardino tra colleghi: l'evoluzione di `biliardino-elo` (Firebase) in un client/server.

- `client/`: Xaendar (web components + signals), Vite
- `server/`: Cloudflare Worker con Hono e database D1 (SQLite); serve anche la build del client come static assets

## Avvio in sviluppo

```bash
# terminale 1: API su http://localhost:3000 (wrangler dev, con un D1 locale in server/.wrangler)
cd server
npm install
npx wrangler d1 migrations apply biliardino --local      # la prima volta: crea le tabelle
npm run dev

# terminale 2: client su http://localhost:4200 (/api inoltrato al server)
cd client
npm start
```

Il D1 locale parte vuoto: per avere i dati del vecchio database SQLite (`server/data/biliardino.db`) vedi sotto
`npm run export-db`, e importa il file con `--local` al posto di `--remote`.

## Deploy su Cloudflare

Un solo Worker: le richieste che corrispondono a un file di `client/dist` le servono gli static assets, le altre (`/api`)
arrivano al Worker. Tutti i comandi vanno lanciati in `server/`.

La prima volta:

```bash
npx wrangler login
npx wrangler d1 create biliardino                                   # copia l'id stampato in wrangler.jsonc (database_id)
npx wrangler d1 migrations apply biliardino --remote                # crea le tabelle
npm run export-db                                                   # dati del vecchio SQLite → data/d1-import.sql
npx wrangler d1 execute biliardino --remote --file data/d1-import.sql
```

Dopo il primo deploy, entra come super admin e premi **Ricalcola** nella pagina dei ruoli: costruisce le statistiche
derivate (`player_stats`, `player_pairs`), che l'import non contiene. Finché non lo fai la classifica è vuota.

Poi, a ogni rilascio, `npm run deploy`: builda il client e pubblica il Worker. Con il deploy da Git di Cloudflare
(Workers Builds) imposta la root directory `server`, come build command
`npm --prefix ../client ci && npm --prefix ../client run build` e come deploy command `npx wrangler deploy`.

Le modifiche allo schema vanno in un nuovo file di [server/migrations/](server/migrations), applicato con
`npx wrangler d1 migrations apply biliardino --remote`. Dopo una modifica a `wrangler.jsonc`, `npm run types` rigenera
`worker-configuration.d.ts`.

Le password sono hash scrypt, verificati dal Worker al login e al cambio password: circa 30 ms di CPU, oltre i 10 ms per
richiesta del piano gratuito dei Workers, quindi per quelle richieste serve il piano a pagamento (Workers Paid). Il login
è limitato (binding Rate Limiting, in `wrangler.jsonc`) a 5 tentativi al minuto per account e 20 per IP: oltre risponde
429, prima di calcolare l'hash.

## Giocatori e utenti

Non c'è registrazione. Ogni giocatore ha un utente, che ne riusa nome e icona e ha in più la password.
Per aggiungerne uno (la password va salvata come hash, quindi meglio lo script che un INSERT a mano); lo script
scrive nel D1 remoto, o in quello locale con `--local`:

```bash
cd server
npm run add-player -- "Mario Rossi" /avatars/50.webp passwordiniziale         # ELO iniziale 1000, attacco e difesa
npm run add-player -- "Anna Bianchi" "" pwd 1000 D                             # senza avatar, solo difesa
```

Gli avatar sono in [client/public/avatars](client/public/avatars), `<id>.webp`; chi non ne ha mostra una sagoma.

Le disponibilità per giorno si gestiscono dalla pagina **📅 Disponibilità** (con login): una griglia giocatori ×
lunedì–venerdì, un tocco per casella; la pagina Gioca preseleziona i disponibili di oggi.

I ruoli giocati (attacco, difesa o entrambi) e la password li sceglie ogni utente dal **profilo**.

Nome, icona e `start_elo` si possono poi cambiare direttamente nel DB
(`npx wrangler d1 execute biliardino --remote --command "…"`), così come le partite in `matches`/`match_players`: dopo,
il super admin preme **Ricalcola** nella pagina dei ruoli, che ricostruisce ELO e statistiche rigiocando tutte le partite.
Le colonne `elo_attack` ed `elo_defense` e le tabelle `player_stats` e `player_pairs` sono derivate, non vanno toccate.

## Database

Schema in [server/migrations/](server/migrations):

| Tabella | Contenuto |
| --- | --- |
| `players` | nome, icona (URL, emoji o vuota), ELO iniziale (`start_elo`), ruoli giocati (`plays_attack`, `plays_defense`), ELO in attacco e in difesa (derivati) |
| `users` | un utente per giocatore (`player_id`) + hash scrypt della password |
| `sessions` | token di login (uno per dispositivo), cancellato al logout |
| `player_availability` | giorni della settimana in cui un giocatore c'è di solito (0 = domenica) |
| `running_match` | la partita generata e non ancora giocata (una sola per vincolo), mostrata a tutti come "in corso" |
| `matches` | punteggio rossi/blu (0–8), vincitore, probabilità attesa dei rossi (derivata), chi l'ha registrata, data |
| `match_players` | i 4 giocatori di ogni partita: squadra, ruolo (`attack`/`defense`); derivati: ELO prima, ELO nel ruolo, variazione |
| `player_stats` | derivata: partite, vittorie, goal e forma (ultime 5) di ogni giocatore, in tutto (`all`) e per ruolo |
| `player_pairs` | derivata: quante volte due giocatori hanno giocato insieme e contro, per il matchmaking |

Le tabelle derivate esistono perché le richieste non rileggano tutte le partite: classifica, matchmaking e partita in
corso leggono una riga per giocatore (o per coppia), la pagina di un giocatore solo le sue partite.

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
([ratings.ts](server/src/elo/ratings.ts)), ma solo con **Ricalcola**. Una partita salvata è l'ultima, quindi il suo ELO
si calcola dagli ELO attuali dei suoi 4 giocatori: si scrivono solo la partita, i 4 giocatori, le loro statistiche e le
loro coppie, in una transazione, con lo stesso risultato del ricalcolo completo. Se nel frattempo un'altra partita è stata
salvata, la transazione fallisce e il server risponde 409 (riprova). Le statistiche della pagina
giocatore (streak, compagni e avversari, partite migliori e peggiori, goal) sono il porting di `stats.service.ts`.

## API

| Metodo | Percorso | Login | |
| --- | --- | --- | --- |
| GET | `/api/players` | | tutti i giocatori: ELO in attacco e in difesa, ruoli, record, goal, forma (ultime 5), disponibilità |
| GET | `/api/players/ranking?by=best\|attack\|defense` | | la classifica: solo chi ha giocato (nel ruolo), per ELO più alto o per ELO del ruolo |
| GET | `/api/players/:id` | | giocatore, statistiche, storico dei due ELO, partite |
| GET | `/api/matches/running` | | partita in corso, o `null` |
| POST | `/api/auth/login` | | `{ name, password }` → `{ token, user }`; 429 oltre 5 tentativi al minuto per account |
| POST | `/api/auth/logout` | | |
| GET | `/api/auth/me` | ✔ | utente corrente |
| PUT | `/api/auth/password` | ✔ | `{ currentPassword, newPassword }` |
| GET / PUT | `/api/auth/roles` | ✔ | `{ attack, defense }`: i ruoli che l'utente gioca (almeno uno) |
| POST | `/api/matches/generate` | ✔ | `{ playerIds: [≥4 id], priorityIds?: [≤4 id] }` → partita in corso; se ce n'è già una risponde 409 con quella |
| DELETE | `/api/matches/running` | ✔ | elimina la partita in corso |
| PUT | `/api/availability/:playerId` | ✔ | `{ weekdays: [0–6] }`: i giorni in cui il giocatore c'è (0 = domenica) |
| POST | `/api/matches` | ✔ | `{ red: { attack, defense }, blue: {…}, redScore, blueScore }` (0–8, niente pareggi) → `{ id, redDelta, blueDelta, players }` (`players` come `/api/players`); 409 se nel frattempo è stata salvata un'altra partita |
| GET | `/api/admin/roles` | admin | tutti i giocatori con i loro ruoli |
| PUT | `/api/admin/roles/:playerId` | admin | `{ attack, defense }`, senza il limite di un cambio al giorno |
| POST | `/api/admin/recompute` | admin | ricostruisce ELO e statistiche da tutte le partite |

Il token va nell'header `Authorization: Bearer <token>`.

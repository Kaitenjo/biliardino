# CAlcio Balilla

Classifica e partite di biliardino tra colleghi.

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

Il D1 locale parte vuoto: aggiungi i giocatori con lo script descritto in **Giocatori e utenti**, con `--local`.

Per le notifiche push in locale serve `server/.dev.vars` (non versionato) con la riga `VAPID_PRIVATE_JWK=<JSON>`: la
chiave privata della coppia la cui chiave pubblica è `VAPID_PUBLIC_KEY` in `wrangler.jsonc` (vedi **Lobby e notifiche**).
Il cron non gira con `wrangler dev`, ma la lobby si aggiorna anche a ogni lettura della pagina; per provare un orario
qualsiasi il super admin può chiamare `POST /api/admin/lobby/tick` con `{ "at": "2026-10-26T10:00:00Z" }`.

## Deploy su Cloudflare

Un solo Worker: le richieste che corrispondono a un file di `client/dist` le servono gli static assets, le altre (`/api`)
arrivano al Worker. Tutti i comandi vanno lanciati in `server/`.

La prima volta:

```bash
npx wrangler login
npx wrangler d1 create biliardino                                   # copia l'id stampato in wrangler.jsonc (database_id)
npx wrangler d1 migrations apply biliardino --remote                # crea le tabelle
npx wrangler secret put VAPID_PRIVATE_JWK                           # la chiave privata delle notifiche push
```

In `wrangler.jsonc` imposta anche `VAPID_SUBJECT` (`mailto:` di chi gestisce l'app: i servizi push lo usano per
contattarlo in caso di problemi).

A ogni rilascio, `npm run deploy`: builda il client e pubblica il Worker. Con il deploy da Git di Cloudflare
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

I ruoli giocati (attacco, difesa o entrambi) e la disponibilità di oggi li sceglie ogni utente dalla pagina **Ruoli e
disponibilità** (il super admin quelli di tutti); la password dalla modale **Cambia password** del menu utente, dove si
attivano anche le **notifiche**.

Nome, icona e `start_elo` si possono poi cambiare direttamente nel DB
(`npx wrangler d1 execute biliardino --remote --command "…"`), così come le partite in `matches`/`match_players`: dopo,
il super admin preme **Salva e ricalcola tutto** nella pagina **ELO** (`#/elo`), che ricostruisce ELO e statistiche
rigiocando tutte le partite. Nella stessa pagina si impostano le variabili del calcolo (K, scala, peso dello scarto gol,
fattore sorpresa, ELO iniziale di tutti): sono salvate in `elo_settings` e usate anche per ogni nuova partita.
Le colonne `elo_attack` ed `elo_defense` e le tabelle `player_stats` e `player_pairs` sono derivate, non vanno toccate.

## Database

Schema in [server/migrations/](server/migrations):

| Tabella | Contenuto |
| --- | --- |
| `players` | nome, icona (URL, emoji o vuota), ELO iniziale (`start_elo`), ruoli giocati (`plays_attack`, `plays_defense`), disponibilità di oggi (`available_on`), ELO in attacco e in difesa (derivati) |
| `users` | un utente per giocatore (`player_id`) + hash scrypt della password |
| `sessions` | token di login (uno per dispositivo), cancellato al logout |
| `player_availability` | non più usata: i giorni della settimana in cui un giocatore c'era di solito (0 = domenica), sostituiti da `players.available_on` |
| `running_match` | la partita generata e non ancora giocata (una sola per vincolo), mostrata a tutti come "in corso" |
| `lobbies` | le lobby: giorno, orario di apertura (`slot`), se la partita del suo orario è già stata generata, se è chiusa |
| `lobby_players` | chi è in ogni lobby |
| `push_subscriptions` | i browser in cui un utente ha attivato le notifiche push |
| `elo_settings` | le variabili del calcolo dell'ELO (una riga), modificabili dalla pagina ELO |
| `matches` | punteggio marroni/bianchi (`brown_score`, `white_score`, 0–8), vincitore (`brown`/`white`), probabilità attesa dei marroni (`brown_expected`, derivata), chi l'ha registrata, data |
| `match_players` | i 4 giocatori di ogni partita: squadra (`brown`/`white`), ruolo (`attack`/`defense`); derivati: ELO prima, ELO nel ruolo, variazione |
| `player_stats` | derivata: partite, vittorie, goal e forma (ultime 5) di ogni giocatore, in tutto (`all`) e per ruolo |
| `player_pairs` | derivata: quante volte due giocatori hanno giocato insieme e contro, per il matchmaking |

Le tabelle derivate esistono perché le richieste non rileggano tutte le partite: classifica, matchmaking e partita in
corso leggono una riga per giocatore (o per coppia), la pagina di un giocatore solo le sue partite.

## Lobby e notifiche

Le partite nascono dalle **lobby** ([lobby.ts](server/src/lobby/lobby.ts), orari e festivi in
[calendar.ts](server/src/lobby/calendar.ts)). Dal lunedì al venerdì, festività nazionali escluse (Pasquetta compresa):

| Lobby | Partita | Chiusura |
| --- | --- | --- |
| 10:30 | 11:00 | 11:30 |
| 12:30 | 13:00 | 13:30 |
| 15:30 | 16:00 | 16:30 |
| 17:30 | 18:00 | 20:00 |

- All'apertura tutti gli utenti con le notifiche attive ricevono "Lobby aperta". Nella pagina **Lobby** si entra con
  **Entra in lobby**, e si può uscire e rientrare finché è aperta.
- All'orario della partita il matchmaking sceglie la partita migliore tra chi è in lobby, che diventa la partita in corso;
  i 4 giocatori ricevono una notifica. Con meno di 4 persone (o una partita ancora da salvare, o ruoli incompatibili) non
  si genera nulla e chi era in lobby riceve una notifica con il motivo.
- Finché la lobby è aperta, chi salva un risultato può generare subito un'altra partita con chi è in lobby (i 4 giocatori
  vengono avvisati).

Non c'è più la generazione manuale. Lo scheduler è il cron del Worker (`triggers` in `wrangler.jsonc`, ogni mezz'ora,
orari UTC che coprono ora solare e legale); ogni passo è registrato nel DB, quindi un cron in ritardo o saltato si
recupera al giro dopo, e anche ogni lettura della pagina Lobby porta la lobby in pari con l'orologio.

Le notifiche sono **Web Push** standard, inviate dal Worker senza servizi esterni ([web-push.ts](server/src/push/web-push.ts):
cifratura aes128gcm e firma VAPID). Ognuno le attiva dal menu utente; al logout il browser viene tolto. Su iPhone
funzionano solo con il sito aggiunto alla schermata Home. Le chiavi VAPID si generano una volta con
`npm run vapid-keys`: la pubblica va in `wrangler.jsonc`, la privata è il secret `VAPID_PRIVATE_JWK`; cambiarle obbliga
tutti a riattivare le notifiche.

## Matchmaking

L'algoritmo è in [matchmaking.ts](server/src/matchmaking/matchmaking.ts). Tra chi è in lobby il server valuta ogni
partita "difensore + attaccante contro difensore + attaccante" possibile e tiene la migliore:

| Criterio | Peso |
| --- | --- |
| equilibrio tra le due squadre (ELO nel ruolo) | 40% |
| equilibrio tra i due giocatori della stessa squadra | 20% |
| priorità a chi ha giocato meno | 20% |
| diversità: coppie di compagni e avversari viste meno spesso | 20% |
| casualità | ±5% |

Un giocatore è proposto solo nei ruoli che gioca (scelti da Ruoli e disponibilità), e conta con il suo ELO in quel ruolo. La
partita scelta diventa la
**partita in corso**, visibile in home e nella Lobby, finché qualcuno ne salva il risultato o la elimina. Ce n'è una sola
alla volta.

## ELO

Il sistema è in [elo.ts](server/src/elo/elo.ts): ogni giocatore ha **due ELO separati, uno in attacco e uno in difesa**,
entrambi partono da `start_elo`. In una partita ogni giocatore conta, e aggiorna, solo l'ELO del ruolo che gioca.

- **ELO di squadra** = media degli ELO dei due giocatori nei loro ruoli; risultato atteso classico
  `1 / (1 + 10^((B − A) / 400))`.
- **K** costante, 30: in una partita equilibrata (50%) un 8-7 muove
  l'ELO di circa 16 punti e un 8-0 di circa 23. Le partite sbilanciate muovono di più per chi vince da sfavorito, di meno
  per chi vince da favorito. Una squadra usa la media dei K dei suoi giocatori.
- **Scarto**: ×(1 + diff / 8 × 0,5). **Sorpresa**: ×(1 ± 3 × |0,5 − atteso del vincitore|^1,5), più punti a chi
  vince da sfavorito, meno a chi vince da favorito.
- Entrambi i giocatori di una squadra ricevono la stessa variazione; le due squadre possono avere variazioni
  diverse (K diversi). Gli ELO sono decimali nel DB e arrotondati nell'API.

**Classifica**: di default ("Generale") ogni giocatore è classificato con il più alto dei suoi due ELO (contando solo
i ruoli in cui ha giocato); i pulsanti Attacco e Difesa mostrano la classifica per ruolo, con record, goal e forma
delle sole partite in quel ruolo. Compare solo chi ha almeno una partita (nel ruolo).

Gli ELO si ottengono rigiocando tutte le partite in ordine dall'ELO iniziale
([ratings.ts](server/src/elo/ratings.ts)), ma solo con **Salva e ricalcola tutto**. Una partita salvata è l'ultima, quindi il suo ELO
si calcola dagli ELO attuali dei suoi 4 giocatori: si scrivono solo la partita, i 4 giocatori, le loro statistiche e le
loro coppie, in una transazione, con lo stesso risultato del ricalcolo completo. Se nel frattempo un'altra partita è stata
salvata, la transazione fallisce e il server risponde 409 (riprova). Le statistiche della pagina
giocatore (streak, compagni e avversari, partite migliori e peggiori, goal) sono calcolate dalle sue partite.

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
| GET | `/api/lobby` | ✔ | la lobby aperta con chi c'è dentro, o quando apre la prossima |
| POST | `/api/lobby/:id/join`, `/api/lobby/:id/leave` | ✔ | entra nella lobby aperta, o esce |
| POST | `/api/lobby/:id/generate` | ✔ | dopo la partita del suo orario: un'altra partita con chi è in lobby (notifica ai 4) |
| GET | `/api/push/key` | | la chiave pubblica VAPID |
| POST / DELETE | `/api/push/subscriptions` | ✔ | attiva (`PushSubscription.toJSON()`) o disattiva (`{ endpoint }`) le notifiche di questo browser |
| DELETE | `/api/matches/running` | ✔ | elimina la partita in corso |
| PUT | `/api/availability/:playerId` | ✔ | `{ available: boolean }`: se il giocatore è disponibile oggi (si azzera ogni giorno); solo il proprio, il super admin quello di tutti |
| POST | `/api/matches` | ✔ | `{ brown: { attack, defense }, white: {…}, brownScore, whiteScore }` (0–8, niente pareggi; marroni e bianchi come gli omini) → `{ id, brownDelta, whiteDelta, players }` (`players` come `/api/players`); 409 se nel frattempo è stata salvata un'altra partita |
| PUT | `/api/admin/roles/:playerId` | admin | `{ attack, defense }`, senza il limite di un cambio al giorno |
| POST | `/api/admin/recompute` | admin | ricostruisce ELO e statistiche da tutte le partite |
| POST | `/api/admin/lobby/tick` | admin | porta le lobby in pari con l'orologio, ora o a `{ at }` (per le prove) |

Il token va nell'header `Authorization: Bearer <token>`.

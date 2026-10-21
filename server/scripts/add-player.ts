import { hashPassword } from '../src/auth/auth.ts';
import { run, transaction } from '../src/db/db.ts';
import { recomputeRatings } from '../src/elo/ratings.ts';

/*
  Adds a player and its user:
    npm run add-player -- <nome> <icona> <password> [elo iniziale] [ruoli: AD, A o D]
  e.g. npm run add-player -- Mario /avatars/mario.webp cambiami 1000 D
  The roles default to both (AD); the user can change them from its profile.
*/
const [name, icon, password, startElo = '1000', roles = 'AD'] = process.argv.slice(2);
const playsAttack = roles.toUpperCase().includes('A');
const playsDefense = roles.toUpperCase().includes('D');
if (!name || icon === undefined || !password || (!playsAttack && !playsDefense)) {
  console.error('Uso: npm run add-player -- <nome> <icona> <password> [elo iniziale] [ruoli: AD, A o D]');
  process.exit(1);
}

const playerId = transaction(() => {
  const { lastInsertRowid } = run(
    'INSERT INTO players (name, icon, start_elo, elo_attack, elo_defense, plays_attack, plays_defense) VALUES (?, ?, ?, ?, ?, ?, ?)',
    name,
    icon,
    Number(startElo),
    Number(startElo),
    Number(startElo),
    playsAttack ? 1 : 0,
    playsDefense ? 1 : 0
  );
  run('INSERT INTO users (player_id, password_hash) VALUES (?, ?)', lastInsertRowid, hashPassword(password));
  recomputeRatings();
  return lastInsertRowid;
});

console.log(`Creato il giocatore ${name} (id ${playerId})`);

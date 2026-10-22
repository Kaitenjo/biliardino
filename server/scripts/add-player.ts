import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '../src/auth/password.ts';

/*
  Adds a player and its user to D1 (the remote database; --local for the one of `npm run dev`):
    npm run add-player -- [--local] <nome> <icona> <password> [elo iniziale] [ruoli: AD, A o D]
  e.g. npm run add-player -- Mario /avatars/mario.webp cambiami 1000 D
  The roles default to both (AD); the user can change them from its profile. A new player has no match, so its ELOs are
  the initial one.
*/
const args = process.argv.slice(2);
const local = args.includes('--local');
const [name, icon, password, startElo = '1000', roles = 'AD'] = args.filter(arg => arg !== '--local');
const playsAttack = roles.toUpperCase().includes('A');
const playsDefense = roles.toUpperCase().includes('D');
if (!name || icon === undefined || !password || (!playsAttack && !playsDefense) || !Number.isFinite(Number(startElo))) {
  console.error('Uso: npm run add-player -- [--local] <nome> <icona> <password> [elo iniziale] [ruoli: AD, A o D]');
  process.exit(1);
}

/**
 * Writes a string as an SQL literal.
 *
 * @param value - The string.
 * @returns The literal.
 */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const elo = Number(startElo);
const file = 'data/add-player.sql';
mkdirSync('data', { recursive: true });
writeFileSync(file, `INSERT INTO players (name, icon, start_elo, elo_attack, elo_defense, plays_attack, plays_defense)
  VALUES (${literal(name)}, ${literal(icon)}, ${elo}, ${elo}, ${elo}, ${playsAttack ? 1 : 0}, ${playsDefense ? 1 : 0});
INSERT INTO users (player_id, password_hash) SELECT id, ${literal(hashPassword(password))} FROM players WHERE name = ${literal(name)};
`);

const wrangler = resolve(import.meta.dirname, '../node_modules/wrangler/bin/wrangler.js');
execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'biliardino', local ? '--local' : '--remote', '--file', file], { stdio: 'inherit' });
console.log(`Creato il giocatore ${name}`);

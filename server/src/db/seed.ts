import { readFileSync } from 'node:fs';
import { hashPassword } from '../auth/auth.ts';
import { db, get, transaction } from './db.ts';

/**
 * Password of every imported user.
 */
const INITIAL_PASSWORD = 'biliardino';

/**
 * Initial ELO of every imported player, as in the previous project. Written explicitly: a database migrated from an
 * older schema has a different default on the column.
 */
const START_ELO = 1000;

/**
 * A player of the seed.
 */
interface SeedPlayer {
  /**
   * Id, the one of the previous project (the avatars are named after it).
   */
  id: number;
  /**
   * Name.
   */
  name: string;
  /**
   * Icon: the URL of the avatar, `''` for none.
   */
  icon: string;
  /**
   * Whether it plays in attack.
   */
  attack: boolean;
  /**
   * Whether it plays in defence.
   */
  defense: boolean;
}

/**
 * What a seed imported.
 */
export interface SeedResult {
  /**
   * How many players, each with its user.
   */
  players: number;
  /**
   * How many days of availability.
   */
  availability: number;
}

/**
 * Reads a file of the seed.
 *
 * @param name - The name of the file in server/seed.
 * @returns Its content.
 */
function readSeed<TData>(name: string): TData {
  return JSON.parse(readFileSync(new URL(`../../seed/${name}`, import.meta.url), 'utf8')) as TData;
}

/**
 * Imports the players and their availability of the previous project (exported from Firestore into server/seed/), with
 * the same ids: every user gets the password "biliardino" and every player starts from 1000 ELO, with no match.
 * Dario Spinosa is the super admin.
 *
 * @param reset - Whether to empty the database first, matches included; otherwise nothing is done when it has players.
 * @returns What was imported, `null` when the database already had players.
 */
export function seedDatabase(reset = false): SeedResult | null {
  const existing = get<{ count: number }>('SELECT COUNT(*) AS count FROM players');
  if (existing && existing.count > 0 && !reset) {
    return null;
  }

  const players = readSeed<SeedPlayer[]>('players.json');
  const availability = readSeed<Array<{ playerId: number; weekday: number }>>('availability.json');
  const passwordHash = hashPassword(INITIAL_PASSWORD);

  transaction(() => {
    if (reset) {
      db.exec('DELETE FROM running_match; DELETE FROM match_players; DELETE FROM matches; DELETE FROM sessions; DELETE FROM users; DELETE FROM player_availability; DELETE FROM players;');
    }

    const insertPlayer = db.prepare(
      'INSERT INTO players (id, name, icon, plays_attack, plays_defense, start_elo, elo_attack, elo_defense) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    // The same hash for everybody: each user changes it from the profile
    const insertUser = db.prepare('INSERT INTO users (player_id, password_hash) VALUES (?, ?)');
    for (let i = 0; i < players.length; i++) {
      const player = players[i]!;
      insertPlayer.run(player.id, player.name, player.icon, player.attack ? 1 : 0, player.defense ? 1 : 0, START_ELO, START_ELO, START_ELO);
      insertUser.run(player.id, passwordHash);
    }

    // The only super admin
    db.prepare("UPDATE players SET is_admin = 1 WHERE name = 'Dario Spinosa'").run();

    const insertAvailability = db.prepare('INSERT INTO player_availability (player_id, weekday) VALUES (?, ?)');
    for (let i = 0; i < availability.length; i++) {
      insertAvailability.run(availability[i]!.playerId, availability[i]!.weekday);
    }
  });

  return { players: players.length, availability: availability.length };
}

/**
 * The password every imported user starts with.
 */
export const SEED_PASSWORD = INITIAL_PASSWORD;

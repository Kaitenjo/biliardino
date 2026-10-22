import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/*
  Writes the data of the old SQLite database as INSERTs for D1, which has the schema of migrations/:
    npm run export-db -- [database]        # default data/biliardino.db, written to data/d1-import.sql
    npx wrangler d1 execute biliardino --remote --file data/d1-import.sql
  The database is only read. Columns no longer in the schema (players.elo, players.defence) are left out.
*/
const source = process.argv[2] ?? 'data/biliardino.db';
const target = 'data/d1-import.sql';

/**
 * The tables, parents first because of the foreign keys, with the columns of the schema.
 */
const TABLES: ReadonlyArray<readonly [table: string, columns: readonly string[]]> = [
  ['players', ['id', 'name', 'icon', 'start_elo', 'plays_attack', 'plays_defense', 'roles_changed_on', 'is_admin', 'elo_attack', 'elo_defense', 'created_at']],
  ['users', ['id', 'player_id', 'password_hash']],
  ['player_availability', ['player_id', 'weekday']],
  ['sessions', ['token', 'user_id', 'created_at']],
  ['matches', ['id', 'red_score', 'blue_score', 'winner', 'red_expected', 'created_by', 'played_at']],
  ['match_players', ['match_id', 'player_id', 'team', 'role', 'elo_before', 'role_elo', 'elo_delta']],
  ['running_match', ['id', 'red_attack', 'red_defense', 'blue_attack', 'blue_defense', 'created_by', 'created_at']]
];

/**
 * Writes a value as an SQL literal.
 *
 * @param value - The value read from SQLite.
 * @returns The literal.
 */
function literal(value: unknown): string {
  if (value === null) {
    return 'NULL';
  }

  return typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(value);
}

const db = new DatabaseSync(source, { readOnly: true });
const lines: string[] = [];
for (const [table, columns] of TABLES) {
  const rows = db.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all();
  for (const row of rows) {
    lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(column => literal(row[column])).join(', ')});`);
  }

  console.log(`${table}: ${rows.length}`);
}

writeFileSync(target, lines.join('\n') + '\n');
console.log(`Scritto ${target}: importalo con "npx wrangler d1 execute biliardino --remote --file ${target}"`);

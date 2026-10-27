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
 * Reads a team of the old database (red or blue) as one of the schema (brown or white).
 *
 * @param column - The column with the team.
 * @returns The SQL expression.
 */
const TEAM = (column: string): string => `CASE ${column} WHEN 'red' THEN 'brown' ELSE 'white' END`;

/**
 * A column of the schema, or one read from something else in the old database.
 */
type Column = string | readonly [column: string, read: string];

/**
 * The tables, parents first because of the foreign keys, with the columns of the schema: a column of the schema named
 * differently in the old database, or whose values changed, comes with what it is read from there (the teams were red
 * and blue, now brown and white).
 */
const TABLES: ReadonlyArray<readonly [table: string, columns: readonly Column[]]> = [
  ['players', ['id', 'name', 'icon', 'start_elo', 'plays_attack', 'plays_defense', 'roles_changed_on', 'is_admin', 'elo_attack', 'elo_defense', 'created_at']],
  ['users', ['id', 'player_id', 'password_hash']],
  ['player_availability', ['player_id', 'weekday']],
  ['sessions', ['token', 'user_id', 'created_at']],
  ['matches', ['id', ['brown_score', 'red_score'], ['white_score', 'blue_score'], ['winner', TEAM('winner')], ['white_expected', '1 - red_expected'], 'created_by', 'played_at']],
  ['match_players', ['match_id', 'player_id', ['team', TEAM('team')], 'role', 'elo_before', 'role_elo', 'elo_delta']],
  ['running_match', ['id', ['brown_attack', 'red_attack'], ['brown_defense', 'red_defense'], ['white_attack', 'blue_attack'], ['white_defense', 'blue_defense'], 'created_by', 'created_at']]
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
  const names = columns.map(column => (typeof column === 'string' ? column : column[0]));
  const reads = columns.map(column => (typeof column === 'string' ? column : `${column[1]} AS ${column[0]}`));
  const rows = db.prepare(`SELECT ${reads.join(', ')} FROM ${table}`).all();
  for (const row of rows) {
    lines.push(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(name => literal(row[name])).join(', ')});`);
  }

  console.log(`${table}: ${rows.length}`);
}

writeFileSync(target, lines.join('\n') + '\n');
console.log(`Scritto ${target}: importalo con "npx wrangler d1 execute biliardino --remote --file ${target}"`);

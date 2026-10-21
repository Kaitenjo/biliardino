import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';

/**
 * Path of the SQLite file: `DB_PATH`, or `server/data/biliardino.db`.
 */
const DB_PATH = process.env['DB_PATH'] ?? resolve(import.meta.dirname, '../../data/biliardino.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

/**
 * The application database, with the schema applied.
 */
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
addMissingColumns();
migrateGeneratedMatches();
// At most one super admin, who changes the roles of anybody without limits. After the migration: it needs the column.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS players_single_admin ON players (is_admin) WHERE is_admin = 1');

/**
 * Adds to a database created by an older schema the columns it lacks. `CREATE TABLE IF NOT EXISTS` leaves existing
 * tables as they are, so each column added to `schema.sql` after the first release is listed here too, with the
 * statement that fills it from the old columns, if any. Old columns no longer used (`players.elo`, `players.defence`)
 * are left in place: they have defaults, so they don't get in the way.
 */
function addMissingColumns(): void {
  const columns: ReadonlyArray<readonly [table: string, column: string, definition: string, fill?: string]> = [
    ['players', 'start_elo', 'REAL NOT NULL DEFAULT 1000'],
    // The old propensity for defence (0-100) becomes the roles played: 0 only attack, 100 only defence, else both
    ['players', 'plays_attack', 'INTEGER NOT NULL DEFAULT 1 CHECK (plays_attack IN (0, 1))', 'UPDATE players SET plays_attack = defence < 100'],
    ['players', 'plays_defense', 'INTEGER NOT NULL DEFAULT 1 CHECK (plays_defense IN (0, 1))', 'UPDATE players SET plays_defense = defence > 0'],
    ['players', 'roles_changed_on', 'TEXT'],
    ['players', 'is_admin', 'INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1))'],
    ['players', 'elo_attack', 'REAL NOT NULL DEFAULT 1000'],
    ['players', 'elo_defense', 'REAL NOT NULL DEFAULT 1000'],
    ['matches', 'red_expected', 'REAL NOT NULL DEFAULT 0.5'],
    ['match_players', 'role_elo', 'REAL NOT NULL DEFAULT 0']
  ];
  for (let i = 0; i < columns.length; i++) {
    const [table, column, definition, fill] = columns[i]!;
    if (!hasColumn(table, column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      if (fill && hasColumn('players', 'defence')) {
        db.exec(fill);
      }
    }
  }
}

/**
 * A database created when generated matches had a history (`generated_matches`, with an `active` one) keeps only the
 * match to play, in `running_match`, and loses the table.
 */
function migrateGeneratedMatches(): void {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'generated_matches'").get()) {
    return;
  }

  db.exec(`INSERT OR IGNORE INTO running_match (red_attack, red_defense, blue_attack, blue_defense, created_by, created_at)
           SELECT red_attack, red_defense, blue_attack, blue_defense, created_by, created_at FROM generated_matches WHERE active = 1;
           DROP TABLE generated_matches;`);
}

/**
 * Whether a table has a column.
 *
 * @param table - The table.
 * @param column - The column.
 * @returns Whether it has it.
 */
function hasColumn(table: string, column: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column));
}

/**
 * Runs a query and returns every row.
 *
 * @param sql - The query.
 * @param params - Its positional parameters.
 * @returns The rows, typed as the caller expects them.
 */
export function all<TRow>(sql: string, ...params: SQLInputValue[]): TRow[] {
  return db.prepare(sql).all(...params) as unknown as TRow[];
}

/**
 * Runs a query and returns its first row.
 *
 * @param sql - The query.
 * @param params - Its positional parameters.
 * @returns The first row, `undefined` when there is none.
 */
export function get<TRow>(sql: string, ...params: SQLInputValue[]): TRow | undefined {
  return db.prepare(sql).get(...params) as unknown as TRow | undefined;
}

/**
 * Runs a statement.
 *
 * @param sql - The statement.
 * @param params - Its positional parameters.
 * @returns The id of the last inserted row and the number of changed rows.
 */
export function run(sql: string, ...params: SQLInputValue[]): { lastInsertRowid: number | bigint; changes: number | bigint } {
  return db.prepare(sql).run(...params);
}

/**
 * Runs a function in a transaction, rolled back if it throws. Inside another transaction it just joins it.
 *
 * @param work - The function.
 * @returns What the function returns.
 */
export function transaction<TResult>(work: () => TResult): TResult {
  if (db.isTransaction) {
    return work();
  }

  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

import { env } from 'cloudflare:workers';

/**
 * A value bound to a parameter of a query.
 */
export type SqlValue = string | number | null;

/**
 * Prepares a statement, to run it alone or in a `batch`.
 *
 * @param sql - The statement.
 * @param params - Its positional parameters.
 * @returns The prepared statement.
 */
export function statement(sql: string, ...params: SqlValue[]): D1PreparedStatement {
  return env.DB.prepare(sql).bind(...params);
}

/**
 * Runs a query and returns every row.
 *
 * @param sql - The query.
 * @param params - Its positional parameters.
 * @returns The rows, typed as the caller expects them.
 */
export async function all<TRow>(sql: string, ...params: SqlValue[]): Promise<TRow[]> {
  const { results } = await statement(sql, ...params).all<TRow>();
  return results;
}

/**
 * Runs a query and returns its first row.
 *
 * @param sql - The query.
 * @param params - Its positional parameters.
 * @returns The first row, `undefined` when there is none.
 */
export async function get<TRow>(sql: string, ...params: SqlValue[]): Promise<TRow | undefined> {
  return (await statement(sql, ...params).first<TRow>()) ?? undefined;
}

/**
 * Runs a statement.
 *
 * @param sql - The statement.
 * @param params - Its positional parameters.
 * @returns The number of changed rows.
 */
export async function run(sql: string, ...params: SqlValue[]): Promise<{ changes: number }> {
  const { meta } = await statement(sql, ...params).run();
  return { changes: meta.changes };
}

/**
 * Runs statements in order in a transaction, rolled back if one fails. D1 has no other transactions: what a statement
 * needs from a previous one (an id) it reads in SQL.
 *
 * @param statements - The statements, made by `statement`.
 * @returns The rows returned by each statement.
 */
export function batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
  return env.DB.batch(statements);
}

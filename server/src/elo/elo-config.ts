import { get, statement } from '../db/db.ts';
import { DEFAULT_ELO_CONFIG } from './elo.ts';
import type { EloConfig } from './elo.ts';

/**
 * Allowed range of each variable; `integer` ones must be whole numbers. The minimum is excluded when `exclusiveMin` is
 * set: a zero there would divide by zero or flatten the system.
 */
const LIMITS: Record<Exclude<keyof EloConfig, 'filippoRule'>, { min: number; max: number; exclusiveMin?: boolean; integer?: boolean }> = {
  startK: { min: 0, max: 200, exclusiveMin: true },
  finalK: { min: 0, max: 200, exclusiveMin: true },
  matchesK: { min: 1, max: 1000, integer: true },
  scale: { min: 0, max: 5000, exclusiveMin: true },
  marginGoals: { min: 0, max: 100, exclusiveMin: true },
  marginWeight: { min: 0, max: 5 },
  surpriseWeight: { min: 0, max: 10 },
  surpriseExponent: { min: 0, max: 5, exclusiveMin: true },
  minWinProbability: { min: 0, max: 0.5 },
  minWinDelta: { min: 0, max: 50 }
};

/**
 * Allowed range of the initial ELO that can be set for every player at once.
 */
export const START_ELO_LIMITS = { min: 0, max: 5000 };

/**
 * Loads the saved variables of the ELO system.
 *
 * @returns The variables; the defaults when the row is missing.
 */
export async function loadEloConfig(): Promise<EloConfig> {
  const row = await get<Omit<EloConfig, 'filippoRule'> & { filippoRule: number }>(
    `SELECT start_k AS startK, final_k AS finalK, matches_k AS matchesK, scale, margin_goals AS marginGoals,
       margin_weight AS marginWeight, surprise_weight AS surpriseWeight, surprise_exponent AS surpriseExponent,
       min_win_probability AS minWinProbability, min_win_delta AS minWinDelta, filippo_rule AS filippoRule
     FROM elo_settings WHERE id = 1`
  );
  return row ? { ...row, filippoRule: row.filippoRule === 1 } : { ...DEFAULT_ELO_CONFIG };
}

/**
 * Prepares the statement saving the variables, to run in the same transaction as the recomputation they set off.
 *
 * @param config - The variables.
 * @returns The prepared statement.
 */
export function saveEloConfig(config: EloConfig): D1PreparedStatement {
  return statement(
    `INSERT INTO elo_settings (id, start_k, final_k, matches_k, scale, margin_goals, margin_weight, surprise_weight, surprise_exponent,
       min_win_probability, min_win_delta, filippo_rule)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET start_k = excluded.start_k, final_k = excluded.final_k, matches_k = excluded.matches_k,
       scale = excluded.scale, margin_goals = excluded.margin_goals, margin_weight = excluded.margin_weight,
       surprise_weight = excluded.surprise_weight, surprise_exponent = excluded.surprise_exponent,
       min_win_probability = excluded.min_win_probability, min_win_delta = excluded.min_win_delta,
       filippo_rule = excluded.filippo_rule`,
    config.startK,
    config.finalK,
    config.matchesK,
    config.scale,
    config.marginGoals,
    config.marginWeight,
    config.surpriseWeight,
    config.surpriseExponent,
    config.minWinProbability,
    config.minWinDelta,
    config.filippoRule ? 1 : 0
  );
}

/**
 * Checks the variables sent by the client.
 *
 * @param body - The fields of the request.
 * @returns The variables, or the message of the first one that is wrong.
 */
export function parseEloConfig(body: Record<string, unknown>): EloConfig | string {
  const config = { ...DEFAULT_ELO_CONFIG };
  if (typeof body['filippoRule'] !== 'boolean') {
    return 'Valore mancante o non booleano: filippoRule';
  }

  config.filippoRule = body['filippoRule'];
  for (const key of Object.keys(LIMITS) as Array<keyof typeof LIMITS>) {
    const value = body[key];
    const { min, max, exclusiveMin, integer } = LIMITS[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `Valore mancante o non numerico: ${key}`;
    }

    if (value > max || value < min || (exclusiveMin && value === min) || (integer && !Number.isInteger(value))) {
      return `Valore non valido: ${key}`;
    }

    config[key] = value;
  }

  return config;
}

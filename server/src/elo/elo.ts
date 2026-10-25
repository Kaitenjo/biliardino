import type { Lineup } from '../models.ts';

/*
  The ELO system of the previous project (biliardino-elo, src/services/elo.service.ts), with two changes: each player
  has two separate ELOs, one in attack and one in defence, instead of one ELO with a malus in the role it doesn't like;
  and the K factor is lower (30, against 60 falling to 40), so that in a balanced match a result moves the ELO by 15-25
  points. In a match each player counts, and changes, only the ELO of the role it plays. Every variable is in EloConfig,
  configurable by the super admin (the defaults are the values above).
  - the K factor starts at startK and goes down linearly to finalK over the first matchesK matches of a player in
    that role (the two are equal by default: no boost for the new ones); a team uses the average K of its players;
  - the change is weighed by the goal margin and by a "surprise" factor: an upset is worth more, an expected win less.
*/

/**
 * Every variable of the ELO system. The super admin changes them from the ELO page, which then recomputes every rating;
 * the saved values (`loadEloConfig`) are the ones used for each new match too.
 */
export interface EloConfig {
  /**
   * K factor of a player at its first match in a role. With a 50% chance, an 8-7 moves the ELO by about 16 points and an
   * 8-0 by about 23.
   */
  startK: number;
  /**
   * K factor of a player once it played `matchesK` matches in a role.
   */
  finalK: number;
  /**
   * Matches in a role after which the K factor of a player reaches `finalK`.
   */
  matchesK: number;
  /**
   * Scale of the expected score: with this ELO difference a team wins 10 times out of 11.
   */
  scale: number;
  /**
   * Goals of difference that, with `marginWeight`, set the weight of the margin.
   */
  marginGoals: number;
  /**
   * Weight added by `marginGoals` goals of difference (0.5 = +50%).
   */
  marginWeight: number;
  /**
   * Strength of the surprise factor: 0 turns it off.
   */
  surpriseWeight: number;
  /**
   * Exponent of the distance from a 50% chance in the surprise factor.
   */
  surpriseExponent: number;
  /**
   * Lowest probability of winning given to a team, however far ahead the other is: the favourites are at most
   * `1 - minWinProbability`.
   */
  minWinProbability: number;
  /**
   * Least ELO that the winning team earns, even when it was the clear favourite.
   */
  minWinDelta: number;
}

/**
 * The values of the system when nothing was configured.
 */
export const DEFAULT_ELO_CONFIG: Readonly<EloConfig> = {
  startK: 30,
  finalK: 30,
  matchesK: 10,
  scale: 400,
  marginGoals: 8,
  marginWeight: 0.5,
  surpriseWeight: 3,
  surpriseExponent: 1.5,
  minWinProbability: 0.01,
  minWinDelta: 1
};

/**
 * A player in the role it plays, as seen by the ELO system.
 */
export interface EloPlayer {
  /**
   * ELO in the role.
   */
  elo: number;
  /**
   * Matches played in the role so far.
   */
  matches: number;
}

/**
 * The outcome of a match for the ELO system.
 */
export interface MatchElo {
  /**
   * ELO of the red team: the average of its players in their roles.
   */
  redElo: number;
  /**
   * ELO of the blue team.
   */
  blueElo: number;
  /**
   * Expected score of the red team (its probability of winning); the blue team has the complement.
   */
  redExpected: number;
  /**
   * Change of the ELO in the role of each red player.
   */
  redDelta: number;
  /**
   * Change of the ELO in the role of each blue player: the opposite of the red one.
   */
  blueDelta: number;
}

/**
 * Expected score of a team against another (its probability of winning).
 *
 * @param teamElo - ELO of the team.
 * @param opponentElo - ELO of the opponent team.
 * @param config - The variables of the system: the scale of the expected score and its lowest value.
 * @returns The expected score, between `minWinProbability` and its complement.
 */
export function expectedScore(teamElo: number, opponentElo: number, config: Pick<EloConfig, 'scale' | 'minWinProbability'>): number {
  const expected = 1 / (1 + 10 ** ((opponentElo - teamElo) / config.scale));
  return Math.min(1 - config.minWinProbability, Math.max(config.minWinProbability, expected));
}

/**
 * ELO of a team: the average of the ELOs of its players in their roles.
 *
 * @param team - The ELOs of the players, by role.
 * @returns The ELO of the team.
 */
export function teamElo(team: Lineup<number>): number {
  return (team.attack + team.defense) / 2;
}

/**
 * Computes the changes of ELO of a match.
 *
 * @param red - The red players in their roles, before the match.
 * @param blue - The blue players in their roles, before the match.
 * @param redScore - Goals of the red team.
 * @param blueScore - Goals of the blue team.
 * @param config - The variables of the system.
 * @returns The ELOs of the teams, the expected score and the changes.
 */
export function computeMatchElo(red: Lineup<EloPlayer>, blue: Lineup<EloPlayer>, redScore: number, blueScore: number, config: EloConfig): MatchElo {
  const redElo = teamElo({ attack: red.attack.elo, defense: red.defense.elo });
  const blueElo = teamElo({ attack: blue.attack.elo, defense: blue.defense.elo });

  const redExpected = expectedScore(redElo, blueElo, config);
  const blueExpected = 1 - redExpected;

  const goalMultiplier = marginMultiplier(redScore, blueScore, config);
  const winnerExpected = redScore > blueScore ? redExpected : blueExpected;
  const winnerSign = winnerExpected > 0.5 ? -1 : 1;
  // Never negative: with a huge favourite the factor would turn the sign of the change
  const surpriseFactor = Math.max(0, 1 + config.surpriseWeight * Math.abs(0.5 - winnerExpected) ** config.surpriseExponent * winnerSign);

  const redResult = redScore > blueScore ? 1 : redScore === blueScore ? 0.5 : 0;

  // Zero sum: what a team earns the other loses. The K factor is the average of the two teams, so that it is the same
  // for both (it is, when the two have the same experience)
  const k = (teamK(red, config) + teamK(blue, config)) / 2;
  let redDelta = k * goalMultiplier * (redResult - redExpected) * surpriseFactor;
  if (redResult === 1) {
    redDelta = Math.max(redDelta, config.minWinDelta);
  } else if (redResult === 0) {
    redDelta = Math.min(redDelta, -config.minWinDelta);
  }

  return { redElo, blueElo, redExpected, redDelta, blueDelta: -redDelta };
}

/**
 * Rounds to the nearest integer, a half going away from zero, as the changes of ELO are shown: the forecast of a match
 * and its saved result agree (`Math.round` takes -43.5 to -43).
 *
 * @param value - The number.
 * @returns The rounded number.
 */
export function roundAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * K factor of a player in a role: from `startK` at its first match down to `finalK` after `matchesK` matches.
 *
 * @param matches - Matches played by the player in the role.
 * @param config - The variables of the system.
 * @returns The K factor.
 */
function playerK(matches: number, config: EloConfig): number {
  return config.finalK + Math.max(0, (1 - matches / config.matchesK) * (config.startK - config.finalK));
}

/**
 * K factor of a team: the average of its players.
 *
 * @param team - The players of the team in their roles.
 * @param config - The variables of the system.
 * @returns The K factor.
 */
function teamK(team: Lineup<EloPlayer>, config: EloConfig): number {
  return (playerK(team.defense.matches, config) + playerK(team.attack.matches, config)) / 2;
}

/**
 * Weight of the goal margin: every `marginGoals` goals of difference add `marginWeight` (by default each goal adds 6.25%).
 *
 * @param goalsA - Goals of a team.
 * @param goalsB - Goals of the other team.
 * @param config - The variables of the system.
 * @returns The multiplier.
 */
function marginMultiplier(goalsA: number, goalsB: number, config: EloConfig): number {
  return 1 + (Math.abs(goalsA - goalsB) / config.marginGoals) * config.marginWeight;
}

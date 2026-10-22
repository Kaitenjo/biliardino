import type { Lineup } from '../models.ts';

/*
  The ELO system of the previous project (biliardino-elo, src/services/elo.service.ts), with two changes: each player
  has two separate ELOs, one in attack and one in defence, instead of one ELO with a malus in the role it doesn't like;
  and the K factor is lower (30, against 60 falling to 40), so that in a balanced match a result moves the ELO by 15-25
  points. In a match each player counts, and changes, only the ELO of the role it plays.
  - the K factor starts at START_K and goes down linearly to FINAL_K over the first MATCHES_K matches of a player in
    that role (the two are equal now: no boost for the new ones); a team uses the average K of its players;
  - the change is weighed by the goal margin and by a "surprise" factor: an upset is worth more, an expected win less.
*/

/**
 * K factor of a player at its first match in a role. With a 50% chance, an 8-7 moves the ELO by about 16 points and an
 * 8-0 by about 23.
 */
export const START_K = 30;

/**
 * K factor of a player once it played `MATCHES_K` matches in a role.
 */
export const FINAL_K = 30;

/**
 * Matches in a role after which the K factor of a player reaches `FINAL_K`.
 */
export const MATCHES_K = 10;

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
   * Change of the ELO in the role of each blue player.
   */
  blueDelta: number;
}

/**
 * Expected score of a team against another (its probability of winning).
 *
 * @param teamElo - ELO of the team.
 * @param opponentElo - ELO of the opponent team.
 * @returns The expected score, between 0 and 1.
 */
export function expectedScore(teamElo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - teamElo) / 400));
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
 * @returns The ELOs of the teams, the expected score and the changes.
 */
export function computeMatchElo(red: Lineup<EloPlayer>, blue: Lineup<EloPlayer>, redScore: number, blueScore: number): MatchElo {
  const redElo = teamElo({ attack: red.attack.elo, defense: red.defense.elo });
  const blueElo = teamElo({ attack: blue.attack.elo, defense: blue.defense.elo });

  const redExpected = expectedScore(redElo, blueElo);
  const blueExpected = 1 - redExpected;

  const goalMultiplier = marginMultiplier(redScore, blueScore);
  const winnerExpected = redScore > blueScore ? redExpected : blueExpected;
  const winnerSign = winnerExpected > 0.5 ? -1 : 1;
  const surpriseFactor = 1 + 3 * Math.abs(0.5 - winnerExpected) ** 1.5 * winnerSign;

  const redResult = redScore > blueScore ? 1 : redScore === blueScore ? 0.5 : 0;
  const blueResult = 1 - redResult;

  return {
    redElo,
    blueElo,
    redExpected,
    redDelta: teamK(red) * goalMultiplier * (redResult - redExpected) * surpriseFactor,
    blueDelta: teamK(blue) * goalMultiplier * (blueResult - blueExpected) * surpriseFactor
  };
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
 * K factor of a player in a role: from `START_K` at its first match down to `FINAL_K` after `MATCHES_K` matches.
 *
 * @param matches - Matches played by the player in the role.
 * @returns The K factor.
 */
function playerK(matches: number): number {
  return FINAL_K + Math.max(0, (1 - matches / MATCHES_K) * (START_K - FINAL_K));
}

/**
 * K factor of a team: the average of its players.
 *
 * @param team - The players of the team in their roles.
 * @returns The K factor.
 */
function teamK(team: Lineup<EloPlayer>): number {
  return (playerK(team.defense.matches) + playerK(team.attack.matches)) / 2;
}

/**
 * Weight of the goal margin: each goal of difference adds 6.25%.
 *
 * @param goalsA - Goals of a team.
 * @param goalsB - Goals of the other team.
 * @returns The multiplier.
 */
function marginMultiplier(goalsA: number, goalsB: number): number {
  return 1 + (Math.abs(goalsA - goalsB) / 8) * 0.5;
}

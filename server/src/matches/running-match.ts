import { get, run } from '../db/db.ts';
import { loadEloConfig } from '../elo/elo-config.ts';
import { computeMatchElo, expectedScore, roundAwayFromZero } from '../elo/elo.ts';
import type { EloPlayer } from '../elo/elo.ts';
import type { Lineup, PlayerSummary, Role } from '../models.ts';

/**
 * A player of a match to play, with its ELO in the role it plays.
 */
export interface MatchPlayer extends PlayerSummary {
  /**
   * ELO in the role, rounded.
   */
  roleElo: number;
}

/**
 * A match to play, with the ELOs and the odds.
 */
export interface MatchView {
  /**
   * Id of the generated match: a client says which one it knows, to learn that somebody else generated another.
   */
  id: number;
  /**
   * The brown team.
   */
  brown: Lineup<MatchPlayer>;
  /**
   * The white team.
   */
  white: Lineup<MatchPlayer>;
  /**
   * ELO of the brown team: the average of its players in their roles.
   */
  brownElo: number;
  /**
   * ELO of the white team.
   */
  whiteElo: number;
  /**
   * Probability that the white team wins.
   */
  whiteWinProbability: number;
  /**
   * When the match was generated (UTC, `YYYY-MM-DD HH:MM:SS`).
   */
  createdAt: string;
  /**
   * Name of the player who generated it, `null` when its user doesn't exist anymore.
   */
  generatedBy: string | null;
  /**
   * What the ELO of each player of the two teams does if the match ends 8-0 or 8-7, for each team: the extremes of
   * what can happen, computed as the saved result will be.
   */
  outcomes: MatchOutcome[];
}

/**
 * The change of ELO of each player of the two teams if the match ends with a score.
 */
export interface MatchOutcome {
  /**
   * Goals of the brown team.
   */
  brownScore: number;
  /**
   * Goals of the white team.
   */
  whiteScore: number;
  /**
   * Change of ELO of each brown player, rounded.
   */
  brownDelta: number;
  /**
   * Change of ELO of each white player, rounded.
   */
  whiteDelta: number;
}

/**
 * A player as needed to build a `MatchView`.
 */
export interface RatedPlayer extends PlayerSummary {
  /**
   * ELO in attack, not rounded.
   */
  eloAttack: number;
  /**
   * ELO in defence, not rounded.
   */
  eloDefense: number;
  /**
   * Matches played in the role it plays in the match.
   */
  roleMatches: number;
}

/**
 * A row of `running_match`, with the name of who generated it.
 */
interface RunningRow {
  /**
   * Id of the generated match.
   */
  id: number;
  /**
   * Id of the brown attacker.
   */
  brownAttack: number;
  /**
   * Id of the brown defender.
   */
  brownDefense: number;
  /**
   * Id of the white attacker.
   */
  whiteAttack: number;
  /**
   * Id of the white defender.
   */
  whiteDefense: number;
  /**
   * When it was generated.
   */
  createdAt: string;
  /**
   * Name of who generated it.
   */
  generatedBy: string | null;
}

/**
 * The match generated and not played yet. There is only one at a time.
 *
 * @returns The match, `null` when there is none.
 */
export async function getRunningMatch(): Promise<MatchView | null> {
  const row = await get<RunningRow>(
    `SELECT r.id, r.brown_attack AS brownAttack, r.brown_defense AS brownDefense, r.white_attack AS whiteAttack,
       r.white_defense AS whiteDefense, r.created_at AS createdAt, p.name AS generatedBy
     FROM running_match r
     LEFT JOIN users u ON u.id = r.created_by
     LEFT JOIN players p ON p.id = u.player_id`
  );
  return row ? await viewOf(row) : null;
}

/**
 * Stores a generated match as the match to play. The caller checks there is none.
 *
 * @param brown - The ids of the brown players.
 * @param white - The ids of the white players.
 * @param userId - The user who generated it, `null` for the automatic match of a lobby.
 * @returns The new match to play, `null` when somebody else stored one in the meantime (the table holds only one).
 */
export async function setRunningMatch(brown: Lineup<number>, white: Lineup<number>, userId: number | null): Promise<MatchView | null> {
  try {
    await run(
      'INSERT INTO running_match (brown_attack, brown_defense, white_attack, white_defense, created_by) VALUES (?, ?, ?, ?, ?)',
      brown.attack,
      brown.defense,
      white.attack,
      white.defense,
      userId
    );
  } catch {
    // The unique constraint on the only row refused it
    return null;
  }

  return getRunningMatch();
}

/**
 * Deletes the match to play: a new one can be generated, or its result saved.
 */
export async function clearRunningMatch(): Promise<void> {
  await run('DELETE FROM running_match');
}

/**
 * Builds the view of a generated match.
 *
 * @param row - The row of the match.
 * @returns The view, `null` when one of its players doesn't exist anymore.
 */
async function viewOf(row: RunningRow): Promise<MatchView | null> {
  const [brownAttack, brownDefense, whiteAttack, whiteDefense, config] = await Promise.all([
    findRatedPlayer(row.brownAttack, 'attack'),
    findRatedPlayer(row.brownDefense, 'defense'),
    findRatedPlayer(row.whiteAttack, 'attack'),
    findRatedPlayer(row.whiteDefense, 'defense'),
    loadEloConfig()
  ]);
  if (!brownAttack || !brownDefense || !whiteAttack || !whiteDefense) {
    return null;
  }

  const brown = { attack: brownAttack, defense: brownDefense };
  const white = { attack: whiteAttack, defense: whiteDefense };
  const brownElo = (brown.attack.eloAttack + brown.defense.eloDefense) / 2;
  const whiteElo = (white.attack.eloAttack + white.defense.eloDefense) / 2;
  const brownPlayers = { attack: toEloPlayer(brown.attack, 'attack'), defense: toEloPlayer(brown.defense, 'defense') };
  const whitePlayers = { attack: toEloPlayer(white.attack, 'attack'), defense: toEloPlayer(white.defense, 'defense') };
  const outcomes = ([[8, 0], [8, 7], [0, 8], [7, 8]] as const).map(([brownScore, whiteScore]) => {
    const result = computeMatchElo(brownPlayers, whitePlayers, brownScore, whiteScore, config);
    return { brownScore, whiteScore, brownDelta: roundAwayFromZero(result.brownDelta), whiteDelta: roundAwayFromZero(result.whiteDelta) };
  });
  return {
    id: row.id,
    brown: { attack: toMatchPlayer(brown.attack, 'attack'), defense: toMatchPlayer(brown.defense, 'defense') },
    white: { attack: toMatchPlayer(white.attack, 'attack'), defense: toMatchPlayer(white.defense, 'defense') },
    brownElo: Math.round(brownElo),
    whiteElo: Math.round(whiteElo),
    whiteWinProbability: expectedScore(whiteElo, brownElo, config),
    createdAt: row.createdAt,
    generatedBy: row.generatedBy,
    outcomes
  };
}

/**
 * A player as the ELO system sees it in a role: its ELO there and the matches it played there, which set its K factor.
 *
 * @param player - The player.
 * @param role - The role.
 * @returns The player in the role.
 */
function toEloPlayer(player: RatedPlayer, role: Role): EloPlayer {
  return { elo: role === 'attack' ? player.eloAttack : player.eloDefense, matches: player.roleMatches };
}

/**
 * Loads a player with its two ELOs and the matches it played in a role.
 *
 * @param id - Its id.
 * @param role - The role.
 * @returns The player, `undefined` when it doesn't exist anymore.
 */
async function findRatedPlayer(id: number, role: Role): Promise<RatedPlayer | undefined> {
  const player = await get<{ id: number; name: string; icon: string; eloAttack: number; eloDefense: number; roleMatches: number }>(
    `SELECT id, name, icon, elo_attack AS eloAttack, elo_defense AS eloDefense,
       COALESCE((SELECT matches FROM player_stats WHERE player_id = players.id AND scope = ?), 0) AS roleMatches
     FROM players WHERE id = ?`,
    role,
    id
  );
  return player && { ...player, elo: Math.round(Math.max(player.eloAttack, player.eloDefense)) };
}

/**
 * A player in a role, as shown.
 *
 * @param player - The player.
 * @param role - The role.
 * @returns The player with its ELO in the role.
 */
function toMatchPlayer(player: RatedPlayer, role: Role): MatchPlayer {
  return { id: player.id, name: player.name, icon: player.icon, elo: player.elo, roleElo: Math.round(role === 'attack' ? player.eloAttack : player.eloDefense) };
}

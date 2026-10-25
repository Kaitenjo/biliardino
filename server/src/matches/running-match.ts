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
   * The red team.
   */
  red: Lineup<MatchPlayer>;
  /**
   * The blue team.
   */
  blue: Lineup<MatchPlayer>;
  /**
   * ELO of the red team: the average of its players in their roles.
   */
  redElo: number;
  /**
   * ELO of the blue team.
   */
  blueElo: number;
  /**
   * Probability that the red team wins.
   */
  redWinProbability: number;
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
   * Goals of the red team.
   */
  redScore: number;
  /**
   * Goals of the blue team.
   */
  blueScore: number;
  /**
   * Change of ELO of each red player, rounded.
   */
  redDelta: number;
  /**
   * Change of ELO of each blue player, rounded.
   */
  blueDelta: number;
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
   * Id of the red attacker.
   */
  redAttack: number;
  /**
   * Id of the red defender.
   */
  redDefense: number;
  /**
   * Id of the blue attacker.
   */
  blueAttack: number;
  /**
   * Id of the blue defender.
   */
  blueDefense: number;
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
    `SELECT r.id, r.red_attack AS redAttack, r.red_defense AS redDefense, r.blue_attack AS blueAttack,
       r.blue_defense AS blueDefense, r.created_at AS createdAt, p.name AS generatedBy
     FROM running_match r
     LEFT JOIN users u ON u.id = r.created_by
     LEFT JOIN players p ON p.id = u.player_id`
  );
  return row ? await viewOf(row) : null;
}

/**
 * Stores a generated match as the match to play. The caller checks there is none.
 *
 * @param red - The ids of the red players.
 * @param blue - The ids of the blue players.
 * @param userId - The user who generated it, `null` for the automatic match of a lobby.
 * @returns The new match to play, `null` when somebody else stored one in the meantime (the table holds only one).
 */
export async function setRunningMatch(red: Lineup<number>, blue: Lineup<number>, userId: number | null): Promise<MatchView | null> {
  try {
    await run(
      'INSERT INTO running_match (red_attack, red_defense, blue_attack, blue_defense, created_by) VALUES (?, ?, ?, ?, ?)',
      red.attack,
      red.defense,
      blue.attack,
      blue.defense,
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
  const [redAttack, redDefense, blueAttack, blueDefense, config] = await Promise.all([
    findRatedPlayer(row.redAttack, 'attack'),
    findRatedPlayer(row.redDefense, 'defense'),
    findRatedPlayer(row.blueAttack, 'attack'),
    findRatedPlayer(row.blueDefense, 'defense'),
    loadEloConfig()
  ]);
  if (!redAttack || !redDefense || !blueAttack || !blueDefense) {
    return null;
  }

  const red = { attack: redAttack, defense: redDefense };
  const blue = { attack: blueAttack, defense: blueDefense };
  const redElo = (red.attack.eloAttack + red.defense.eloDefense) / 2;
  const blueElo = (blue.attack.eloAttack + blue.defense.eloDefense) / 2;
  const redPlayers = { attack: toEloPlayer(red.attack, 'attack'), defense: toEloPlayer(red.defense, 'defense') };
  const bluePlayers = { attack: toEloPlayer(blue.attack, 'attack'), defense: toEloPlayer(blue.defense, 'defense') };
  const outcomes = ([[8, 0], [8, 7], [0, 8], [7, 8]] as const).map(([redScore, blueScore]) => {
    const result = computeMatchElo(redPlayers, bluePlayers, redScore, blueScore, config);
    return { redScore, blueScore, redDelta: roundAwayFromZero(result.redDelta), blueDelta: roundAwayFromZero(result.blueDelta) };
  });
  return {
    id: row.id,
    red: { attack: toMatchPlayer(red.attack, 'attack'), defense: toMatchPlayer(red.defense, 'defense') },
    blue: { attack: toMatchPlayer(blue.attack, 'attack'), defense: toMatchPlayer(blue.defense, 'defense') },
    redElo: Math.round(redElo),
    blueElo: Math.round(blueElo),
    redWinProbability: expectedScore(redElo, blueElo, config),
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

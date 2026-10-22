/**
 * A team of a match.
 */
export type Team = 'red' | 'blue';

/**
 * The role of a player in a match.
 */
export type Role = 'attack' | 'defense';

/**
 * A player as shown in matches.
 */
export interface PlayerRef {
  /**
   * Id of the player.
   */
  id: number;
  /**
   * Name of the player.
   */
  name: string;
  /**
   * Icon of the player: the URL of an image or an emoji, `''` for none.
   */
  icon: string;
}

/**
 * A player with its current ELO.
 */
export interface PlayerSummary extends PlayerRef {
  /**
   * Current ELO, rounded.
   */
  elo: number;
}

/**
 * The result of a match for a player, as in the "form" column.
 */
export interface FormEntry {
  /**
   * Whether the player won.
   */
  won: boolean;
  /**
   * Change of ELO.
   */
  delta: number;
}

/**
 * How the leaderboard is ranked: by the best of the two ELOs of each player, or by its ELO in one role.
 */
export type RankingMode = 'best' | Role;

/**
 * A row of the leaderboard. `elo`, `rank`, the record, the goals and the form follow the ranking mode: in a role,
 * only the matches played in that role count.
 */
export interface LeaderboardEntry extends PlayerSummary {
  /**
   * ELO in attack.
   */
  eloAttack: number;
  /**
   * ELO in defence.
   */
  eloDefense: number;
  /**
   * Whether the player plays in attack.
   */
  playsAttack: boolean;
  /**
   * Whether the player plays in defence.
   */
  playsDefense: boolean;
  /**
   * Matches played in attack, in every mode.
   */
  matchesAttack: number;
  /**
   * Matches played in defence, in every mode.
   */
  matchesDefense: number;
  /**
   * Position, shared by players with the same ELO; `null` for players who never played (in the role).
   */
  rank: number | null;
  /**
   * Matches played.
   */
  matches: number;
  /**
   * Matches won.
   */
  wins: number;
  /**
   * Matches lost.
   */
  losses: number;
  /**
   * Goals scored by the teams of the player.
   */
  goalsFor: number;
  /**
   * Goals conceded by the teams of the player.
   */
  goalsAgainst: number;
  /**
   * The last 5 matches, oldest first.
   */
  form: FormEntry[];
  /**
   * Days of the week the player is usually available (0 = sunday … 6 = saturday).
   */
  weekdays: number[];
}

/**
 * The two players of a team, by role.
 */
export interface Lineup<TPlayer> {
  /**
   * The player in attack.
   */
  attack: TPlayer;
  /**
   * The player in defense.
   */
  defense: TPlayer;
}

/**
 * A match from the point of view of one of its players.
 */
export interface PlayerMatch {
  /**
   * Id of the match.
   */
  id: number;
  /**
   * When it was played (UTC, `YYYY-MM-DD HH:MM:SS`).
   */
  playedAt: string;
  /**
   * Goals of the red team.
   */
  redScore: number;
  /**
   * Goals of the blue team.
   */
  blueScore: number;
  /**
   * The winning team.
   */
  winner: Team;
  /**
   * The red team.
   */
  red: Lineup<PlayerRef>;
  /**
   * The blue team.
   */
  blue: Lineup<PlayerRef>;
  /**
   * The team of the player.
   */
  team: Team;
  /**
   * The role of the player.
   */
  role: Role;
  /**
   * Probability that the team of the player had of winning, according to the ELO.
   */
  expected: number;
  /**
   * ELO of the player before the match.
   */
  eloBefore: number;
  /**
   * ELO of the player in its role, malus included.
   */
  roleElo: number;
  /**
   * Change of ELO of the player.
   */
  eloDelta: number;
}

/**
 * Another player with a value, e.g. a teammate with the ELO won together.
 */
export interface PlayerResult {
  /**
   * The other player.
   */
  player: PlayerRef;
  /**
   * The value: matches together, or ELO won (lost when negative).
   */
  value: number;
}

/**
 * The statistics of a player.
 */
export interface PlayerStats {
  /**
   * Highest ELO reached.
   */
  bestElo: number;
  /**
   * Lowest ELO reached.
   */
  worstElo: number;
  /**
   * Matches in attack.
   */
  matchesAsAttack: number;
  /**
   * Matches in defence.
   */
  matchesAsDefence: number;
  /**
   * Matches won in attack.
   */
  winsAsAttack: number;
  /**
   * Matches won in defence.
   */
  winsAsDefence: number;
  /**
   * Longest run of wins.
   */
  bestWinStreak: number;
  /**
   * Longest run of defeats.
   */
  worstLossStreak: number;
  /**
   * Goals scored by the teams of the player.
   */
  goalsFor: number;
  /**
   * Goals conceded by the teams of the player.
   */
  goalsAgainst: number;
  /**
   * The teammate it played with most often (value: matches).
   */
  frequentTeammate: PlayerResult | null;
  /**
   * The teammate it won most ELO with.
   */
  bestTeammate: PlayerResult | null;
  /**
   * The teammate it lost most ELO with.
   */
  worstTeammate: PlayerResult | null;
  /**
   * The opponent it lost most ELO against.
   */
  strongestOpponent: PlayerResult | null;
  /**
   * The opponent it won most ELO against.
   */
  weakestOpponent: PlayerResult | null;
  /**
   * The win that gave most ELO.
   */
  bestVictoryByElo: PlayerMatch | null;
  /**
   * The defeat that cost most ELO.
   */
  worstDefeatByElo: PlayerMatch | null;
  /**
   * The win with the widest margin.
   */
  bestVictoryByScore: PlayerMatch | null;
  /**
   * The defeat with the widest margin.
   */
  worstDefeatByScore: PlayerMatch | null;
}

/**
 * The page of a player.
 */
export interface PlayerDetail {
  /**
   * The player, as in the leaderboard.
   */
  player: LeaderboardEntry;
  /**
   * Its statistics.
   */
  stats: PlayerStats;
  /**
   * Its ELOs in attack and in defence before the first match and after each one (in either role), oldest first:
   * the two lists have the same length.
   */
  eloHistory: Lineup<number[]>;
  /**
   * Its matches, newest first.
   */
  matches: PlayerMatch[];
}

/**
 * A player of a match to play.
 */
export interface MatchPlayer extends PlayerSummary {
  /**
   * ELO in the role it plays, malus included.
   */
  roleElo: number;
}

/**
 * The match to play: generated by the matchmaking, visible to everybody until its result is saved.
 */
export interface RunningMatch {
  /**
   * Id of the generated match: the client says which one it is showing, so that the server tells it when somebody else
   * generated another.
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
   * When it was generated (UTC, `YYYY-MM-DD HH:MM:SS`).
   */
  createdAt: string;
  /**
   * Name of the player who generated it, `null` when it doesn't exist anymore.
   */
  generatedBy: string | null;
  /**
   * What the ELO of each player of the two teams does if the match ends 8-0 or 8-7, for each team.
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
   * Change of ELO of each red player.
   */
  redDelta: number;
  /**
   * Change of ELO of each blue player.
   */
  blueDelta: number;
}

/**
 * A saved match.
 */
export interface SavedMatch {
  /**
   * Id of the match.
   */
  id: number;
  /**
   * Change of ELO of each red player.
   */
  redDelta: number;
  /**
   * Change of ELO of each blue player.
   */
  blueDelta: number;
  /**
   * Every player with its new ELO, as `fetchLeaderboard` gives them.
   */
  players: LeaderboardEntry[];
}

/**
 * The roles the logged user plays.
 */
export interface UserRoles extends Lineup<boolean> {
  /**
   * Whether they were already changed today: they can change once a day.
   */
  locked: boolean;
}

/**
 * The logged user.
 */
export interface AuthUser {
  /**
   * Id of the user.
   */
  id: number;
  /**
   * Id of its player.
   */
  playerId: number;
  /**
   * Name of its player.
   */
  name: string;
  /**
   * Icon of its player.
   */
  icon: string;
  /**
   * Whether it is the super admin, who can change the roles of anybody.
   */
  isAdmin: boolean;
}

/**
 * A player with the roles it plays, as the super admin sees it.
 */
export interface AdminPlayer extends PlayerRef, Lineup<boolean> {}

/**
 * The session opened by a login.
 */
export interface Session {
  /**
   * The token sent with each request.
   */
  token: string;
  /**
   * The logged user.
   */
  user: AuthUser;
}

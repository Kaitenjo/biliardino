/**
 * A team of a match.
 */
export type Team = 'brown' | 'white';

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
  /**
   * The role the player had.
   */
  role: Role;
  /**
   * Goals of the brown team.
   */
  brownScore: number;
  /**
   * Goals of the white team.
   */
  whiteScore: number;
  /**
   * ELO of the player in its role after the match.
   */
  elo: number;
  /**
   * The four players of the match.
   */
  players: Array<{ id: number; icon: string; name: string; team: Team; role: Role; delta: number }>;
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
   * Whether the player said it is available today (it resets each day).
   */
  availableToday: boolean;
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
   * Goals of the brown team.
   */
  brownScore: number;
  /**
   * Goals of the white team.
   */
  whiteScore: number;
  /**
   * The winning team.
   */
  winner: Team;
  /**
   * The brown team.
   */
  brown: Lineup<PlayerRef>;
  /**
   * The white team.
   */
  white: Lineup<PlayerRef>;
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
 * A played match, as a row of the list of matches.
 */
export interface MatchSummary {
  /**
   * Id of the match.
   */
  id: number;
  /**
   * When it was played (UTC, `YYYY-MM-DD HH:MM:SS`).
   */
  playedAt: string;
  /**
   * Goals of the brown team.
   */
  brownScore: number;
  /**
   * Goals of the white team.
   */
  whiteScore: number;
  /**
   * The winning team.
   */
  winner: Team;
  /**
   * The brown team.
   */
  brown: Lineup<PlayerRef>;
  /**
   * The white team.
   */
  white: Lineup<PlayerRef>;
  /**
   * Change of ELO of each brown player.
   */
  brownDelta: number;
  /**
   * Change of ELO of each white player.
   */
  whiteDelta: number;
}

/**
 * A page of the list of matches.
 */
export interface MatchPage {
  /**
   * The matches of the page, newest first.
   */
  matches: MatchSummary[];
  /**
   * The page, from 1.
   */
  page: number;
  /**
   * How many matches a page holds.
   */
  pageSize: number;
  /**
   * How many matches were played.
   */
  total: number;
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
   * ELO in the scope: the ranking one in the general scope, the one of the role otherwise.
   */
  elo: number;
  /**
   * Position in the leaderboard of the scope, `null` when it never played in it.
   */
  rank: number | null;
  /**
   * Matches played in the scope.
   */
  matches: number;
  /**
   * Matches won in the scope.
   */
  wins: number;
  /**
   * Matches lost in the scope.
   */
  losses: number;
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
   * Its statistics, by scope: all its matches, or only the ones in a role.
   */
  stats: Record<RankingMode, PlayerStats>;
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
   * Goals of the brown team.
   */
  brownScore: number;
  /**
   * Goals of the white team.
   */
  whiteScore: number;
  /**
   * Change of ELO of each brown player.
   */
  brownDelta: number;
  /**
   * Change of ELO of each white player.
   */
  whiteDelta: number;
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
   * Change of ELO of each brown player.
   */
  brownDelta: number;
  /**
   * Change of ELO of each white player.
   */
  whiteDelta: number;
  /**
   * Every player with its new ELO, as `fetchLeaderboard` gives them.
   */
  players: LeaderboardEntry[];
}

/**
 * A player in a lobby.
 */
export interface LobbyPlayer {
  /**
   * Id of the player.
   */
  id: number;
  /**
   * Its name.
   */
  name: string;
  /**
   * Its icon.
   */
  icon: string;
  /**
   * Whether it plays in attack.
   */
  playsAttack: boolean;
  /**
   * Whether it plays in defence.
   */
  playsDefense: boolean;
  /**
   * Whether the next match generated by the lobby must include it.
   */
  priority: boolean;
}

/**
 * The open lobby. The times are Italian, `HH:MM`.
 */
export interface Lobby {
  /**
   * Id of the lobby.
   */
  id: number;
  /**
   * Its day, `YYYY-MM-DD`.
   */
  day: string;
  /**
   * When it opened.
   */
  opensAt: string;
  /**
   * When the matchmaking generates the match with who is in.
   */
  matchAt: string;
  /**
   * When it closes.
   */
  closesAt: string;
  /**
   * Whether the match of its time was already generated (or tried): from now on, another one is generated on request.
   */
  matched: boolean;
  /**
   * Who is in, in order of entry.
   */
  players: LobbyPlayer[];
}

/**
 * The lobby page: the open lobby, or when the next one opens.
 */
export interface LobbyState {
  /**
   * The open lobby, `null` when there is none.
   */
  lobby: Lobby | null;
  /**
   * When the next lobby opens (Italian day and time), when none is open.
   */
  next: { day: string; opensAt: string } | null;
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
 * Every variable of the ELO system.
 */
export interface EloConfig {
  /**
   * K factor at the first match of a player in a role.
   */
  startK: number;
  /**
   * K factor after `matchesK` matches in a role.
   */
  finalK: number;
  /**
   * Matches in a role after which the K factor reaches `finalK`.
   */
  matchesK: number;
  /**
   * Scale of the expected score.
   */
  scale: number;
  /**
   * Goals of difference that add `marginWeight` to the weight of a match.
   */
  marginGoals: number;
  /**
   * Weight added by `marginGoals` goals of difference.
   */
  marginWeight: number;
  /**
   * Strength of the surprise factor, 0 turns it off.
   */
  surpriseWeight: number;
  /**
   * Exponent of the distance from a 50% chance in the surprise factor.
   */
  surpriseExponent: number;
  /**
   * Lowest probability of winning given to a team.
   */
  minWinProbability: number;
  /**
   * Least ELO that the winning team earns.
   */
  minWinDelta: number;
  /**
   * Whether the personal rule of Filippo Addabbo is on: half the points when he wins, double when he loses.
   */
  filippoRule: boolean;
}

/**
 * The ELO variables saved, with the defaults.
 */
export interface EloSettings {
  /**
   * The saved variables.
   */
  config: EloConfig;
  /**
   * The values of the system when nothing was configured.
   */
  defaults: EloConfig;
  /**
   * Allowed range of the initial ELO set for every player.
   */
  startEloLimits: { min: number; max: number };
}

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

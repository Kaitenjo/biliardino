import { all } from '../db/db.ts';
import { today } from '../dates.ts';
import type { Lineup, PlayerSummary, Role, Team } from '../models.ts';
import { emptyRecords, FORM_LENGTH, loadRecords } from './player-stats.ts';

/**
 * A player as shown in matches.
 */
export type PlayerRef = Pick<PlayerSummary, 'id' | 'name' | 'icon'>;

/**
 * How the leaderboard is ranked: by the best of the two ELOs of each player, or by its ELO in one role.
 */
export type RankingMode = 'best' | Role;

/**
 * A player of a match of the form, with what it did.
 */
export interface FormMatchPlayer {
  /**
   * Id of the player.
   */
  id: number;
  /**
   * Icon of the player.
   */
  icon: string;
  /**
   * Name of the player.
   */
  name: string;
  /**
   * Its team.
   */
  team: Team;
  /**
   * Its role.
   */
  role: Role;
  /**
   * Its change of ELO, rounded.
   */
  delta: number;
}

/**
 * A match of the "form" column, from the point of view of the player of the row.
 */
export interface FormEntry {
  /**
   * Whether the player won.
   */
  won: boolean;
  /**
   * Change of ELO of the player, rounded.
   */
  delta: number;
  /**
   * The role the player had.
   */
  role: Role;
  /**
   * Goals of the red team.
   */
  redScore: number;
  /**
   * Goals of the blue team.
   */
  blueScore: number;
  /**
   * ELO of the player in its role after the match, rounded.
   */
  elo: number;
  /**
   * The four players of the match.
   */
  players: FormMatchPlayer[];
}

/**
 * A row of the leaderboard. `elo`, `rank`, the record, the goals and the form follow the ranking mode: in a role,
 * only the matches played in that role count.
 */
export interface LeaderboardEntry extends PlayerSummary {
  /**
   * ELO in attack, rounded.
   */
  eloAttack: number;
  /**
   * ELO in defence, rounded.
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
   * Position: players with the same rounded ELO share it; `null` for players who never played (in the role).
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
   * ELO of the player before the match, rounded.
   */
  eloBefore: number;
  /**
   * ELO of the player in its role, malus included, rounded.
   */
  roleElo: number;
  /**
   * Change of ELO of the player, rounded.
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
   * The value: matches together, or ELO won (lost when negative), rounded.
   */
  value: number;
}

/**
 * The statistics of a player, as computed by the previous project (src/services/stats.service.ts).
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
   * Highest ELO reached after a match (the current one when it never played).
   */
  bestElo: number;
  /**
   * Lowest ELO reached after a match (the current one when it never played).
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
   * Its statistics, by scope: all its matches, or only the ones in a role. One answer serves every filter of the page.
   */
  stats: Record<'best' | Role, PlayerStats>;
  /**
   * Its ELOs in attack and in defence before the first match and after each one (in either role), rounded, oldest
   * first: the two lists have the same length, and the ELO of the role not played in a match stays the same.
   */
  eloHistory: Lineup<number[]>;
  /**
   * Its matches, newest first.
   */
  matches: PlayerMatch[];
}

/**
 * A row of `match_players` with its match, ELOs not rounded.
 */
interface MatchRow {
  /**
   * Id of the match.
   */
  matchId: number;
  /**
   * When it was played.
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
   * Expected score of the red team.
   */
  redExpected: number;
  /**
   * Id of the player.
   */
  playerId: number;
  /**
   * Team of the player.
   */
  team: Team;
  /**
   * Role of the player.
   */
  role: Role;
  /**
   * ELO of the player before the match.
   */
  eloBefore: number;
  /**
   * ELO of the player in its role.
   */
  roleElo: number;
  /**
   * Change of ELO of the player.
   */
  eloDelta: number;
}

/**
 * The players by ELO, with their record, their form and their rank.
 *
 * @param by - How to rank them: by the best of their two ELOs (counting only the roles they played, when they played),
 * or by their ELO in one role, counting only the matches in that role.
 * @param onlyPlayed - Whether to leave out the players who never played (in the role): the leaderboard shows only the
 * ones who did, while the pages that pick a player (login, play, availability) need everybody.
 * @returns The players, by ELO. Their records come from `player_stats`, not from the matches.
 */
export async function listLeaderboard(by: RankingMode = 'best', onlyPlayed = false): Promise<LeaderboardEntry[]> {
  const [players, records, forms] = await Promise.all([
    all<{ id: number; name: string; icon: string; eloAttack: number; eloDefense: number; playsAttack: number; playsDefense: number; availableToday: number }>(
      `SELECT id, name, icon, elo_attack AS eloAttack, elo_defense AS eloDefense, plays_attack AS playsAttack, plays_defense AS playsDefense,
         COALESCE(available_on = ?, 0) AS availableToday
       FROM players`,
      today()
    ),
    loadRecords(),
    loadForms(by)
  ]);
  const entries = new Map<number, LeaderboardEntry>();
  const exactElos = new Map<number, Lineup<number>>();
  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    const playerRecords = records.get(player.id) ?? emptyRecords();
    const record = playerRecords[by === 'best' ? 'all' : by];
    exactElos.set(player.id, { attack: player.eloAttack, defense: player.eloDefense });
    entries.set(player.id, {
      id: player.id,
      name: player.name,
      icon: player.icon,
      elo: 0,
      eloAttack: Math.round(player.eloAttack),
      eloDefense: Math.round(player.eloDefense),
      playsAttack: Boolean(player.playsAttack),
      playsDefense: Boolean(player.playsDefense),
      matchesAttack: playerRecords.attack.matches,
      matchesDefense: playerRecords.defense.matches,
      rank: null,
      matches: record.matches,
      wins: record.wins,
      losses: record.matches - record.wins,
      goalsFor: record.goalsFor,
      goalsAgainst: record.goalsAgainst,
      form: forms.get(player.id) ?? [],
      availableToday: Boolean(player.availableToday)
    });
  }

  const exact = new Map<number, number>();
  for (const entry of entries.values()) {
    const elo = rankingElo(exactElos.get(entry.id)!, entry, by);
    exact.set(entry.id, elo);
    entry.elo = Math.round(elo);
  }

  const sorted = [...entries.values()].sort((first, second) => exact.get(second.id)! - exact.get(first.id)! || first.name.localeCompare(second.name));

  // Dense ranking on the rounded ELO, as the previous project: players who never played have no rank
  let rank = 0;
  let previousElo: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]!;
    if (!entry.matches) {
      continue;
    }

    if (entry.elo !== previousElo) {
      rank++;
      previousElo = entry.elo;
    }

    entry.rank = rank;
  }

  return onlyPlayed ? sorted.filter(entry => entry.matches > 0) : sorted;
}

/**
 * The last matches of each player, with the four players of each.
 *
 * @param by - Which matches count: all of them, or only the ones in a role.
 * @returns The matches by player, oldest first.
 */
async function loadForms(by: RankingMode): Promise<Map<number, FormEntry[]>> {
  const rows = await all<{
    matchId: number;
    owner: number;
    playerId: number;
    name: string;
    icon: string;
    eloAfter: number;
    team: Team;
    role: Role;
    delta: number;
    redScore: number;
    blueScore: number;
  }>(
    `WITH last AS (
       SELECT mp.match_id, mp.player_id,
         ROW_NUMBER() OVER (PARTITION BY mp.player_id ORDER BY m.played_at DESC, m.id DESC) AS n
       FROM match_players mp JOIN matches m ON m.id = mp.match_id
       ${by === 'best' ? '' : 'WHERE mp.role = ?'}
     )
     SELECT l.match_id AS matchId, l.player_id AS owner, mp.player_id AS playerId, p.name, p.icon, mp.role_elo + mp.elo_delta AS eloAfter, mp.team, mp.role,
       mp.elo_delta AS delta, m.red_score AS redScore, m.blue_score AS blueScore
     FROM last l
     JOIN match_players mp ON mp.match_id = l.match_id
     JOIN players p ON p.id = mp.player_id
     JOIN matches m ON m.id = l.match_id
     WHERE l.n <= ${FORM_LENGTH}
     ORDER BY l.player_id, l.n DESC`,
    ...(by === 'best' ? [] : [by])
  );
  const forms = new Map<number, FormEntry[]>();
  const current = new Map<string, FormEntry>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const key = `${row.owner}-${row.matchId}`;
    let entry = current.get(key);
    if (!entry) {
      entry = { won: false, delta: 0, elo: 0, role: 'attack', redScore: row.redScore, blueScore: row.blueScore, players: [] };
      current.set(key, entry);
      const form = forms.get(row.owner);
      if (form) {
        form.push(entry);
      } else {
        forms.set(row.owner, [entry]);
      }
    }

    entry.players.push({ id: row.playerId, icon: row.icon, name: row.name, team: row.team, role: row.role, delta: Math.round(row.delta) });
    if (row.playerId === row.owner) {
      entry.role = row.role;
      entry.delta = Math.round(row.delta);
      entry.elo = Math.round(row.eloAfter);
      entry.won = (row.team === 'red') === row.redScore > row.blueScore;
    }
  }

  return forms;
}

/**
 * The ELO a player is ranked by.
 *
 * @param elos - Its exact ELOs, by role.
 * @param entry - Its row, with the matches in each role.
 * @param by - The ranking mode.
 * @returns Its ELO in the role; in the general ranking the best of the roles it played, or of both when it played none.
 */
function rankingElo(elos: Lineup<number>, entry: LeaderboardEntry, by: RankingMode): number {
  switch (by) {
    case 'attack':
      return elos.attack;
    case 'defense':
      return elos.defense;
    default:
      if (entry.matchesAttack && !entry.matchesDefense) {
        return elos.attack;
      }

      if (entry.matchesDefense && !entry.matchesAttack) {
        return elos.defense;
      }

      return Math.max(elos.attack, elos.defense);
  }
}

/**
 * The page of a player.
 *
 * @param id - The id of the player.
 * @returns The player, its statistics, its ELO history and its matches; `undefined` when it doesn't exist.
 */
export async function findPlayerDetail(id: number): Promise<PlayerDetail | undefined> {
  const [leaderboard, rows] = await Promise.all([listLeaderboard(), loadMatchRows(id)]);
  const player = leaderboard.find(entry => entry.id === id);
  if (!player) {
    return undefined;
  }

  const refs = new Map<number, PlayerRef>();
  for (let i = 0; i < leaderboard.length; i++) {
    const { id: refId, name, icon } = leaderboard[i]!;
    refs.set(refId, { id: refId, name, icon });
  }

  const byMatch = new Map<number, MatchRow[]>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const matchRows = byMatch.get(row.matchId);
    if (matchRows) {
      matchRows.push(row);
    } else {
      byMatch.set(row.matchId, [row]);
    }
  }

  const history: PlayerMatch[] = [];
  for (const matchRows of byMatch.values()) {
    const own = matchRows.find(row => row.playerId === id);
    if (own) {
      history.push(toPlayerMatch(own, matchRows, refs));
    }
  }

  const firstAttack = history.find(match => match.role === 'attack');
  const firstDefense = history.find(match => match.role === 'defense');
  const current = { attack: firstAttack ? firstAttack.eloBefore : player.eloAttack, defense: firstDefense ? firstDefense.eloBefore : player.eloDefense };
  const eloHistory = { attack: [current.attack], defense: [current.defense] };
  for (let i = 0; i < history.length; i++) {
    const match = history[i]!;
    current[match.role] = match.eloBefore + match.eloDelta;
    eloHistory.attack.push(current.attack);
    eloHistory.defense.push(current.defense);
  }

  // Rounding each step drifts from the exact values: the last points are the current ELOs
  eloHistory.attack[eloHistory.attack.length - 1] = player.eloAttack;
  eloHistory.defense[eloHistory.defense.length - 1] = player.eloDefense;

  const stats = {
    best: computeStats(player.id, player.elo, player.rank, history, byMatch, refs),
    attack: computeStats(player.id, player.eloAttack, roleRank(leaderboard, player, 'attack'), history.filter(match => match.role === 'attack'), byMatch, refs),
    defense: computeStats(player.id, player.eloDefense, roleRank(leaderboard, player, 'defense'), history.filter(match => match.role === 'defense'), byMatch, refs)
  };
  return { player, stats, eloHistory, matches: history.toReversed() };
}

/**
 * The position of a player in the leaderboard of a role, from the general leaderboard: dense on the rounded ELO of the
 * role, counting only who played in it, as `listLeaderboard` does.
 *
 * @param leaderboard - The general leaderboard.
 * @param player - The player.
 * @param role - The role.
 * @returns The position, `null` when the player never played in the role.
 */
function roleRank(leaderboard: readonly LeaderboardEntry[], player: LeaderboardEntry, role: Role): number | null {
  const matches = (entry: LeaderboardEntry): number => (role === 'attack' ? entry.matchesAttack : entry.matchesDefense);
  if (!matches(player)) {
    return null;
  }

  const elo = (entry: LeaderboardEntry): number => (role === 'attack' ? entry.eloAttack : entry.eloDefense);
  const higher = new Set<number>();
  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i]!;
    if (matches(entry) && elo(entry) > elo(player)) {
      higher.add(elo(entry));
    }
  }

  return higher.size + 1;
}

/**
 * Computes the statistics of a player from its matches, as `getPlayerStats` of the previous project.
 *
 * @param playerId - The id of the player.
 * @param elo - Its ELO in the scope, for when it never played in it.
 * @param rank - Its position in the leaderboard of the scope.
 * @param history - Its matches, oldest first.
 * @param byMatch - The rows of every match, for the exact changes of ELO.
 * @param refs - Every player, by id.
 * @returns The statistics.
 */
function computeStats(playerId: number, elo: number, rank: number | null, history: readonly PlayerMatch[], byMatch: Map<number, MatchRow[]>, refs: Map<number, PlayerRef>): PlayerStats {
  const stats: PlayerStats = {
    elo, rank, matches: history.length, wins: 0, losses: 0,
    bestElo: -Infinity, worstElo: Infinity,
    matchesAsAttack: 0, matchesAsDefence: 0, winsAsAttack: 0, winsAsDefence: 0,
    bestWinStreak: 0, worstLossStreak: 0, goalsFor: 0, goalsAgainst: 0,
    frequentTeammate: null, bestTeammate: null, worstTeammate: null, strongestOpponent: null, weakestOpponent: null,
    bestVictoryByElo: null, worstDefeatByElo: null, bestVictoryByScore: null, worstDefeatByScore: null
  };
  const teammates = new Map<number, { matches: number; delta: number }>();
  const opponents = new Map<number, number>();
  let streak = 0;
  let bestVictoryElo = -Infinity;
  let worstDefeatElo = Infinity;
  let bestVictoryScore = -1;
  let worstDefeatScore = -1;

  for (let i = 0; i < history.length; i++) {
    const match = history[i]!;
    const own = byMatch.get(match.id)!.find(row => row.playerId === playerId)!;
    const delta = own.eloDelta;
    const won = match.team === match.winner;
    stats.wins += won ? 1 : 0;
    stats.bestElo = Math.max(stats.bestElo, own.eloBefore + delta);
    stats.worstElo = Math.min(stats.worstElo, own.eloBefore + delta);

    if (match.role === 'attack') {
      stats.matchesAsAttack++;
      stats.winsAsAttack += won ? 1 : 0;
    } else {
      stats.matchesAsDefence++;
      stats.winsAsDefence += won ? 1 : 0;
    }

    streak = won ? Math.max(0, streak) + 1 : Math.min(0, streak) - 1;
    stats.bestWinStreak = Math.max(stats.bestWinStreak, streak);
    stats.worstLossStreak = Math.max(stats.worstLossStreak, -streak);

    const ownTeam = match.team === 'red' ? match.red : match.blue;
    const otherTeam = match.team === 'red' ? match.blue : match.red;
    const teammate = match.role === 'attack' ? ownTeam.defense : ownTeam.attack;
    const together = teammates.get(teammate.id);
    if (together) {
      together.matches++;
      together.delta += delta;
    } else {
      teammates.set(teammate.id, { matches: 1, delta });
    }

    opponents.set(otherTeam.attack.id, (opponents.get(otherTeam.attack.id) ?? 0) + delta);
    opponents.set(otherTeam.defense.id, (opponents.get(otherTeam.defense.id) ?? 0) + delta);

    const scoreDiff = Math.abs(match.redScore - match.blueScore);
    if (won) {
      if (delta >= bestVictoryElo) {
        stats.bestVictoryByElo = match;
        bestVictoryElo = delta;
      }

      if (scoreDiff >= bestVictoryScore) {
        stats.bestVictoryByScore = match;
        bestVictoryScore = scoreDiff;
      }
    } else {
      if (delta <= worstDefeatElo) {
        stats.worstDefeatByElo = match;
        worstDefeatElo = delta;
      }

      if (scoreDiff >= worstDefeatScore) {
        stats.worstDefeatByScore = match;
        worstDefeatScore = scoreDiff;
      }
    }

    const [goalsFor, goalsAgainst] = match.team === 'red' ? [match.redScore, match.blueScore] : [match.blueScore, match.redScore];
    stats.goalsFor += goalsFor;
    stats.goalsAgainst += goalsAgainst;
  }

  stats.losses = stats.matches - stats.wins;
  if (!history.length) {
    stats.bestElo = elo;
    stats.worstElo = elo;
  }

  stats.bestElo = Math.round(stats.bestElo);
  stats.worstElo = Math.round(stats.worstElo);
  stats.frequentTeammate = pickBest(teammates, together => together.matches, refs);
  stats.bestTeammate = pickBest(teammates, together => together.delta, refs);
  stats.worstTeammate = pickBest(teammates, together => -together.delta, refs, true);
  stats.weakestOpponent = pickBest(opponents, delta => delta, refs);
  stats.strongestOpponent = pickBest(opponents, delta => -delta, refs, true);
  return stats;
}

/**
 * Picks the player with the highest score; on a tie the first one met wins, as in the previous project.
 *
 * @param values - The values, by player.
 * @param score - Scores a value.
 * @param refs - Every player, by id.
 * @param negate - Whether the value shown is the opposite of the score (for the "worst" pickers).
 * @returns The player with its value, `null` when there is none.
 */
function pickBest<TValue>(values: Map<number, TValue>, score: (value: TValue) => number, refs: Map<number, PlayerRef>, negate = false): PlayerResult | null {
  let bestId: number | null = null;
  let bestScore = -Infinity;
  for (const [id, value] of values) {
    const current = score(value);
    if (current > bestScore) {
      bestScore = current;
      bestId = id;
    }
  }

  const player = bestId === null ? undefined : refs.get(bestId);
  return player ? { player, value: Math.round(negate ? -bestScore : bestScore) } : null;
}

/**
 * Turns the rows of a match into the point of view of one of its players.
 *
 * @param own - The row of the player.
 * @param matchRows - The rows of the match.
 * @param refs - Every player, by id.
 * @returns The match.
 */
function toPlayerMatch(own: MatchRow, matchRows: readonly MatchRow[], refs: Map<number, PlayerRef>): PlayerMatch {
  const lineup = { red: {} as Lineup<PlayerRef>, blue: {} as Lineup<PlayerRef> };
  for (let i = 0; i < matchRows.length; i++) {
    const row = matchRows[i]!;
    lineup[row.team][row.role] = refs.get(row.playerId) ?? { id: row.playerId, name: '?', icon: '' };
  }

  return {
    id: own.matchId,
    playedAt: own.playedAt,
    redScore: own.redScore,
    blueScore: own.blueScore,
    winner: own.winner,
    red: lineup.red,
    blue: lineup.blue,
    team: own.team,
    role: own.role,
    expected: own.team === 'red' ? own.redExpected : 1 - own.redExpected,
    eloBefore: Math.round(own.eloBefore),
    roleElo: Math.round(own.roleElo),
    eloDelta: Math.round(own.eloDelta)
  };
}

/**
 * Loads the matches of a player: every row of `match_players` of those matches (its own and the other three), with
 * its match, in the order the matches were played.
 *
 * @param playerId - The id of the player.
 * @returns The rows.
 */
function loadMatchRows(playerId: number): Promise<MatchRow[]> {
  return all(
    `SELECT m.id AS matchId, m.played_at AS playedAt, m.red_score AS redScore, m.blue_score AS blueScore, m.winner,
       m.red_expected AS redExpected, mp.player_id AS playerId, mp.team, mp.role,
       mp.elo_before AS eloBefore, mp.role_elo AS roleElo, mp.elo_delta AS eloDelta
     FROM match_players mp JOIN matches m ON m.id = mp.match_id
     WHERE mp.match_id IN (SELECT match_id FROM match_players WHERE player_id = ?)
     ORDER BY m.played_at, m.id`,
    playerId
  );
}

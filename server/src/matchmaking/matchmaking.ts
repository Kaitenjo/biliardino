import type { Lineup, PlayerSummary, Role } from '../models.ts';

/*
  The matchmaking of the previous project (biliardino-elo, src/services/matchmaking.service.ts). Among the available
  players it scores every match "defender A + attacker A vs defender B + attacker B" and keeps the best one:
  - match balance (40%): gap between the ELOs of the two teams, each player counted with its ELO in its role;
  - team balance (20%): gap between the two players of the same team;
  - priority (20%): players with fewer matches go first;
  - diversity (20%): pairs of teammates and of opponents seen less often go first;
  - a ±5% random factor, so the same players don't always get the same match.
  A player is proposed only in the roles it plays (attack, defence or both, chosen by the user in its profile).
*/

/**
 * A player as seen by the matchmaking.
 */
export interface MatchmakingPlayer extends PlayerSummary {
  /**
   * ELO in attack, not rounded.
   */
  eloAttack: number;
  /**
   * ELO in defence, not rounded.
   */
  eloDefense: number;
  /**
   * Whether it plays in attack.
   */
  playsAttack: boolean;
  /**
   * Whether it plays in defence.
   */
  playsDefense: boolean;
  /**
   * Matches played.
   */
  matches: number;
}

/**
 * What the matchmaking knows about the past matches.
 */
export interface MatchmakingContext {
  /**
   * Every player, by id.
   */
  players: Map<number, MatchmakingPlayer>;
  /**
   * Matches played together, by pair of players (`pairKey`).
   */
  teammates: Map<string, number>;
  /**
   * Matches played against each other, by pair of players (`pairKey`).
   */
  opponents: Map<string, number>;
}

/**
 * The match chosen by the matchmaking: team A of the previous project is the brown one.
 */
export interface MatchProposal {
  /**
   * The brown team.
   */
  brown: Lineup<MatchmakingPlayer>;
  /**
   * The white team.
   */
  white: Lineup<MatchmakingPlayer>;
}

/**
 * Weights of the matchmaking.
 */
const CONFIG = {
  /**
   * Weight of the balance between the two teams.
   */
  matchBalanceWeight: 0.4,
  /**
   * Weight of the balance between the two players of each team.
   */
  teamBalanceWeight: 0.2,
  /**
   * Weight of the players with fewer matches.
   */
  priorityWeight: 0.2,
  /**
   * Weight of the new combinations of players.
   */
  diversityWeight: 0.2,
  /**
   * The final score is multiplied by a random factor in `[1 - randomness, 1 + randomness]`.
   */
  randomness: 0.05
} as const;

/**
 * Key of a pair of players, the same in both orders.
 *
 * @param first - Id of a player.
 * @param second - Id of the other player.
 * @returns The key.
 */
export function pairKey(first: number, second: number): string {
  return first < second ? `${first}-${second}` : `${second}-${first}`;
}

/**
 * Finds the best match among the available players.
 *
 * @param context - The players and their past matches.
 * @param availableIds - The ids of the available players, at least 4.
 * @param priorityIds - The ids of the players that must play (among the available ones).
 * @param avoid - A match to leave out, with its players in the same roles and teams (in either colour); none to leave
 * out none.
 * @returns The match, `null` when no match satisfies the roles and the priorities.
 * @throws When an id is unknown.
 */
export function findBestMatch(
  context: MatchmakingContext,
  availableIds: readonly number[],
  priorityIds: readonly number[],
  avoid?: { brown: Lineup<number>; white: Lineup<number> }
): MatchProposal | null {
  if (availableIds.length < 4) {
    return null;
  }

  const available = availableIds.map(id => findPlayer(context, id));
  const priority = new Set(priorityIds.map(id => findPlayer(context, id)));
  const allPlayers = [...context.players.values()];
  const maxEloDiff = getMaxEloDifference(allPlayers);
  const maxMatches = getMaxMatchesPlayed(allPlayers);
  const maxDiversity = getMaxDiversity(context);
  const defenders: MatchmakingPlayer[] = [];
  const attackers: MatchmakingPlayer[] = [];
  splitByRole(available, defenders, attackers);

  let best: MatchProposal | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < defenders.length - 1; i++) {
    const defA = defenders[i]!;
    for (let j = 0; j < attackers.length - 1; j++) {
      const attA = attackers[j]!;
      if (attA === defA) {
        continue;
      }

      for (let k = i + 1; k < defenders.length; k++) {
        const defB = defenders[k]!;
        if (defB === attA) {
          continue;
        }

        for (let l = j + 1; l < attackers.length; l++) {
          const attB = attackers[l]!;
          if (attB === defA || attB === defB || !includesPriority(priority, defA, attA, defB, attB) || isSame(avoid, defA, attA, defB, attB)) {
            continue;
          }

          const score = scoreMatch(context, defA, attA, defB, attB, maxEloDiff, maxMatches, maxDiversity);
          if (score > bestScore) {
            bestScore = score;
            best = { brown: { defense: defA, attack: attA }, white: { defense: defB, attack: attB } };
          }
        }
      }
    }
  }

  return best;
}

/**
 * Whether a match is a given one: the same two teams, in either colour.
 *
 * @param match - The match to compare with, none for no match.
 * @param defA - The defender of a team.
 * @param attA - Its attacker.
 * @param defB - The defender of the other team.
 * @param attB - Its attacker.
 * @returns Whether it is the same.
 */
function isSame(match: { brown: Lineup<number>; white: Lineup<number> } | undefined, defA: MatchmakingPlayer, attA: MatchmakingPlayer, defB: MatchmakingPlayer, attB: MatchmakingPlayer): boolean {
  if (!match) {
    return false;
  }

  const team = (lineup: Lineup<number>, defense: MatchmakingPlayer, attack: MatchmakingPlayer): boolean => lineup.defense === defense.id && lineup.attack === attack.id;
  return (team(match.brown, defA, attA) && team(match.white, defB, attB)) || (team(match.brown, defB, attB) && team(match.white, defA, attA));
}

/**
 * Finds a player.
 *
 * @param context - The players.
 * @param id - Its id.
 * @returns The player.
 * @throws When the id is unknown.
 */
function findPlayer(context: MatchmakingContext, id: number): MatchmakingPlayer {
  const player = context.players.get(id);
  if (!player) {
    throw new Error(`Giocatore ${id} non trovato`);
  }

  return player;
}

/**
 * Whether a match includes every priority player.
 *
 * @param priority - The priority players.
 * @param players - The 4 players of the match.
 * @returns Whether none is left out.
 */
function includesPriority(priority: ReadonlySet<MatchmakingPlayer>, ...players: MatchmakingPlayer[]): boolean {
  for (const player of priority) {
    if (!players.includes(player)) {
      return false;
    }
  }

  return true;
}

/**
 * Scores a match.
 *
 * @param context - The past matches.
 * @param defA - Defender of team A.
 * @param attA - Attacker of team A.
 * @param defB - Defender of team B.
 * @param attB - Attacker of team B.
 * @param maxEloDiff - The ELO gap that counts as the worst.
 * @param maxMatches - The matches played that count as the most.
 * @param maxDiversity - The repetitions that count as the most.
 * @returns The score: the higher, the better.
 */
function scoreMatch(
  context: MatchmakingContext,
  defA: MatchmakingPlayer,
  attA: MatchmakingPlayer,
  defB: MatchmakingPlayer,
  attB: MatchmakingPlayer,
  maxEloDiff: number,
  maxMatches: number,
  maxDiversity: number
): number {
  const defAElo = playerRoleElo(defA, 'defense');
  const attAElo = playerRoleElo(attA, 'attack');
  const defBElo = playerRoleElo(defB, 'defense');
  const attBElo = playerRoleElo(attB, 'attack');

  // Balance between the teams
  const matchEloDiff = Math.abs((defAElo + attAElo) / 2 - (defBElo + attBElo) / 2);
  const matchBalanceScore = (1 - matchEloDiff / maxEloDiff) * CONFIG.matchBalanceWeight;

  // Balance inside each team
  const teamEloDiff = Math.max(Math.abs(defAElo - attAElo), Math.abs(defBElo - attBElo));
  const teamBalanceScore = (1 - Math.min(1, teamEloDiff / maxEloDiff)) * CONFIG.teamBalanceWeight;

  // Players with fewer matches
  const matches = defA.matches + attA.matches + defB.matches + attB.matches;
  const priorityScore = (1 - matches / maxMatches) * CONFIG.priorityWeight;

  // New teammates and opponents
  const teammates = (context.teammates.get(pairKey(defA.id, attA.id)) ?? 0) + (context.teammates.get(pairKey(defB.id, attB.id)) ?? 0);
  const opponents = (context.opponents.get(pairKey(defA.id, defB.id)) ?? 0)
    + (context.opponents.get(pairKey(defA.id, attB.id)) ?? 0)
    + (context.opponents.get(pairKey(attA.id, defB.id)) ?? 0)
    + (context.opponents.get(pairKey(attA.id, attB.id)) ?? 0);
  const diversityScore = (1 - (teammates + opponents) / maxDiversity) * CONFIG.diversityWeight;

  const randomness = (Math.random() * 2 - 1) * CONFIG.randomness;
  return (matchBalanceScore + teamBalanceScore + priorityScore + diversityScore) * (1 - randomness);
}

/**
 * ELO of a player in a role, not rounded.
 *
 * @param player - The player.
 * @param role - The role.
 * @returns The ELO in the role.
 */
function playerRoleElo(player: MatchmakingPlayer, role: Role): number {
  return role === 'attack' ? player.eloAttack : player.eloDefense;
}

/**
 * The ELO gap that counts as the worst: the average of the two highest ELOs minus the average of the two lowest, among
 * the ELOs of the roles each player plays.
 *
 * @param players - Every player.
 * @returns The gap, at least 1.
 */
function getMaxEloDifference(players: readonly MatchmakingPlayer[]): number {
  const elos: number[] = [];
  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    if (player.playsAttack) {
      elos.push(player.eloAttack);
    }

    if (player.playsDefense) {
      elos.push(player.eloDefense);
    }
  }

  elos.sort((first, second) => second - first);
  if (elos.length < 2) {
    return 1;
  }

  return Math.max((elos[0]! + elos[1]! - elos[elos.length - 1]! - elos[elos.length - 2]!) / 2, 1);
}

/**
 * The matches played that count as the most: those of the 4 players who played the most.
 *
 * @param players - Every player.
 * @returns The matches, at least 1.
 */
function getMaxMatchesPlayed(players: readonly MatchmakingPlayer[]): number {
  return Math.max(sumOfHighest(players.map(player => player.matches), 4), 1);
}

/**
 * The repetitions that count as the most: the 2 pairs of teammates and the 4 pairs of opponents seen most often.
 *
 * @param context - The past matches.
 * @returns The repetitions, at least 1.
 */
function getMaxDiversity(context: MatchmakingContext): number {
  return Math.max(sumOfHighest([...context.teammates.values()], 2) + sumOfHighest([...context.opponents.values()], 4), 1);
}

/**
 * Sums the highest values of a list.
 *
 * @param values - The values.
 * @param count - How many to sum.
 * @returns The sum.
 */
function sumOfHighest(values: number[], count: number): number {
  values.sort((first, second) => second - first);
  let sum = 0;
  for (let i = 0; i < Math.min(count, values.length); i++) {
    sum += values[i]!;
  }

  return sum;
}

/**
 * Splits the available players by the roles they play. A player who plays both is in both lists.
 *
 * @param players - The available players.
 * @param defenders - Receives the players who play in defence.
 * @param attackers - Receives the players who play in attack.
 */
function splitByRole(players: readonly MatchmakingPlayer[], defenders: MatchmakingPlayer[], attackers: MatchmakingPlayer[]): void {
  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    if (player.playsDefense) {
      defenders.push(player);
    }

    if (player.playsAttack) {
      attackers.push(player);
    }
  }
}

import { untracked } from '@xaendar/core/signals';
import { sessionToken, setSession } from '../auth/session';
import type { AdminPlayer, AuthUser, LeaderboardEntry, Lineup, PlayerDetail, RankingMode, RunningMatch, SavedMatch, Session, UserRoles } from './api.models';

/**
 * An error answered by the server, with its message.
 */
export class ApiError extends Error {
  /**
   * The HTTP status.
   */
  public readonly status: number;
  /**
   * What else the server answered: the match already generated, for a conflict.
   */
  public readonly data: unknown;

  /**
   * @param message - The message of the server.
   * @param status - The HTTP status.
   * @param data - The whole answer of the server.
   */
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Sends a request to the API, with the token of the session.
 *
 * @param method - The HTTP method.
 * @param path - The path, after `/api`.
 * @param body - The JSON body.
 * @param abort - Aborts the request.
 * @returns The JSON answer, `undefined` for an empty one.
 * @throws {ApiError} When the server answers with an error, or cannot be reached.
 */
async function request<TResult>(method: string, path: string, body?: unknown, abort?: AbortSignal): Promise<TResult> {
  const headers: Record<string, string> = {};
  const token = untracked(sessionToken);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? null : JSON.stringify(body), signal: abort ?? null });
  } catch (error) {
    if (abort?.aborted) {
      throw error;
    }

    throw new ApiError('Server non raggiungibile', 0);
  }

  if (response.status === 401 && token) {
    // The session expired or was closed elsewhere
    setSession(null);
  }

  const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError((data as { error?: string } | undefined)?.error ?? `Errore ${response.status}`, response.status, data);
  }

  return data as TResult;
}

/**
 * Loads the leaderboard.
 *
 * @param abort - Aborts the request.
 * @returns Every player with its record, by ELO.
 */
export function fetchLeaderboard(abort?: AbortSignal): Promise<LeaderboardEntry[]> {
  return request('GET', '/players', undefined, abort);
}

/**
 * Loads the leaderboard: the players with at least one match (in the role), by ELO.
 *
 * @param by - By the best of the two ELOs of each player, or by the ELO of a role.
 * @param abort - Aborts the request.
 * @returns The players who played, with their record.
 */
export function fetchRanking(by: RankingMode, abort?: AbortSignal): Promise<LeaderboardEntry[]> {
  return request('GET', `/players/ranking?by=${by}`, undefined, abort);
}

/**
 * Loads the page of a player.
 *
 * @param id - The id of the player.
 * @param abort - Aborts the request.
 * @returns The player, its ELO history and its last matches.
 */
export function fetchPlayer(id: number, abort?: AbortSignal): Promise<PlayerDetail> {
  return request('GET', `/players/${id}`, undefined, abort);
}

/**
 * Loads the match to play.
 *
 * @param abort - Aborts the request.
 * @returns The match, `null` when there is none.
 */
export function fetchRunningMatch(abort?: AbortSignal): Promise<RunningMatch | null> {
  return request('GET', '/matches/running', undefined, abort);
}

/**
 * Asks the server to pick the best match among the available players; it becomes the match to play.
 *
 * @param playerIds - The ids of the available players, at least 4.
 * @param priorityIds - The ids of the players that must play.
 * @returns The match.
 * @throws {ApiError} With status 409 and the match already generated in `data.running`, when there already is one.
 */
export function generateMatch(playerIds: readonly number[], priorityIds: readonly number[]): Promise<RunningMatch> {
  return request('POST', '/matches/generate', { playerIds, priorityIds });
}


/**
 * Sets the days of the week a player is usually available.
 *
 * @param playerId - The id of the player.
 * @param weekdays - The days, 0 (sunday) to 6 (saturday).
 * @returns The days stored.
 */
export function putAvailability(playerId: number, weekdays: readonly number[]): Promise<{ playerId: number; weekdays: number[] }> {
  return request('PUT', `/availability/${playerId}`, { weekdays });
}

/**
 * Drops the match to play.
 *
 * @returns When done.
 */
export function deleteRunningMatch(): Promise<void> {
  return request('DELETE', '/matches/running');
}

/**
 * Saves a played match.
 *
 * @param red - The ids of the red players.
 * @param blue - The ids of the blue players.
 * @param redScore - Goals of the red team.
 * @param blueScore - Goals of the blue team.
 * @returns The saved match, with the changes of ELO and every player with its new ELO.
 */
export function saveMatch(red: Lineup<number>, blue: Lineup<number>, redScore: number, blueScore: number): Promise<SavedMatch> {
  return request('POST', '/matches', { red, blue, redScore, blueScore });
}

/**
 * Logs in.
 *
 * @param name - The name of the player.
 * @param password - The password.
 * @returns The session.
 */
export function postLogin(name: string, password: string): Promise<Session> {
  return request('POST', '/auth/login', { name, password });
}

/**
 * Closes the session on the server.
 *
 * @returns When done.
 */
export function postLogout(): Promise<void> {
  return request('POST', '/auth/logout');
}

/**
 * Loads the logged user, checking that the session is still open.
 *
 * @returns The user.
 */
export function fetchMe(): Promise<AuthUser> {
  return request('GET', '/auth/me');
}

/**
 * Loads the roles the logged user plays.
 *
 * @returns Whether it plays in attack and in defence, and whether it already changed them today.
 */
export function fetchRoles(): Promise<UserRoles> {
  return request('GET', '/auth/roles');
}

/**
 * Sets the roles the logged user plays: at least one, and they can change once a day.
 *
 * @param roles - Whether it plays in attack and in defence.
 * @returns The roles stored.
 * @throws {ApiError} When they were already changed today.
 */
export function putRoles(roles: Lineup<boolean>): Promise<UserRoles> {
  return request('PUT', '/auth/roles', roles);
}

/**
 * Loads every player with the roles it plays. Only the super admin can.
 *
 * @returns The players, by name.
 */
export function fetchAdminRoles(): Promise<AdminPlayer[]> {
  return request('GET', '/admin/roles');
}

/**
 * Sets the roles of any player, without the limit of once a day. Only the super admin can.
 *
 * @param playerId - The id of the player.
 * @param roles - Whether it plays in attack and in defence: at least one.
 * @returns The roles stored.
 */
export function putAdminRoles(playerId: number, roles: Lineup<boolean>): Promise<Lineup<boolean> & { id: number }> {
  return request('PUT', `/admin/roles/${playerId}`, roles);
}

/**
 * Rebuilds every ELO and statistic from the matches, after a manual change to the database. Only the super admin can.
 *
 * @returns When done.
 */
export function postRecompute(): Promise<void> {
  return request('POST', '/admin/recompute');
}

/**
 * Changes the password of the logged user.
 *
 * @param currentPassword - The current password.
 * @param newPassword - The new password.
 * @returns When done.
 */
export function putPassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('PUT', '/auth/password', { currentPassword, newPassword });
}

import { untracked } from '@xaendar/core/signals';
import { sessionToken, setSession } from '../auth/session';
import type { AuthUser, EloConfig, EloSettings, LeaderboardEntry, Lineup, LobbyState, MatchPage, PlayerDetail, RankingMode, RunningMatch, SavedMatch, Session, UserRoles } from './api.models';

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
 * Loads a page of the played matches.
 *
 * @param page - The page, from 1.
 * @param size - How many matches a page holds.
 * @param abort - Aborts the request.
 * @returns The matches of the page, newest first, and how many there are in all.
 */
export function fetchMatches(page: number, size: number, abort?: AbortSignal): Promise<MatchPage> {
  return request('GET', `/matches?page=${page}&size=${size}`, undefined, abort);
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
 * Loads the open lobby, or when the next one opens.
 *
 * @param abort - Aborts the request.
 * @returns The state of the lobby page.
 */
export function fetchLobby(abort?: AbortSignal): Promise<LobbyState> {
  return request('GET', '/lobby', undefined, abort);
}

/**
 * Enters the logged player in the open lobby, or takes it out.
 *
 * @param lobbyId - The id of the lobby.
 * @param inside - Whether it enters.
 * @returns The state of the lobby page.
 * @throws {ApiError} With status 409 when the lobby closed in the meantime.
 */
export function setInLobby(lobbyId: number, inside: boolean): Promise<LobbyState> {
  return request('POST', `/lobby/${lobbyId}/${inside ? 'join' : 'leave'}`);
}

/**
 * Generates another match with who is in the open lobby, after the one of its time; its players are notified.
 *
 * @param lobbyId - The id of the lobby.
 * @returns The match to play.
 */
export function generateLobbyMatch(lobbyId: number): Promise<RunningMatch> {
  return request('POST', `/lobby/${lobbyId}/generate`);
}

/**
 * Loads the public key the browsers subscribe to the notifications with.
 *
 * @returns The VAPID key, base64url.
 */
export function fetchPushKey(): Promise<{ publicKey: string }> {
  return request('GET', '/push/key');
}

/**
 * Saves this browser as one where the logged user receives the notifications.
 *
 * @param subscription - The subscription of the browser, as `PushSubscription.toJSON()` gives it.
 * @returns When done.
 */
export function postPushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  return request('POST', '/push/subscriptions', subscription);
}

/**
 * Stops the notifications to this browser.
 *
 * @param endpoint - The endpoint of its subscription.
 * @returns When done.
 */
export function deletePushSubscription(endpoint: string): Promise<void> {
  return request('DELETE', '/push/subscriptions', { endpoint });
}

/**
 * Drops the match to play: while a lobby is open after its match, another one is generated at once with who is in it.
 *
 * @returns The new match to play, `null` when none was generated.
 */
export function deleteRunningMatch(): Promise<RunningMatch | null> {
  return request('DELETE', '/matches/running');
}

/**
 * Saves a played match: the result of the match to play.
 *
 * @param runningId - The id of the match to play.
 * @param red - The ids of the red players.
 * @param blue - The ids of the blue players.
 * @param redScore - Goals of the red team.
 * @param blueScore - Goals of the blue team.
 * @returns The saved match, with the changes of ELO and every player with its new ELO.
 * @throws {ApiError} With status 409 and the match to play now (or `null`) in `data.running`, when somebody else saved
 * or deleted it first.
 */
export function saveMatch(runningId: number, red: Lineup<number>, blue: Lineup<number>, redScore: number, blueScore: number): Promise<SavedMatch> {
  return request('POST', '/matches', { runningId, red, blue, redScore, blueScore });
}

/**
 * Logs in.
 *
 * @param name - The name of the player.
 * @param password - The password.
 * @returns The session.
 */
export function login(name: string, password: string): Promise<Session> {
  return request('POST', '/auth/login', { name, password });
}

/**
 * Closes the session on the server.
 *
 * @returns When done.
 */
export function logout(): Promise<void> {
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
 * Loads the saved variables of the ELO system. Only the super admin can.
 *
 * @returns The variables with the defaults.
 */
export function fetchEloSettings(): Promise<EloSettings> {
  return request('GET', '/admin/elo-config');
}

/**
 * Saves the variables of the ELO system and rebuilds every ELO and statistic with them. Only the super admin can.
 *
 * @param config - The variables.
 * @param startElo - The initial ELO to give to every player, `null` to keep each player's own.
 * @returns The variables saved.
 */
export function postEloRecompute(config: EloConfig, startElo: number | null): Promise<{ config: EloConfig }> {
  return request('POST', '/admin/recompute', { ...config, startElo });
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

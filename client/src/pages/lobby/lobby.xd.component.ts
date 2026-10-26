import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal, untracked } from '@xaendar/core/signals';
import {
  ApiError,
  deleteRunningMatch,
  fetchLobby,
  fetchMatches,
  fetchPlayer,
  fetchRanking,
  fetchRoles,
  fetchRunningMatch,
  generateLobbyMatch,
  putAdminRoles,
  putRoles,
  saveMatch,
  setInLobby
} from '../../core/api/api';
import type { LeaderboardEntry, LobbyState, MatchPage, PlayerDetail, RankingMode, Role, RunningMatch, SavedMatch, UserRoles } from '../../core/api/api.models';
import { user } from '../../core/auth/session';
import { navigate, route, routeName } from '../../core/router/router';
import type { PodiumPlace } from '../../ui/aquarium/aquarium.xd.component';
import type { View } from '../../ui/aquarium/scene';
import { BOARD_LINES } from '../../ui/match-board/match-board.xd.component';

/**
 * Seconds to wait between entering and leaving the lobby, so that a tap after another doesn't flood the server.
 */
const JOIN_COOLDOWN_SECONDS = 10;

/**
 * Where the panels over the scene remember being collapsed, on this device.
 */
const COLLAPSED_STORAGE_KEY = 'biliardino-collapsed';

/**
 * The panels over the scene that collapse to their first line.
 */
type Collapsible = 'lobby' | 'match';

/**
 * Reads which panels were left collapsed on this device.
 *
 * @returns The collapsed panels.
 */
function readCollapsed(): Collapsible[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((panel): panel is Collapsible => panel === 'lobby' || panel === 'match') : [];
  } catch {
    // Storage unavailable or corrupted: all panels open
    return [];
  }
}

/**
 * The 3D world, filling the page under the top bar: the home page, the lobby page and the rules page are places of it.
 *
 * The home page (`#/`) is the hall of fame, on the sea floor: a sunken temple with the first three of the leaderboard
 * on its podium, and the whole leaderboard on a panel at its side. The arrow on the right goes to the lobby
 * (`#/lobby`, which needs a login): the ocean seen through the window of a lounge, with a creature for each player in
 * the lobby. From there the arrow on the right takes the camera back into the lounge, to the foosball table where the 4
 * players of the match stand (it goes there by itself when a match is generated), the one on the left back to the
 * hall of fame, the one at the top straight on to the board of the rules (`#/rules`, open to everybody). Over the lobby: the lobby with the button to enter or leave it, and at the table the result to save and,
 * after it, whether to generate another match.
 *
 * Nothing is polled: the page reads the server when it opens, after each action, when a push notification arrives (the
 * service worker tells it: a lobby opened, a match was generated) and when the tab is shown again.
 */
@WebComponent({
  selector: 'page-lobby',
  styleUrl: './lobby.xd.component.scss',
  templateUrl: './lobby.xd.component.html'
})
export class LobbyPage extends CustomElement {
  /**
   * The open lobby, or when the next one opens; `null` until loaded.
   */
  public readonly state = signal<LobbyState | null>(null);
  /**
   * The match to play, `null` when there is none.
   */
  public readonly running = signal<RunningMatch | null>(null);
  /**
   * The last match saved from this page, `null` until one is saved.
   */
  public readonly saved = signal<SavedMatch | null>(null);
  /**
   * Whether to ask, after a saved match, if another one should be generated with who is in the lobby.
   */
  public readonly offerNext = signal(false);
  /**
   * Whether a request is in flight.
   */
  public readonly busy = signal(false);
  /**
   * The error to show, `''` when there is none.
   */
  public readonly error = signal('');
  /**
   * The open lobby, `null` when there is none.
   */
  public readonly lobby = computed(() => this.state()?.lobby ?? null);
  /**
   * Whether the logged user is in the lobby.
   */
  public readonly joined = computed(() => this.lobby()?.players.some(player => player.id === user()?.playerId) ?? false);
  /**
   * Probability that the brown team wins, 0 to 100.
   */
  public readonly brownChance = computed(() => Math.round((this.running()?.brownWinProbability ?? 0.5) * 100));
  /**
   * What the scene shows: the aquarium, or the foosball table in the lounge.
   */
  public readonly view = signal<View>(this._viewOfRoute());
  /**
   * The players of the leaderboard, as answered by the server, and how they are ranked.
   */
  public readonly ranking = signal<LeaderboardEntry[]>([]);
  public readonly rankingMode = signal<RankingMode>('best');
  /**
   * Whether the leaderboard is loading.
   */
  public readonly rankingLoading = signal(true);
  /**
   * The players by rank; those who never played come last.
   */
  public readonly ranked = computed(() => this._computeRanked());
  /**
   * The first three players, on the podium.
   */
  public readonly podium = computed(() => this._computePodium());
  /**
   * The page of the board of the matches, `null` until loaded, and the page asked for, from 1.
   */
  public readonly matchPage = signal<MatchPage | null>(null);
  public readonly matchPageNumber = signal(1);
  /**
   * How many pages of matches there are, at least 1.
   */
  public readonly matchPageCount = computed(() => this._computeMatchPageCount());
  /**
   * The roles of the logged user, `null` until loaded (or for a visitor), and whether one is being saved.
   */
  public readonly roles = signal<UserRoles | null>(null);
  public readonly savingRoles = signal(false);
  /**
   * The roles the logged user switched to, waiting for the confirmation in the card; `null` when there is none.
   */
  public readonly pendingRoles = signal<{ attack: boolean; defense: boolean } | null>(null);
  /**
   * The player on the board in front of the table, `null` until one is shown, and the scope of its figures.
   */
  public readonly profile = signal<PlayerDetail | null>(null);
  public readonly profileScope = signal<RankingMode>('best');
  /**
   * The buttons of the scopes of the board of the player.
   */
  public readonly scopes: ReadonlyArray<{ value: RankingMode; label: string; icon: string }> = [
    { value: 'best', label: 'Generale', icon: 'trophy' },
    { value: 'attack', label: 'Attacco', icon: 'attack' },
    { value: 'defense', label: 'Difesa', icon: 'defense' }
  ];
  /**
   * Whether the roles of the logged user can't change now: they change once a day, the super admin's whenever.
   */
  public readonly rolesLocked = computed(() => !user()?.isAdmin && (this.roles()?.locked ?? false));
  /**
   * The panels collapsed to their first line, to leave the scene in sight.
   */
  public readonly collapsed = signal<Collapsible[]>(readCollapsed());

  /**
   * The id of the last match to play seen: a new one takes the camera to the table.
   */
  private _seenMatch: number | null = null;
  /**
   * Seconds still to wait before entering or leaving the lobby again, 0 when it can be done.
   */
  public readonly cooldown = signal(0);
  /**
   * The timer counting the wait down.
   */
  private _cooldownTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * Aborts the request of the leaderboard of another mode in flight.
   */
  private _rankingController: AbortController | null = null;
  /**
   * Aborts the request of a page of matches in flight.
   */
  private _matchesController: AbortController | null = null;
  /**
   * Aborts the request of a player in flight.
   */
  private _profileController: AbortController | null = null;

  /**
   * Reads the page again when the tab is shown.
   */
  private readonly _onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      this._refresh().catch(() => undefined);
    }
  };
  /**
   * Reads the page again when the service worker received a notification.
   *
   * @param event - The message of the service worker.
   */
  private readonly _onWorkerMessage = (event: MessageEvent): void => {
    if ((event.data as { type?: string } | null)?.type === 'push') {
      this._refresh().catch(() => undefined);
    }
  };

  /**
   * Loads the leaderboard, the lobby and the match (again when the user logs in or out), follows the route, and listens
   * to what makes them change.
   */
  public onInit(): void {
    this.effect(() => {
      routeName();
      untracked(() => this.view.set(this._viewOfRoute()));
    });
    // The player of the route on its board; it stays there when the camera goes elsewhere
    this.effect(() => {
      const id = route().playerId;
      untracked(() => {
        if (id !== undefined && id !== this.profile()?.player.id) {
          this._loadProfile(id).catch(error => this.error.set((error as Error).message));
        }
      });
    });
    this.effect(() => {
      const id = this.running()?.id ?? null;
      untracked(() => {
        // A new match takes the camera to the table, but only from the lobby: not away from the hall of fame or the rules
        if (id !== null && id !== this._seenMatch && routeName() === 'lobby') {
          navigate('/match');
        }

        this._seenMatch = id;
      });
    });
    this.effect(() => {
      user();
      untracked(() => this._run(() => this._refresh()));
    });
    document.addEventListener('visibilitychange', this._onVisibility);
    navigator.serviceWorker?.addEventListener('message', this._onWorkerMessage);
  }

  /**
   * Stops listening.
   */
  public onDestroy(): void {
    document.removeEventListener('visibilitychange', this._onVisibility);
    navigator.serviceWorker?.removeEventListener('message', this._onWorkerMessage);
    this._rankingController?.abort();
    this._matchesController?.abort();
    this._profileController?.abort();
    if (this._cooldownTimer !== null) {
      clearInterval(this._cooldownTimer);
    }
  }

  /**
   * Waits before the next entering or leaving: the button counts the seconds down.
   */
  private _startCooldown(): void {
    this.cooldown.set(JOIN_COOLDOWN_SECONDS);
    if (this._cooldownTimer !== null) {
      clearInterval(this._cooldownTimer);
    }

    this._cooldownTimer = setInterval(() => {
      this.cooldown.update(seconds => seconds - 1);
      if (this.cooldown() <= 0 && this._cooldownTimer !== null) {
        clearInterval(this._cooldownTimer);
        this._cooldownTimer = null;
      }
    }, 1000);
  }

  /**
   * Collapses a panel to its first line, or opens it again; this device remembers it.
   *
   * @param panel - The panel.
   */
  public toggleCollapsed(panel: Collapsible): void {
    const collapsed = this.collapsed().includes(panel) ? this.collapsed().filter(other => other !== panel) : [...this.collapsed(), panel];
    this.collapsed.set(collapsed);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      // It stays collapsed until the page is reloaded
    }
  }

  /**
   * Goes to the hall of fame, the home page.
   */
  public showRanking(): void {
    navigate('/');
  }

  /**
   * Goes from the hall of fame to the lobby.
   */
  public showLobby(): void {
    navigate('/lobby');
  }

  /**
   * Ranks the leaderboard in another way, loading it from the server.
   *
   * @param mode - By the best of the two ELOs, or by the ELO of a role.
   */
  public setRankingMode(mode: RankingMode): void {
    if (mode !== this.rankingMode()) {
      this.rankingMode.set(mode);
      this._loadRanking().catch(error => this.error.set((error as Error).message));
    }
  }

  /**
   * Takes the camera to the foosball table.
   */
  public showTable(): void {
    navigate('/match');
  }

  /**
   * Takes the camera back to the aquarium.
   */
  public showAquarium(): void {
    navigate('/lobby');
  }

  /**
   * Goes to the board of the rules, on the left of the player.
   */
  public showRules(): void {
    navigate('/rules');
  }

  /**
   * The place of the scene of the page shown.
   *
   * @returns The hall of fame for the home page, the table for the match, the board for the rules, the split-flap board
   * for the matches, the board of the statistics for a player, the aquarium for the lobby.
   */
  private _viewOfRoute(): View {
    switch (routeName()) {
      case 'home':
        return 'ranking';
      case 'match':
        return 'table';
      case 'rules':
        return 'rules';
      case 'matches':
        return 'matches';
      case 'player':
        return 'stats';
      default:
        return 'aquarium';
    }
  }

  /**
   * Shows another page of the board of the matches.
   *
   * @param page - The page, from 1.
   */
  public goToMatches(page: number): void {
    if (page >= 1 && page <= this.matchPageCount() && page !== this.matchPageNumber()) {
      this.matchPageNumber.set(page);
      this._loadMatches().catch(error => this.error.set((error as Error).message));
    }
  }

  /**
   * Whether a switch of the roles of the logged user is on: as the user set it, while it waits to be confirmed.
   *
   * @param role - The role.
   * @returns Whether it is on.
   */
  public shownRole(role: Role): boolean {
    return (this.pendingRoles() ?? this.roles())?.[role] ?? false;
  }

  /**
   * Turns a role of the logged user on or off. It uses up the change of the day, so the change waits for the
   * confirmation in the card (turning it back cancels it); the super admin's is saved at once.
   *
   * @param role - The role.
   */
  public async toggleRole(role: Role): Promise<void> {
    const roles = this.roles();
    const me = user();
    if (!roles || !me || this.savingRoles() || this.rolesLocked()) {
      return;
    }

    const current = this.pendingRoles() ?? roles;
    const next = { attack: role === 'attack' ? !current.attack : current.attack, defense: role === 'defense' ? !current.defense : current.defense };
    if (!next.attack && !next.defense) {
      this.error.set('Devi giocare almeno un ruolo');
      return;
    }

    this.error.set('');
    if (me.isAdmin) {
      await this._saveRoles(next);
    } else {
      this.pendingRoles.set(next.attack === roles.attack && next.defense === roles.defense ? null : next);
    }
  }

  /**
   * Saves the roles waiting for the confirmation, using up the change of the day.
   */
  public async confirmRoles(): Promise<void> {
    const pending = this.pendingRoles();
    if (pending) {
      await this._saveRoles(pending);
    }
  }

  /**
   * Leaves the roles as they were.
   */
  public cancelRoles(): void {
    this.pendingRoles.set(null);
  }

  /**
   * Goes straight on from the table to the board of the player: the logged one.
   */
  public showProfile(): void {
    // A visitor sees the first of the leaderboard
    const id = user()?.playerId ?? this.ranked()[0]?.id;
    if (id !== undefined) {
      navigate(`/players/${id}`);
    }
  }

  /**
   * Goes back along the wall to the board of the player shown on it (the logged one, when none is).
   */
  public backToPlayer(): void {
    const id = this.profile()?.player.id;
    if (id === undefined) {
      this.showProfile();
    } else {
      navigate(`/players/${id}`);
    }
  }

  /**
   * Shows the figures of the player in a scope.
   *
   * @param scope - All its matches, or only the ones in a role.
   */
  public setProfileScope(scope: RankingMode): void {
    this.profileScope.set(scope);
  }

  /**
   * Goes to the board of the matches.
   */
  public showMatches(): void {
    navigate('/matches');
  }

  /**
   * Enters the lobby, or leaves it.
   */
  public async toggleJoin(): Promise<void> {
    const lobby = this.lobby();
    if (!lobby || this.cooldown()) {
      return;
    }

    await this._run(async () => {
      try {
        this.state.set(await setInLobby(lobby.id, !this.joined()));
        this._startCooldown();
      } catch (error) {
        // Closed in the meantime: the page shows the next one
        await this._refresh();
        throw error;
      }
    });
  }

  /**
   * Generates another match with who is in the lobby, after a saved one.
   */
  public async generateNext(): Promise<void> {
    const lobby = this.lobby();
    if (!lobby) {
      return;
    }

    await this._run(async () => {
      try {
        this.running.set(await generateLobbyMatch(lobby.id));
        this.saved.set(null);
        this.offerNext.set(false);
      } catch (error) {
        await this._refresh();
        throw error;
      }
    });
  }

  /**
   * Doesn't generate another match.
   */
  public declineNext(): void {
    this.offerNext.set(false);
  }

  /**
   * Deletes the match to play.
   */
  public async drop(): Promise<void> {
    if (!confirm("Eliminare la partita? Non verrà salvata, e se la lobby è aperta se ne genera subito un'altra.")) {
      return;
    }

    await this._run(async () => {
      // The match generated in its place, if any: its players are told by the server
      this.running.set(await deleteRunningMatch());
    });
  }

  /**
   * Saves the result of the match to play; then, while the lobby is open after its match, asks whether to generate
   * another one.
   *
   * @param event - The submission of the form.
   * @param brownScore - Goals of the brown team.
   * @param whiteScore - Goals of the white team.
   */
  public async save(event: SubmitEvent, brownScore: number, whiteScore: number): Promise<void> {
    event.preventDefault();
    const running = this.running();
    if (!running) {
      return;
    }

    if (!this._isScore(brownScore) || !this._isScore(whiteScore)) {
      this.error.set('Inserisci i goal di entrambe le squadre, da 0 a 8');
      return;
    }

    // The match ends when a team scores 8: one team has exactly 8 and the other fewer, so 7-1 or 8-8 are not results
    if (Math.max(brownScore, whiteScore) !== 8 || brownScore === whiteScore) {
      this.error.set("Si vince a 8: una squadra deve fare 8 e l'altra meno (ad esempio 8-5)");
      return;
    }

    await this._run(async () => {
      let saved: SavedMatch;
      try {
        saved = await saveMatch(
          running.id,
          { attack: running.brown.attack.id, defense: running.brown.defense.id },
          { attack: running.white.attack.id, defense: running.white.defense.id },
          brownScore,
          whiteScore
        );
      } catch (error) {
        // Somebody else saved or deleted it first: the page shows the match to play now
        const data = error instanceof ApiError && error.status === 409 ? (error.data as { running?: RunningMatch | null } | undefined) : undefined;
        if (data && 'running' in data) {
          this.running.set(data.running ?? null);
        }

        throw error;
      }

      this.saved.set(saved);
      this.running.set(null);
      this.state.set(await fetchLobby());
      await Promise.all([this._loadRanking(), this._loadMatches(), this._reloadProfile()]);
      this.offerNext.set(this.lobby()?.matched ?? false);
    });
  }

  /**
   * Formats a change of ELO with its sign.
   *
   * @param delta - The change.
   * @returns The text, e.g. `+12` or `-8`.
   */
  public formatDelta(delta: number): string {
    return delta > 0 ? `+${delta}` : String(delta);
  }

  /**
   * Names a day relative to today: `oggi`, `domani`, or its weekday and date.
   *
   * @param day - The date, `YYYY-MM-DD`.
   * @returns The text, e.g. `lunedì 27 ottobre`.
   */
  public formatDay(day: string): string {
    const date = new Date(`${day}T12:00:00Z`);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (day === todayKey) {
      return 'oggi';
    }

    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    if (day === tomorrowKey) {
      return 'domani';
    }

    return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
  }

  /**
   * Reads the leaderboard, the matches, the lobby and the roles (only for who logged in) and the match again. The match is replaced only when it
   * changed, so that the score being typed stays.
   */
  private async _refresh(): Promise<void> {
    const logged = user() !== null;
    const [state, running, roles] = await Promise.all([
      logged ? fetchLobby() : null,
      fetchRunningMatch(),
      logged ? fetchRoles() : null,
      this._loadRanking(),
      this._loadMatches()
    ]);
    this.state.set(state);
    this.roles.set(roles);
    if (running?.id !== this.running()?.id) {
      this.running.set(running);
    }
  }

  /**
   * Loads the leaderboard in its mode, aborting the previous request.
   */
  private async _loadRanking(): Promise<void> {
    this._rankingController?.abort();
    const controller = new AbortController();
    this._rankingController = controller;
    const mode = this.rankingMode();
    try {
      const players = await fetchRanking(mode, controller.signal);
      if (this.rankingMode() === mode) {
        this.ranking.set(players);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error;
      }
    } finally {
      if (this._rankingController === controller) {
        this.rankingLoading.set(false);
      }
    }
  }

  /**
   * Loads the page of the board of the matches, aborting the previous request.
   */
  private async _loadMatches(): Promise<void> {
    this._matchesController?.abort();
    const controller = new AbortController();
    this._matchesController = controller;
    try {
      this.matchPage.set(await fetchMatches(this.matchPageNumber(), BOARD_LINES, controller.signal));
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error;
      }
    }
  }

  /**
   * Saves the roles of the logged user: the super admin's whenever, the others' once a day.
   *
   * @param roles - Whether it plays in attack and in defence.
   */
  private async _saveRoles(roles: { attack: boolean; defense: boolean }): Promise<void> {
    const me = user();
    if (!me) {
      return;
    }

    this.savingRoles.set(true);
    try {
      this.roles.set(me.isAdmin ? { ...(await putAdminRoles(me.playerId, roles)), locked: false } : await putRoles(roles));
      this.pendingRoles.set(null);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.savingRoles.set(false);
    }
  }

  /**
   * Loads a player for its board, aborting the previous request.
   *
   * @param id - The id of the player.
   */
  private async _loadProfile(id: number): Promise<void> {
    this._profileController?.abort();
    const controller = new AbortController();
    this._profileController = controller;
    try {
      const detail = await fetchPlayer(id, controller.signal);
      this.profile.set(detail);
      this.profileScope.set('best');
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error;
      }
    }
  }

  /**
   * Loads again the player on the board, if any: a saved match changed its figures.
   */
  private async _reloadProfile(): Promise<void> {
    const id = this.profile()?.player.id;
    if (id !== undefined) {
      const scope = this.profileScope();
      await this._loadProfile(id);
      this.profileScope.set(scope);
    }
  }

  /**
   * Computes the value of `matchPageCount`.
   *
   * @returns How many pages hold every match, at least 1.
   */
  private _computeMatchPageCount(): number {
    const page = this.matchPage();
    return page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  }

  /**
   * Computes the value of `ranked`.
   *
   * @returns The players by rank, then those who never played by name.
   */
  private _computeRanked(): LeaderboardEntry[] {
    return this.ranking().toSorted((first, second) => {
      if (first.rank === null || second.rank === null) {
        return (first.rank === null ? 1 : 0) - (second.rank === null ? 1 : 0) || first.name.localeCompare(second.name);
      }

      return first.rank - second.rank;
    });
  }

  /**
   * Computes the value of `podium`.
   *
   * @returns The places on the steps: the 2nd on the left, the 1st in the middle, the 3rd on the right; fewer when fewer
   * players played.
   */
  private _computePodium(): PodiumPlace[] {
    const ranked = this.ranked().filter(player => player.rank !== null);
    const places: PodiumPlace[] = [];
    [1, 0, 2].forEach((index, slot) => {
      const player = ranked[index];
      if (player) {
        // Ties share the medal of their rank, as they share the rank in the leaderboard
        places.push({ player, place: Math.min(player.rank ?? 3, 3), slot });
      }
    });

    return places;
  }

  /**
   * Runs a request, tracking `busy` and showing its error.
   *
   * @param work - The request.
   */
  private async _run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Checks a score typed in the form.
   *
   * @param score - The score.
   * @returns Whether it is an integer from 0 to 8.
   */
  private _isScore(score: number): boolean {
    return Number.isInteger(score) && score >= 0 && score <= 8;
  }
}

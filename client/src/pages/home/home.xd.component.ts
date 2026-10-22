import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal } from '@xaendar/core/signals';
import { fetchRanking, fetchRunningMatch } from '../../core/api/api';
import type { LeaderboardEntry, RankingMode, RunningMatch } from '../../core/api/api.models';
import { navigate } from '../../core/router/router';

/**
 * A place of the podium.
 */
interface PodiumPlace {
  /**
   * The player.
   */
  player: LeaderboardEntry;
  /**
   * Its step, 1 to 3: its rank, so players tied in the table share it.
   */
  place: number;
}

/**
 * A button of the ranking modes.
 */
interface ModeButton {
  /**
   * The mode.
   */
  value: RankingMode;
  /**
   * Its name.
   */
  label: string;
  /**
   * Its icon.
   */
  icon: string;
}

/**
 * The home page: the presentation, the match being played, the podium and the leaderboard, ranked by the best of the
 * two ELOs of each player or by the ELO of a role. A row opens the page of its player.
 */
@WebComponent({
  selector: 'page-home',
  styleUrl: './home.xd.component.scss',
  templateUrl: './home.xd.component.html'
})
export class HomePage extends CustomElement {
  /**
   * The players of the leaderboard shown, as answered by the server.
   */
  public readonly players = signal<LeaderboardEntry[]>([]);
  /**
   * The players of the general leaderboard, for the figures of the presentation.
   */
  public readonly general = signal<LeaderboardEntry[]>([]);
  /**
   * How the leaderboard is ranked.
   */
  public readonly mode = signal<RankingMode>('best');
  /**
   * The match being played, `null` when there is none.
   */
  public readonly running = signal<RunningMatch | null>(null);
  /**
   * Whether the leaderboard is loading.
   */
  public readonly loading = signal(true);
  /**
   * The error of the last load, `''` when it succeeded.
   */
  public readonly error = signal('');
  /**
   * The players by rank; those who never played come last.
   */
  public readonly ranked = computed(() => this._computeRanked());
  /**
   * The first three players, in the order of the podium: 2nd, 1st, 3rd.
   */
  public readonly podium = computed(() => this._computePodium());
  /**
   * How many matches were played.
   */
  public readonly totalMatches = computed(() => this._computeTotalMatches());
  /**
   * How many players played at least once.
   */
  public readonly activePlayers = computed(() => this._computeActivePlayers());
  /**
   * The lowest and highest ELO of the leaderboard, for the bars of the ELO column.
   */
  public readonly eloRange = computed(() => this._computeEloRange());
  /**
   * The buttons of the ranking modes.
   */
  public readonly modes: readonly ModeButton[] = [
    { value: 'best', label: 'Generale', icon: 'trophy' },
    { value: 'attack', label: 'Attacco', icon: 'attack' },
    { value: 'defense', label: 'Difesa', icon: 'defense' }
  ];

  /**
   * Aborts the requests in flight.
   */
  private _controller: AbortController | null = null;
  /**
   * Aborts the request of the leaderboard of another mode in flight.
   */
  private _rankingController: AbortController | null = null;

  /**
   * Loads the leaderboard and the match being played.
   */
  public onInit(): void {
    this._load();
  }

  /**
   * Opens the page of a player.
   *
   * @param id - The id of the player.
   */
  public open(id: number): void {
    navigate(`/players/${id}`);
  }

  /**
   * Opens the page of a player from the keyboard.
   *
   * @param event - The key pressed on its row.
   * @param id - The id of the player.
   */
  public openOnKey(event: KeyboardEvent, id: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open(id);
    }
  }

  /**
   * Ranks the leaderboard in another way, loading it from the server.
   *
   * @param mode - By the best of the two ELOs, or by the ELO of a role.
   */
  public setMode(mode: RankingMode): void {
    if (mode !== this.mode()) {
      this.mode.set(mode);
      this._loadRanking(mode);
    }
  }

  /**
   * The roles a player plays.
   *
   * @param player - The player.
   * @returns `Attacco e difesa`, `Solo attacco` or `Solo difesa`.
   */
  public rolesLabel(player: LeaderboardEntry): string {
    if (player.playsAttack && player.playsDefense) {
      return 'Attacco e difesa';
    }

    return player.playsAttack ? 'Solo attacco' : 'Solo difesa';
  }

  /**
   * The class of the row of a player: the podium, or a player who never played.
   *
   * @param player - The player.
   * @returns `gold`, `silver`, `bronze`, `inactive` or `''`.
   */
  public rowClass(player: LeaderboardEntry): string {
    switch (player.rank) {
      case null:
        return 'inactive';
      case 1:
        return 'gold';
      case 2:
        return 'silver';
      case 3:
        return 'bronze';
      default:
        return '';
    }
  }

  /**
   * Where the ELO of a player stands between the lowest and the highest of the leaderboard.
   *
   * @param player - The player.
   * @returns The width of its bar, 6 to 100.
   */
  public eloShare(player: LeaderboardEntry): number {
    const { min, max } = this.eloRange();
    return max > min ? 6 + ((player.elo - min) / (max - min)) * 94 : 50;
  }

  /**
   * The share of matches a player won.
   *
   * @param player - The player.
   * @returns The percentage, `—` when it never played.
   */
  public winRate(player: LeaderboardEntry): string {
    return player.matches ? `${Math.round((player.wins / player.matches) * 100)}%` : '—';
  }

  /**
   * The ratio between goals scored and conceded.
   *
   * @param player - The player.
   * @returns The ratio with two decimals, `—` when it never played.
   */
  public goalRatio(player: LeaderboardEntry): string {
    return player.goalsAgainst ? (player.goalsFor / player.goalsAgainst).toFixed(2) : '—';
  }

  /**
   * The class of the goal ratio: good, bad or neither.
   *
   * @param player - The player.
   * @returns `good`, `bad` or `''`.
   */
  public ratioClass(player: LeaderboardEntry): string {
    const ratio = player.goalsAgainst ? player.goalsFor / player.goalsAgainst : 1;
    if (ratio >= 1.2) {
      return 'good';
    }

    return ratio < 0.85 ? 'bad' : '';
  }

  /**
   * The ELO won or lost in the last matches.
   *
   * @param player - The player.
   * @returns The sum of the changes, with its sign.
   */
  public formTotal(player: LeaderboardEntry): string {
    const total = player.form.reduce((sum, entry) => sum + entry.delta, 0);
    return total > 0 ? `+${total}` : String(total);
  }

  /**
   * Loads the leaderboard and the match being played, aborting the previous requests.
   */
  private async _load(): Promise<void> {
    this._controller?.abort();
    const controller = new AbortController();
    this._controller = controller;
    this.loading.set(true);
    try {
      const [players, running] = await Promise.all([fetchRanking('best', controller.signal), fetchRunningMatch(controller.signal)]);
      this.general.set(players);
      this.running.set(running);
      if (this.mode() === 'best') {
        this.players.set(players);
      }
      this.error.set('');
    } catch (error) {
      if (!controller.signal.aborted) {
        this.error.set((error as Error).message);
      }
    } finally {
      if (this._controller === controller) {
        this.loading.set(false);
      }
    }
  }

  /**
   * Loads the leaderboard of a mode, aborting the previous request.
   *
   * @param mode - The mode.
   */
  private async _loadRanking(mode: RankingMode): Promise<void> {
    this._rankingController?.abort();
    const controller = new AbortController();
    this._rankingController = controller;
    try {
      const players = mode === 'best' && this.general().length ? this.general() : await fetchRanking(mode, controller.signal);
      if (this.mode() === mode) {
        this.players.set(players);
        this.error.set('');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        this.error.set((error as Error).message);
      }
    }
  }

  /**
   * Computes the value of `ranked`.
   *
   * @returns The players by rank, then those who never played by name.
   */
  private _computeRanked(): LeaderboardEntry[] {
    return this.players().toSorted((first, second) => {
      if (first.rank === null || second.rank === null) {
        return (first.rank === null ? 1 : 0) - (second.rank === null ? 1 : 0) || first.name.localeCompare(second.name);
      }

      return first.rank - second.rank;
    });
  }

  /**
   * Computes the value of `podium`.
   *
   * @returns The places, in the order 2nd, 1st, 3rd; fewer when fewer players played.
   */
  private _computePodium(): PodiumPlace[] {
    const ranked = this.ranked().filter(player => player.rank !== null);
    const places: PodiumPlace[] = [];
    const order = [1, 0, 2];
    for (let i = 0; i < order.length; i++) {
      const player = ranked[order[i]!];
      if (player) {
        // Ties share the step of their rank, as they share the rank in the table
        places.push({ player, place: Math.min(player.rank ?? 3, 3) });
      }
    }

    return places;
  }

  /**
   * Computes the value of `totalMatches`.
   *
   * @returns How many matches were played: each one counts for its 4 players.
   */
  private _computeTotalMatches(): number {
    return Math.round(this.general().reduce((total, player) => total + player.matches, 0) / 4);
  }

  /**
   * Computes the value of `activePlayers`.
   *
   * @returns How many players played at least once.
   */
  private _computeActivePlayers(): number {
    return this.general().filter(player => player.matches > 0).length;
  }

  /**
   * Computes the value of `eloRange`.
   *
   * @returns The lowest and highest ELO.
   */
  private _computeEloRange(): { min: number; max: number } {
    const elos = this.players().map(player => player.elo);
    return { min: Math.min(...elos), max: Math.max(...elos) };
  }

  /**
   * Aborts the requests in flight, whose answers nobody would read.
   */
  public onDestroy(): void {
    this._controller?.abort();
    this._rankingController?.abort();
  }
}

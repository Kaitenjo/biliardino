import { CustomElement, Event, HostProperty, Property, WebComponent } from '@xaendar/core';
import type { Output } from '@xaendar/core';
import { computed, signal } from '@xaendar/core/signals';
import type { InputSignal } from '@xaendar/core/signals';
import type { FormEntry, LeaderboardEntry, Lineup, PlayerRef, RankingMode, Team } from '../../core/api/api.models';
import { navigate } from '../../core/router/router';

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
 * The leaderboard, on a glass panel: a row for each player, ranked by the best of the two ELOs of each player or by the
 * ELO of a role. A row opens the page of its player; the squares of the form show the match under the pointer.
 */
@WebComponent({
  selector: 'league-leaderboard',
  styleUrl: './leaderboard.xd.component.scss',
  templateUrl: './leaderboard.xd.component.html'
})
export class LeaderboardComponent extends CustomElement {
  /**
   * The players, by rank; those who never played last.
   */
  @Property.required()
  public accessor players!: InputSignal<LeaderboardEntry[]>;
  /**
   * How the players are ranked.
   */
  @Property<InputSignal<RankingMode>>('best')
  public accessor mode!: InputSignal<RankingMode>;
  /**
   * Whether the players are loading.
   */
  @Property<InputSignal<boolean>>(false)
  public accessor loading!: InputSignal<boolean>;
  /**
   * Asks to rank the players in another way.
   */
  @Event<RankingMode>()
  public accessor modeChange!: Output<RankingMode>;
  /**
   * The preview of the match under the pointer, as a list of at most one item.
   */
  public readonly preview = signal<{ entry: FormEntry; team: Team | null; x: number; y: number; below: boolean } | null>(null);
  /**
   * Whether the screen is narrow and held upright, the only case where the panel can be lowered and the rows show just
   * the icon of the player. The same query as the lobby, which gives the panel the whole height.
   */
  @HostProperty('class.upright')
  public readonly upright = signal(false);
  /**
   * Whether the panel was asked to lower to its first line.
   */
  public readonly collapsed = signal(false);
  /**
   * Whether the panel is lowered to its first line, to show the scene behind it.
   */
  @HostProperty('class.collapsed')
  public readonly lowered = computed(() => this._computeLowered());
  /**
   * The buttons of the ranking modes.
   */
  public readonly modes: readonly ModeButton[] = [
    { value: 'best', label: 'Generale', icon: 'trophy' },
    { value: 'attack', label: 'Attacco', icon: 'attack' },
    { value: 'defense', label: 'Difesa', icon: 'defense' }
  ];
  /**
   * The media query of the narrow screen held upright.
   */
  private readonly _uprightQuery = matchMedia('(max-width: 900px) and (max-aspect-ratio: 13/10)');
  /**
   * Follows the media query.
   */
  private readonly _onUprightChange = (): void => this.upright.set(this._uprightQuery.matches);

  public onInit(): void {
    this._onUprightChange();
    this._uprightQuery.addEventListener('change', this._onUprightChange);
  }

  /**
   * Lowers the panel to its first line, or raises it again.
   */
  public toggleCollapsed(): void {
    this.collapsed.set(!this.collapsed());
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
   * Asks to rank the players in another way.
   *
   * @param mode - By the best of the two ELOs, or by the ELO of a role.
   */
  public setMode(mode: RankingMode): void {
    if (mode !== this.mode()) {
      this.modeChange.emit(mode);
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
   * Shows the preview of a match of the form above or below its square.
   *
   * @param event - The pointer entering the square.
   * @param entry - The match.
   * @param playerId - The player of the row, whose team is highlighted.
   */
  public showPreview(event: PointerEvent, entry: FormEntry, playerId: number): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const team = entry.players.find(player => player.id === playerId)?.team ?? null;
    this.preview.set({ entry, team, x: rect.left + rect.width / 2, y: rect.top < 220 ? rect.bottom : rect.top, below: rect.top < 220 });
  }

  /**
   * Hides the preview of a match.
   */
  public hidePreview(): void {
    this.preview.set(null);
  }

  /**
   * A team of a match.
   *
   * @param entry - The match.
   * @param team - The team.
   * @returns Its attacker and its defender.
   */
  public lineupOf(entry: FormEntry, team: Team): Lineup<PlayerRef> {
    const attack = entry.players.find(player => player.team === team && player.role === 'attack')!;
    const defense = entry.players.find(player => player.team === team && player.role === 'defense')!;
    return { attack, defense };
  }

  private _computeLowered(): boolean {
    return this.upright() && this.collapsed();
  }

  public onDestroy(): void {
    this._uprightQuery.removeEventListener('change', this._onUprightChange);
  }
}

import { CustomElement, Event, Property, WebComponent } from '@xaendar/core';
import type { Output } from '@xaendar/core';
import { signal } from '@xaendar/core/signals';
import type { InputSignal } from '@xaendar/core/signals';
import type { FormEntry, LeaderboardEntry, RankingMode, Team } from '../../core/api/api.models';
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
  public readonly preview = signal<Array<{ entry: FormEntry; x: number; y: number; below: boolean }>>([]);
  /**
   * The buttons of the ranking modes.
   */
  public readonly modes: readonly ModeButton[] = [
    { value: 'best', label: 'Generale', icon: 'trophy' },
    { value: 'attack', label: 'Attacco', icon: 'attack' },
    { value: 'defense', label: 'Difesa', icon: 'defense' }
  ];

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
   */
  public showPreview(event: PointerEvent, entry: FormEntry): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.preview.set([{ entry, x: rect.left + rect.width / 2, y: rect.top < 220 ? rect.bottom : rect.top, below: rect.top < 220 }]);
  }

  /**
   * Hides the preview of a match.
   */
  public hidePreview(): void {
    this.preview.set([]);
  }

  /**
   * The players of a team of a match, the defender first as in the profile.
   *
   * @param entry - The match.
   * @param team - The team.
   * @returns The defender and the attacker.
   */
  public teamOf(entry: FormEntry, team: Team): FormEntry['players'] {
    return entry.players.filter(player => player.team === team).toSorted((first, second) => (first.role === second.role ? 0 : first.role === 'defense' ? -1 : 1));
  }

  /**
   * The change of ELO, with its sign.
   *
   * @param delta - The change.
   * @returns The change, with `+` when positive.
   */
  public formatDelta(delta: number): string {
    return delta > 0 ? `+${delta}` : String(delta);
  }
}

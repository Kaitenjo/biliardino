import { CustomElement, Event, Property, WebComponent } from '@xaendar/core';
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
 * What the rows can be sorted by.
 */
type SortKey = 'rank' | 'name' | 'elo' | 'record' | 'goals' | 'form';

/**
 * A header of the table.
 */
interface ColumnHeader {
  /**
   * What it sorts the rows by.
   */
  key: SortKey;
  /**
   * Its name.
   */
  label: string;
  /**
   * What the column shows.
   */
  hint: string;
  /**
   * The classes of its cell.
   */
  className: string;
  /**
   * Whether the first click sorts from the highest value.
   */
  descending: boolean;
}

/**
 * The leaderboard, on a glass panel: a row for each player, ranked by the best of the two ELOs of each player or by the
 * ELO of a role. A row opens the page of its player; a header sorts the rows by its column, the squares of the form show
 * the match under the pointer.
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
   * The buttons of the ranking modes.
   */
  public readonly modes: readonly ModeButton[] = [
    { value: 'best', label: 'Generale', icon: 'trophy' },
    { value: 'attack', label: 'Attacco', icon: 'attack' },
    { value: 'defense', label: 'Difesa', icon: 'defense' }
  ];
  /**
   * The headers of the table.
   */
  public readonly columns: readonly ColumnHeader[] = [
    { key: 'rank', label: '#', hint: 'Posizione in classifica', className: 'rank', descending: false },
    { key: 'name', label: 'Giocatore', hint: 'Giocatore e ruoli che gioca', className: '', descending: false },
    { key: 'elo', label: 'Elo', hint: 'ELO su cui si basa la classifica', className: 'num', descending: true },
    { key: 'record', label: 'V / S', hint: 'Vittorie / Sconfitte e percentuale di vittorie', className: 'num', descending: true },
    { key: 'goals', label: 'Goal', hint: 'Rapporto goal fatti/subiti', className: 'num ratio-col', descending: true },
    { key: 'form', label: 'Forma', hint: 'Ultime 5 partite', className: 'form-col', descending: true }
  ];
  /**
   * The column the rows are sorted by, and in which direction.
   */
  public readonly sort = signal<{ key: SortKey; descending: boolean }>({ key: 'rank', descending: false });
  /**
   * The rows, in the order asked; those who never played always last.
   */
  public readonly sorted = computed(() => this._computeSorted());

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
   * Sorts the rows by a column: the first click in its direction, the second in the other one, the third back by rank.
   *
   * @param column - The header clicked.
   */
  public sortBy(column: ColumnHeader): void {
    const { key, descending } = this.sort();
    if (key !== column.key) {
      this.sort.set({ key: column.key, descending: column.descending });
    } else if (descending === column.descending) {
      this.sort.set({ key, descending: !descending });
    } else {
      this.sort.set({ key: 'rank', descending: false });
    }
  }

  /**
   * How a column sorts the rows, for screen readers.
   *
   * @param key - The column.
   * @returns `ascending`, `descending` or `none`.
   */
  public sortState(key: SortKey): string {
    const sort = this.sort();
    if (sort.key !== key) {
      return 'none';
    }

    return sort.descending ? 'descending' : 'ascending';
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
    const total = this._formSum(player);
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

  private _computeSorted(): LeaderboardEntry[] {
    const { key, descending } = this.sort();
    const direction = descending ? -1 : 1;
    return this.players().slice().sort((first, second) => Number(first.rank === null) - Number(second.rank === null) || direction * this._compare(first, second, key));
  }

  /**
   * Compares two players by a column. Those it cannot tell apart stay in the order of the ranking.
   *
   * @param first - A player.
   * @param second - The other one.
   * @param key - The column.
   * @returns A negative number when the first has the lower value, a positive one when it has the higher one, `0` if equal.
   */
  private _compare(first: LeaderboardEntry, second: LeaderboardEntry, key: SortKey): number {
    switch (key) {
      case 'rank':
        return (first.rank ?? 0) - (second.rank ?? 0);
      case 'name':
        return first.name.localeCompare(second.name);
      case 'elo':
        return first.elo - second.elo;
      case 'record':
        return this._winShare(first) - this._winShare(second);
      case 'goals':
        return this._goalShare(first) - this._goalShare(second);
      case 'form':
        return this._formSum(first) - this._formSum(second);
    }
  }

  /**
   * The share of matches a player won.
   *
   * @param player - The player.
   * @returns A number from 0 to 1, 0 when it never played.
   */
  private _winShare(player: LeaderboardEntry): number {
    return player.matches ? player.wins / player.matches : 0;
  }

  /**
   * The ratio between goals scored and conceded.
   *
   * @param player - The player.
   * @returns The ratio, 0 when it conceded none: the table shows no ratio then.
   */
  private _goalShare(player: LeaderboardEntry): number {
    return player.goalsAgainst ? player.goalsFor / player.goalsAgainst : 0;
  }

  /**
   * The ELO won or lost in the last matches.
   *
   * @param player - The player.
   * @returns The sum of the changes.
   */
  private _formSum(player: LeaderboardEntry): number {
    return player.form.reduce((sum, entry) => sum + entry.delta, 0);
  }
}

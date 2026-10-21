import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal } from '@xaendar/core/signals';
import { fetchLeaderboard, putAvailability } from '../../core/api/api';
import type { LeaderboardEntry } from '../../core/api/api.models';
import { user } from '../../core/auth/session';

/**
 * A day of the grid.
 */
interface Weekday {
  /**
   * The day, 0 (sunday) to 6 (saturday), as `Date.getDay()`.
   */
  value: number;
  /**
   * Its short name.
   */
  short: string;
  /**
   * Its name.
   */
  name: string;
}

/**
 * The availability page: a grid of players and working days, where a tap tells whether a player is usually at the
 * office that day. The play page picks the players available today.
 */
@WebComponent({
  selector: 'page-availability',
  styleUrl: './availability.xd.component.scss',
  templateUrl: './availability.xd.component.html'
})
export class AvailabilityPage extends CustomElement {
  /**
   * Every player, with its days.
   */
  public readonly players = signal<LeaderboardEntry[]>([]);
  /**
   * Whether the players are loading.
   */
  public readonly loading = signal(true);
  /**
   * The error to show, `''` when there is none.
   */
  public readonly error = signal('');
  /**
   * The text typed in the search field.
   */
  public readonly query = signal('');
  /**
   * The cells being saved, as `<player id>-<day>`.
   */
  public readonly saving = signal<ReadonlySet<string>>(new Set());
  /**
   * The players shown: the logged one first, then the others by name, filtered by the search.
   */
  public readonly rows = computed(() => this._computeRows());
  /**
   * How many players are available each day, in the order of `days`.
   */
  public readonly counts = computed(() => this._computeCounts());
  /**
   * The working days.
   */
  public readonly days: readonly Weekday[] = [
    { value: 1, short: 'Lun', name: 'lunedì' },
    { value: 2, short: 'Mar', name: 'martedì' },
    { value: 3, short: 'Mer', name: 'mercoledì' },
    { value: 4, short: 'Gio', name: 'giovedì' },
    { value: 5, short: 'Ven', name: 'venerdì' }
  ];
  /**
   * Today, 0 (sunday) to 6 (saturday).
   */
  public readonly today = new Date().getDay();

  /**
   * Loads the players.
   */
  public onInit(): void {
    this._load();
  }

  /**
   * Whether a player is available on a day.
   *
   * @param player - The player.
   * @param day - The day.
   * @returns Whether it is.
   */
  public isOn(player: LeaderboardEntry, day: number): boolean {
    return player.weekdays.includes(day);
  }

  /**
   * Whether a cell is being saved.
   *
   * @param playerId - The id of the player.
   * @param day - The day.
   * @returns Whether it is.
   */
  public isSaving(playerId: number, day: number): boolean {
    return this.saving().has(`${playerId}-${day}`);
  }

  /**
   * Whether a player is the logged user.
   *
   * @param player - The player.
   * @returns Whether it is.
   */
  public isMe(player: LeaderboardEntry): boolean {
    return user()?.playerId === player.id;
  }

  /**
   * Filters the players by name.
   *
   * @param event - The input of the search field.
   */
  public search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /**
   * Makes a player available on a day, or not available anymore. The grid changes at once; if the server refuses,
   * it goes back.
   *
   * @param playerId - The id of the player.
   * @param day - The day.
   */
  public async toggle(playerId: number, day: number): Promise<void> {
    const player = this.players().find(candidate => candidate.id === playerId);
    if (!player || this.isSaving(playerId, day)) {
      return;
    }

    const previous = player.weekdays;
    const next = previous.includes(day) ? previous.filter(weekday => weekday !== day) : [...previous, day].sort();
    const key = `${playerId}-${day}`;
    this._setWeekdays(playerId, next);
    this.saving.update(saving => new Set(saving).add(key));
    this.error.set('');
    try {
      const saved = await putAvailability(playerId, next);
      this._setWeekdays(playerId, saved.weekdays);
    } catch (error) {
      this._setWeekdays(playerId, previous);
      this.error.set((error as Error).message);
    } finally {
      this.saving.update(saving => {
        const remaining = new Set(saving);
        remaining.delete(key);
        return remaining;
      });
    }
  }

  /**
   * Loads the players.
   */
  private async _load(): Promise<void> {
    try {
      this.players.set(await fetchLeaderboard());
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Replaces the days of a player.
   *
   * @param playerId - The id of the player.
   * @param weekdays - Its days.
   */
  private _setWeekdays(playerId: number, weekdays: number[]): void {
    this.players.update(players => players.map(player => (player.id === playerId ? { ...player, weekdays } : player)));
  }

  /**
   * Computes the value of `rows`.
   *
   * @returns The players shown.
   */
  private _computeRows(): LeaderboardEntry[] {
    const query = this.query().trim().toLowerCase();
    const me = user()?.playerId;
    return this.players()
      .filter(player => !query || player.name.toLowerCase().includes(query))
      .sort((first, second) => Number(second.id === me) - Number(first.id === me) || first.name.localeCompare(second.name));
  }

  /**
   * Computes the value of `counts`.
   *
   * @returns The number of available players of each day.
   */
  private _computeCounts(): number[] {
    const players = this.players();
    return this.days.map(day => players.filter(player => player.weekdays.includes(day.value)).length);
  }
}

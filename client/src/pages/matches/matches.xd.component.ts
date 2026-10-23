import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal } from '@xaendar/core/signals';
import { fetchMatches } from '../../core/api/api';
import type { MatchPage, MatchSummary } from '../../core/api/api.models';

/**
 * The list of the played matches, newest first, a page at a time.
 */
@WebComponent({
  selector: 'page-matches',
  styleUrl: './matches.xd.component.scss',
  templateUrl: './matches.xd.component.html'
})
export class MatchesPage extends CustomElement {
  /**
   * The page shown, `null` until it is loaded.
   */
  public readonly data = signal<MatchPage | null>(null);
  /**
   * The page requested, from 1.
   */
  public readonly page = signal(1);
  /**
   * Whether a page is loading.
   */
  public readonly loading = signal(true);
  /**
   * The error of the last load, `''` when it succeeded.
   */
  public readonly error = signal('');
  /**
   * The matches of the page shown.
   */
  public readonly rows = computed(() => this.data()?.matches ?? []);
  /**
   * How many pages there are, at least 1.
   */
  public readonly pageCount = computed(() => this._computePageCount());

  /**
   * Aborts the request in flight.
   */
  private _controller: AbortController | null = null;

  /**
   * Loads the first page.
   */
  public onInit(): void {
    this._load(1);
  }

  /**
   * Shows another page.
   *
   * @param page - The page, from 1.
   */
  public goTo(page: number): void {
    if (page >= 1 && page <= this.pageCount() && page !== this.page()) {
      this._load(page);
    }
  }

  /**
   * The day a match was played.
   *
   * @param match - The match.
   * @returns The date in Italian time, e.g. `23/10/2026`.
   */
  public formatDate(match: MatchSummary): string {
    return new Date(`${match.playedAt.replace(' ', 'T')}Z`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
   * Loads a page, aborting the previous request.
   *
   * @param page - The page, from 1.
   */
  private async _load(page: number): Promise<void> {
    this._controller?.abort();
    const controller = new AbortController();
    this._controller = controller;
    this.page.set(page);
    this.loading.set(true);
    try {
      this.data.set(await fetchMatches(page, controller.signal));
      this.error.set('');
      window.scrollTo({ top: 0 });
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
   * Computes the value of `pageCount`.
   *
   * @returns How many pages hold every match, at least 1.
   */
  private _computePageCount(): number {
    const data = this.data();
    return data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  }

  /**
   * Aborts the request in flight, whose answer nobody would read.
   */
  public onDestroy(): void {
    this._controller?.abort();
  }
}

import { CustomElement, Property, WebComponent } from '@xaendar/core';
import { signal } from '@xaendar/core/signals';
import type { InputSignal } from '@xaendar/core/signals';
import type { MatchSummary } from '../../core/api/api.models';

/**
 * Lines of matches on the board: a page holds as many.
 */
export const BOARD_LINES = 10;

/**
 * The blackboard of the matches: a line in chalk for each match of the page, newest first, with its day, the icons of
 * the two teams (defender and attacker), the result and the ELO won. No names: the icons tell the players.
 *
 * It fills its box; the 3D scene puts it over the face of the board on the back wall of the lounge.
 */
@WebComponent({
  selector: 'match-board',
  styleUrl: './match-board.xd.component.scss',
  templateUrl: './match-board.xd.component.html'
})
export class MatchBoardComponent extends CustomElement {
  /**
   * The matches of the page, newest first (not `matches`: elements already have it).
   */
  @Property.required()
  public accessor games!: InputSignal<MatchSummary[]>;
  /**
   * The page shown, from 1, how many pages there are, and how many matches were played.
   */
  @Property<InputSignal<number>>(1)
  public accessor page!: InputSignal<number>;
  @Property<InputSignal<number>>(1)
  public accessor pageCount!: InputSignal<number>;
  @Property<InputSignal<number>>(0)
  public accessor total!: InputSignal<number>;

  /**
   * The match under the pointer, `null` for none.
   */
  public readonly hovered = signal<MatchSummary | null>(null);

  /**
   * Shows the match under the pointer in the middle of the board.
   *
   * @param match - The match.
   */
  public show(match: MatchSummary): void {
    this.hovered.set(match);
  }

  /**
   * Hides the match.
   */
  public hide(): void {
    this.hovered.set(null);
  }

  /**
   * The ELO the winners won.
   *
   * @param match - The match.
   * @returns The change of each winner.
   */
  public gain(match: MatchSummary): number {
    return match.winner === 'brown' ? match.brownDelta : match.whiteDelta;
  }

  /**
   * The day of a match.
   *
   * @param playedAt - When it was played, in UTC (`YYYY-MM-DD HH:MM:SS`).
   * @returns The day in Italian time, e.g. `23/10`.
   */
  public formatDay(playedAt: string): string {
    return new Date(`${playedAt.replace(' ', 'T')}Z`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  }

  /**
   * The ELO the winners won, with its sign.
   *
   * @param match - The match.
   * @returns The text, e.g. `+12`.
   */
  public formatDelta(match: MatchSummary): string {
    const delta = this.gain(match);
    return delta > 0 ? `+${delta}` : String(delta);
  }
}

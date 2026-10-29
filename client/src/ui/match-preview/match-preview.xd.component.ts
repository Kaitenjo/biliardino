import { CustomElement, Property, WebComponent } from '@xaendar/core';
import { computed } from '@xaendar/core/signals';
import type { InputSignal } from '@xaendar/core/signals';
import type { Lineup, PlayerRef, Team } from '../../core/api/api.models';

/**
 * The summary of a played match, in chalk on a dark green slate: the day and the ELO won or lost, the two teams with
 * the icon of each player and its role, and the result. Shown over the lines of the board of the matches, the points
 * of the chart of a player and the squares of the form in the leaderboard.
 *
 * It is sized on its font size, and placed by who shows it.
 */
@WebComponent({
  selector: 'match-preview',
  styleUrl: './match-preview.xd.component.scss',
  templateUrl: './match-preview.xd.component.html'
})
export class MatchPreviewComponent extends CustomElement {
  /**
   * The two teams.
   */
  @Property.required()
  public accessor white!: InputSignal<Lineup<PlayerRef>>;
  @Property.required()
  public accessor brown!: InputSignal<Lineup<PlayerRef>>;
  /**
   * The goals of each team.
   */
  @Property<InputSignal<number>>(0)
  public accessor whiteScore!: InputSignal<number>;
  @Property<InputSignal<number>>(0)
  public accessor brownScore!: InputSignal<number>;
  /**
   * The change of ELO shown.
   */
  @Property<InputSignal<number>>(0)
  public accessor delta!: InputSignal<number>;
  /**
   * The ELO of the player after the match; `null` to show none.
   */
  @Property<InputSignal<number | null>>(null)
  public accessor elo!: InputSignal<number | null>;
  /**
   * The team of the player the match is seen from, highlighted; `null` to highlight the winners.
   */
  @Property<InputSignal<Team | null>>(null)
  public accessor team!: InputSignal<Team | null>;
  /**
   * The team highlighted.
   */
  public readonly highlighted = computed(() => this._computeHighlighted());

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
   * The change of ELO, with its sign.
   *
   * @param delta - The change.
   * @returns The text, e.g. `+12` or `-8`.
   */
  public formatDelta(delta: number): string {
    return delta > 0 ? `+${delta}` : String(delta);
  }

  /**
   * Computes the value of `highlighted`.
   *
   * @returns The team of the player, or the winners.
   */
  private _computeHighlighted(): Team {
    return this.team() ?? (this.brownScore() > this.whiteScore() ? 'brown' : 'white');
  }
}

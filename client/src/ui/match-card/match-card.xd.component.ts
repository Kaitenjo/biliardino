import { CustomElement, Property, WebComponent } from '@xaendar/core';
import { computed } from '@xaendar/core/signals';
import type { InputSignal } from '@xaendar/core/signals';
import type { MatchOutcome, RunningMatch } from '../../core/api/api.models';

/**
 * A match to play: the two teams face to face, each player with its role and its ELO in the role, the odds below, and
 * what the ELO of each team does if the match ends 8-0 or 8-7. Whatever is put inside the element (e.g. the form of
 * the result) is shown under them.
 */
@WebComponent({
  selector: 'match-card',
  styleUrl: './match-card.xd.component.scss',
  templateUrl: './match-card.xd.component.html'
})
export class MatchCardComponent extends CustomElement {
  /**
   * The match.
   */
  @Property.required()
  public accessor match!: InputSignal<RunningMatch>;
  /**
   * Probability that the red team wins, 0 to 100.
   */
  public readonly redChance = computed(() => this._computeRedChance());
  /**
   * The results the red team wins, 8-0 and 8-7.
   */
  public readonly redWins = computed(() => this._computeOutcomes(true));
  /**
   * The results the blue team wins, 0-8 and 7-8.
   */
  public readonly blueWins = computed(() => this._computeOutcomes(false));

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
   * Computes the value of `redWins` and `blueWins`.
   *
   * @param redWon - Whether the red team is the winner.
   * @returns The two results won by the team, the wider first.
   */
  private _computeOutcomes(redWon: boolean): MatchOutcome[] {
    return this.match().outcomes.filter(outcome => (outcome.redScore > outcome.blueScore) === redWon);
  }

  /**
   * Computes the value of `redChance`.
   *
   * @returns The percentage, rounded.
   */
  private _computeRedChance(): number {
    return Math.round(this.match().redWinProbability * 100);
  }
}

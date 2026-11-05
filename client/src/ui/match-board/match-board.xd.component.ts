import { CustomElement, Property, WebComponent } from '@xaendar/core';
import type { InputSignal } from '@xaendar/core/signals';
import type { MatchSummary, PlayerMatch } from '../../core/api/api.models';
import { navigate } from '../../core/router/router';

/**
 * Lines of matches on the board: a page holds as many.
 */
export const BOARD_LINES = 10;

/**
 * A line of the board: a match of the list of all of them, or a match of a player (its history).
 */
export type BoardMatch = MatchSummary | PlayerMatch;

/**
 * The blackboard of the matches: a line in chalk for each match of the page, newest first, with its day, the icons of
 * the two teams (defender and attacker), the result and the ELO: won by the winners in the list of all the matches,
 * won or lost by the player in its history. No names: the icons tell the players.
 *
 * It fills its box, and is sized on it: the 3D scene puts the list of all the matches over the face of the board on the
 * back wall of the lounge, and the history of a player under the figures of its board.
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
  public accessor games!: InputSignal<BoardMatch[]>;
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
   * What the board is, for screen readers.
   */
  @Property('Lavagna delle partite')
  public accessor caption!: InputSignal<string>;

  /**
   * The ELO of a line: won by the winners, or won or lost by the player in its history.
   *
   * @param match - The match.
   * @returns The change of each winner, or of the player.
   */
  public gain(match: BoardMatch): number {
    if ('eloDelta' in match) {
      return match.eloDelta;
    }

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
   * The ELO of a line, with its sign.
   *
   * @param match - The match.
   * @returns The text, e.g. `+12`.
   */
  public formatDelta(match: BoardMatch): string {
    const delta = this.gain(match);
    return delta > 0 ? `+${delta}` : String(delta);
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
   * @param event - The key pressed on its icon.
   * @param id - The id of the player.
   */
  public openOnKey(event: KeyboardEvent, id: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.open(id);
    }
  }
}

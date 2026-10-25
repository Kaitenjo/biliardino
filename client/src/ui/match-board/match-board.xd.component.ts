import { CustomElement, Property, WebComponent } from '@xaendar/core';
import { computed, signal, untracked } from '@xaendar/core/signals';
import type { InputSignal } from '@xaendar/core/signals';
import type { MatchSummary, PlayerRef } from '../../core/api/api.models';

/**
 * A piece of a line of the board: its text, as many flaps as its letters, its colour, and for a name the player, whose
 * icon is shown before it.
 */
interface Segment {
  text: string;
  tone: string;
  player?: PlayerRef | null;
}

/**
 * Lines of matches on the board: a page holds as many.
 */
export const BOARD_LINES = 10;

/**
 * The letters on the flaps, in the order they roll: a flap goes through them, one after the other, to its letter.
 */
const ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-/.';

/**
 * Letters of a name on the board.
 */
const NAME = 7;

/**
 * Milliseconds between a turn of the flaps and the next, and how many letters a flap goes on at most in a turn.
 */
const TICK = 20;
const STEP = 2;

/**
 * Writes a text with the letters of the flaps only: capitals, no accents, a blank for the others; cut or filled with
 * blanks to a length.
 *
 * @param text - The text.
 * @param length - Its length on the board.
 * @param end - Whether it is aligned to the right.
 * @returns The text for the board.
 */
function flaps(text: string, length: number, end = false): string {
  const plain = [...text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()].map(char => (ALPHABET.includes(char) ? char : ' ')).join('');
  const cut = plain.slice(0, length);
  return end ? cut.padStart(length) : cut.padEnd(length);
}

/**
 * The split-flap board of the matches, as in an old station: a line for each match of the page, newest first, with its
 * day, the two teams (defender and attacker, each with its icon), the result and the ELO won. When the matches change, every flap rolls
 * through the letters to its new one, in a wave from the top left.
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
   * The lines as the flaps show them now, rolling towards `lines`.
   */
  public readonly shown = signal<Segment[][]>(this._blank());
  /**
   * The lines to show: a line for each match, blank ones after the last.
   */
  public readonly lines = computed(() => this._computeLines());

  /**
   * The timer turning the flaps, and the turns since the lines changed.
   */
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _turns = 0;

  /**
   * Rolls the flaps whenever the lines change.
   */
  public onInit(): void {
    this.effect(() => {
      this.lines();
      untracked(() => this._roll());
    });
  }

  /**
   * Stops the flaps.
   */
  public onDestroy(): void {
    this._stop();
  }

  /**
   * The letters of a piece of a line, a flap each.
   *
   * @param text - The text of the piece.
   * @returns Its letters.
   */
  public letters(text: string): string[] {
    return [...text];
  }

  /**
   * Starts rolling the flaps towards the lines.
   */
  private _roll(): void {
    this._turns = 0;
    if (this._timer === null) {
      this._timer = setInterval(() => this._turn(), TICK);
    }
  }

  /**
   * A turn of the flaps: each one not yet on its letter goes to the next one, once the wave reached it.
   */
  private _turn(): void {
    this._turns++;
    const lines = this.lines();
    let moving = false;
    this.shown.update(shown =>
      shown.map((line, row) => {
        let column = 0;
        return line.map((segment, index) => {
          const target = lines[row]![index]!;
          const text = [...segment.text]
            .map((char, i) => {
              const wanted = target.text[i]!;
              // The wave: a flap starts a little after the one on its left and the one above
              if (char === wanted || this._turns < row + (column + i) * 0.3) {
                moving ||= char !== wanted;
                return char;
              }

              // On by a few letters, without going past the one it wants
              moving = true;
              const from = ALPHABET.indexOf(char);
              const distance = (ALPHABET.indexOf(wanted) - from + ALPHABET.length) % ALPHABET.length;
              return ALPHABET[(from + Math.min(STEP, distance)) % ALPHABET.length]!;
            })
            .join('');
          column += segment.text.length;
          return { text, tone: target.tone, player: target.player };
        });
      })
    );

    if (!moving) {
      this._stop();
    }
  }

  /**
   * Stops turning the flaps.
   */
  private _stop(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * The lines of a blank board.
   *
   * @returns Blank lines, with the pieces of a line of a match.
   */
  private _blank(): Segment[][] {
    return Array.from({ length: BOARD_LINES }, () => this._line(null));
  }

  /**
   * The line of a match.
   *
   * @param match - The match, `null` for a blank line.
   * @returns Its pieces: the day, the defender and the attacker of the white team, the result, the defender and the
   * attacker of the brown team, and the ELO won.
   */
  private _line(match: MatchSummary | null): Segment[] {
    if (!match) {
      const name = { text: flaps('', NAME), tone: 'name', player: null };
      return [{ text: flaps('', 5), tone: '' }, name, name, { text: flaps('', 3), tone: '' }, name, name, { text: flaps('', 3), tone: '' }];
    }

    const date = new Date(`${match.playedAt.replace(' ', 'T')}Z`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    const whiteWon = match.winner === 'red';
    const delta = whiteWon ? match.redDelta : match.blueDelta;
    const name = (player: PlayerRef, tone: string): Segment => ({ text: flaps(player.name, NAME), tone: `name ${tone}`, player });
    const white = `white ${whiteWon ? 'won' : 'lost'}`;
    const brown = `brown ${whiteWon ? 'lost' : 'won'}`;
    return [
      { text: flaps(date, 5), tone: 'date' },
      name(match.red.defense, white),
      name(match.red.attack, white),
      { text: flaps(`${match.redScore}-${match.blueScore}`, 3), tone: 'score' },
      name(match.blue.defense, brown),
      name(match.blue.attack, brown),
      { text: flaps(delta > 0 ? `+${delta}` : String(delta), 3, true), tone: 'delta' }
    ];
  }

  /**
   * Computes the value of `lines`.
   *
   * @returns A line for each match, blank ones after the last.
   */
  private _computeLines(): Segment[][] {
    const games = this.games();
    return Array.from({ length: BOARD_LINES }, (_, i) => this._line(games[i] ?? null));
  }
}

import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal } from '@xaendar/core/signals';
import { ApiError, deleteRunningMatch, fetchLeaderboard, fetchRunningMatch, generateMatch, saveMatch } from '../../core/api/api';
import type { LeaderboardEntry, RunningMatch, SavedMatch } from '../../core/api/api.models';

/**
 * How long a touch must last to be a long press, in milliseconds.
 */
const LONG_PRESS_MS = 450;

/**
 * How a player is picked: not available, available, or available and required in the match.
 */
type PickState = 'none' | 'queue' | 'priority';

/**
 * The play page, the matchmaking of the previous project: the user picks the available players (at least 4) and the
 * ones that must play, the server picks the best match among them and keeps it as the match being played, then the
 * user saves its result or drops it.
 */
@WebComponent({
  selector: 'page-play',
  styleUrl: './play.xd.component.scss',
  templateUrl: './play.xd.component.html'
})
export class PlayPage extends CustomElement {
  /**
   * Every player, by name.
   */
  public readonly players = signal<LeaderboardEntry[]>([]);
  /**
   * How each player is picked, by id; missing means not picked.
   */
  public readonly picks = signal<ReadonlyMap<number, PickState>>(new Map());
  /**
   * The match being played, `null` when there is none.
   */
  public readonly running = signal<RunningMatch | null>(null);
  /**
   * The warning shown when somebody generated a match the page didn't show: the match appears, and nothing can be
   * generated until it is saved or deleted. `''` when there is none.
   */
  public readonly warning = signal('');
  /**
   * The last saved match, `null` until one is saved.
   */
  public readonly saved = signal<SavedMatch | null>(null);
  /**
   * Whether a request is in flight.
   */
  public readonly busy = signal(false);
  /**
   * The error to show, `''` when there is none.
   */
  public readonly error = signal('');
  /**
   * The ids of the picked players, priority ones included.
   */
  public readonly selectedIds = computed(() => this._computeSelectedIds());
  /**
   * The ids of the players that must play.
   */
  public readonly priorityIds = computed(() => this._computePriorityIds());
  /**
   * Whether the list of players is folded, on small screens: the match takes its place.
   */
  public readonly collapsed = signal(false);
  /**
   * The match being played, as a list of at most one item, so that the template reads it without `null`.
   */
  public readonly live = computed(() => this._computeLive());
  /**
   * The rules of the table, as in the previous project.
   */
  public readonly rules: readonly string[] = [
    'Si vince a 8 (non ci sono supplementari)',
    'Si cambia campo dopo 7 goal totali',
    'Il goal è valido solo se ci sono stati almeno due tocchi volontari da stecche diverse',
    'Non valgono schizzo e rullata',
    'Se la palla non può essere colpita e non è tra difensore e portiere, si riparte da calcio d\'inizio',
    'I ruoli devono essere rispettati e non possono essere cambiati'
  ];

  /**
   * Highest number of players that must play.
   */
  private readonly _maxPriority = 4;

  /**
   * Loads the players, picking those available today, and the match being played.
   */
  public onInit(): void {
    this._load();
  }

  /**
   * How a player is picked.
   *
   * @param id - The id of the player.
   * @returns Its state.
   */
  public pickOf(id: number): PickState {
    return this.picks().get(id) ?? 'none';
  }

  /**
   * Moves a player to the next state: not picked → available → must play → not picked. Once 4 players must play,
   * an available player goes back to not picked.
   *
   * @param id - The id of the player.
   */
  public cycle(id: number): void {
    const picks = new Map(this.picks());
    picks.get(id) !== 'queue'
      ? picks.set(id, 'queue')
      : picks.delete(id);

    this.picks.set(picks);
  }

  /**
   * Folds or unfolds the list of players.
   */
  public toggleFold(): void {
    this.collapsed.update(collapsed => !collapsed);
  }

  /**
   * Starts the long press of a touch on a player, which gives priority like the right click.
   *
   * @param event - The pointer going down on the player.
   * @param id - The id of the player.
   */
  public pressStart(event: PointerEvent, id: number): void {
    this._pressed = false;
    this._clearPress();
    if (event.pointerType !== 'mouse') {
      this._pressTimer = setTimeout(() => {
        this._pressTimer = null;
        this._pressed = true;
        this._togglePriority(id);
      }, LONG_PRESS_MS);
    }
  }

  /**
   * Ends the press on a player: a short touch is still a tap.
   */
  public pressEnd(): void {
    this._clearPress();
  }

  /**
   * A tap or click on a player, ignored when it ended a long press.
   *
   * @param id - The id of the player.
   */
  public tap(id: number): void {
    if (this._pressed) {
      this._pressed = false;
      return;
    }

    this.cycle(id);
  }

  /**
   * Gives or takes the priority with the context menu, which a long press opens on some touch browsers: the long
   * press already did it, so only the mouse acts here.
   *
   * @param event - The context menu event.
   * @param id - The id of the player.
   */
  public mustPlay(event: PointerEvent, id: number): void {
    event.preventDefault();
    if (this._pressed || this._pressTimer !== null || event.pointerType === 'touch' || event.pointerType === 'pen') {
      return;
    }

    this._togglePriority(id);
  }

  private _pressTimer: ReturnType<typeof setTimeout> | null = null;
  private _pressed = false;

  private _clearPress(): void {
    if (this._pressTimer !== null) {
      clearTimeout(this._pressTimer);
      this._pressTimer = null;
    }
  }

  private _togglePriority(id: number): void {
    const picks = new Map(this.picks());
    if (picks.get(id) !== 'priority') {
      if (this.priorityIds().length < this._maxPriority) {
        picks.set(id, 'priority')
      }
    } else {
      picks.delete(id);
    }

    this.picks.set(picks);
  }

  /**
   * Picks every player.
   */
  public pickAll(): void {
    const picks = new Map(this.picks());
    const players = this.players();
    for (let i = 0; i < players.length; i++) {
      if (!picks.has(players[i]!.id)) {
        picks.set(players[i]!.id, 'queue');
      }
    }

    this.picks.set(picks);
  }

  /**
   * Picks nobody.
   */
  public pickNone(): void {
    this.picks.set(new Map());
  }

  /**
   * Picks the players usually available today, and nobody else.
   */
  public pickToday(): void {
    const today = new Date().getDay();
    const picks = new Map<number, PickState>();
    const players = this.players();
    for (let i = 0; i < players.length; i++) {
      if (players[i]!.weekdays.includes(today)) {
        picks.set(players[i]!.id, 'queue');
      }
    }

    this.picks.set(picks);
  }

  /**
   * Asks the server for the best match among the picked players. With a match already generated nothing is generated: if
   * the page didn't show it, it appears now, with a warning.
   */
  public async generate(): Promise<void> {
    if (this.running()) {
      return;
    }

    this.warning.set('');
    await this._run(async () => {
      this.saved.set(null);
      try {
        this.running.set(await generateMatch(this.selectedIds(), this.priorityIds()));
      } catch (error) {
        if (!this._showGenerated(error)) {
          throw error;
        }
      }
    });
  }

  /**
   * Deletes the match being played: a new one can be generated.
   */
  public async drop(): Promise<void> {
    await this._run(async () => {
      await deleteRunningMatch();
      this.running.set(null);
      this.warning.set('');
    });
  }

  /**
   * Saves the result of the match being played.
   *
   * @param event - The submission of the form.
   * @param redScore - Goals of the red team.
   * @param blueScore - Goals of the blue team.
   */
  public async save(event: SubmitEvent, redScore: number, blueScore: number): Promise<void> {
    event.preventDefault();
    const running = this.running();
    if (!running) {
      return;
    }

    if (!this._isScore(redScore) || !this._isScore(blueScore)) {
      this.error.set('Inserisci i goal di entrambe le squadre, da 0 a 8');
      return;
    }

    // The match ends when a team scores 8: one team has exactly 8 and the other fewer, so 7-1 or 8-8 are not results
    if (Math.max(redScore, blueScore) !== 8 || redScore === blueScore) {
      this.error.set("Si vince a 8: una squadra deve fare 8 e l'altra meno (ad esempio 8-5)");
      return;
    }

    await this._run(async () => {
      let saved: SavedMatch;
      try {
        saved = await saveMatch(
          running.id,
          { attack: running.red.attack.id, defense: running.red.defense.id },
          { attack: running.blue.attack.id, defense: running.blue.defense.id },
          redScore,
          blueScore
        );
      } catch (error) {
        this._dropSaved(error);
        throw error;
      }

      this.saved.set(saved);
      this.running.set(null);
      this.warning.set('');
      this.players.set(this._byName(saved.players));
    });
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
   * Shows the match somebody else generated, if that is what the server answered: there already is one. It appears in
   * the page, with a warning.
   *
   * @param error - What a request failed with.
   * @returns Whether it was that answer.
   */
  private _showGenerated(error: unknown): boolean {
    const running = error instanceof ApiError && error.status === 409 ? (error.data as { running?: RunningMatch } | undefined)?.running : undefined;
    if (!running) {
      return false;
    }

    this.running.set(running);
    this.warning.set((error as ApiError).message);
    return true;
  }

  /**
   * Drops the match being played, if the server answered that somebody else saved or deleted it first: the page shows
   * the match to play now, if any. The error is shown by the caller.
   *
   * @param error - What the save failed with.
   */
  private _dropSaved(error: unknown): void {
    const data = error instanceof ApiError && error.status === 409 ? (error.data as { running?: RunningMatch | null } | undefined) : undefined;
    if (data && 'running' in data) {
      this.running.set(data.running ?? null);
      this.warning.set('');
    }
  }

  /**
   * Loads the players and the match being played; the players available today are picked.
   */
  private async _load(): Promise<void> {
    await this._run(async () => {
      const [players, running] = await Promise.all([fetchLeaderboard(), fetchRunningMatch()]);
      this.players.set(this._byName(players));
      this.running.set(running);
      this.pickToday();
    });
  }

  /**
   * Runs a request, tracking `busy` and showing its error.
   *
   * @param work - The request.
   */
  private async _run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Sorts players by name.
   *
   * @param players - The players.
   * @returns The same players, by name.
   */
  private _byName(players: LeaderboardEntry[]): LeaderboardEntry[] {
    return players.sort((first, second) => first.name.localeCompare(second.name));
  }

  /**
   * Checks a score typed in the form.
   *
   * @param score - The score.
   * @returns Whether it is an integer from 0 to 8.
   */
  private _isScore(score: number): boolean {
    return Number.isInteger(score) && score >= 0 && score <= 8;
  }

  /**
   * Computes the value of `selectedIds`.
   *
   * @returns The ids of the picked players.
   */
  private _computeSelectedIds(): number[] {
    return [...this.picks().keys()];
  }

  /**
   * Computes the value of `priorityIds`.
   *
   * @returns The ids of the players that must play.
   */
  private _computePriorityIds(): number[] {
    const ids: number[] = [];
    for (const [id, state] of this.picks()) {
      if (state === 'priority') {
        ids.push(id);
      }
    }

    return ids;
  }

  /**
   * Computes the value of `live`.
   *
   * @returns The match being played, or none.
   */
  private _computeLive(): RunningMatch[] {
    const running = this.running();
    return running ? [running] : [];
  }
}

import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal, untracked } from '@xaendar/core/signals';
import { fetchPlayer } from '../../core/api/api';
import type { LeaderboardEntry, Lineup, PlayerDetail, PlayerMatch, PlayerRef, PlayerResult, PlayerStats, RankingMode, Role, Team } from '../../core/api/api.models';
import { route } from '../../core/router/router';

/**
 * The tone of a value: good news, bad news, or neither.
 */
type Tone = 'good' | 'bad' | '';

/**
 * A line of a card of statistics.
 */
interface StatLine {
  /**
   * What it measures.
   */
  label: string;
  /**
   * Its value, formatted.
   */
  value: string;
  /**
   * A detail shown next to the value, e.g. a percentage.
   */
  detail: string;
  /**
   * The tone of the value.
   */
  tone: Tone;
  /**
   * The icon shown before the label, `''` for none.
   */
  icon: string;
}

/**
 * Another player worth a mention: a teammate or an opponent.
 */
interface Mention {
  /**
   * Why it is mentioned.
   */
  label: string;
  /**
   * The player.
   */
  player: PlayerRef;
  /**
   * The value, formatted.
   */
  value: string;
  /**
   * The tone of the value.
   */
  tone: Tone;
}

/**
 * A match, as a row of the history or of the highlights.
 */
interface MatchRow {
  /**
   * Id of the match.
   */
  id: number;
  /**
   * The red team.
   */
  red: Lineup<PlayerRef>;
  /**
   * The blue team.
   */
  blue: Lineup<PlayerRef>;
  /**
   * Goals of the red team.
   */
  redScore: number;
  /**
   * Goals of the blue team.
   */
  blueScore: number;
  /**
   * The winning team.
   */
  winner: Team;
  /**
   * Whether the player was in the red team.
   */
  isRed: boolean;
  /**
   * Why it is shown, for the highlights.
   */
  label: string;
  /**
   * When it was played, formatted.
   */
  date: string;
  /**
   * Whether the player won.
   */
  won: boolean;
  /**
   * Goals of the team of the player, then of the opponents.
   */
  score: string;
  /**
   * The teammate.
   */
  partner: PlayerRef;
  /**
   * The opponents.
   */
  opponents: PlayerRef[];
  /**
   * Change of ELO of the player.
   */
  delta: number;
}

/**
 * A point of the chart of the ELO of a role.
 */
interface TrendPoint {
  /**
   * Horizontal position, 0 to 100, evenly spaced by match.
   */
  x: number;
  /**
   * Vertical position, 0 (top) to 100 (bottom), following the ELO.
   */
  y: number;
  /**
   * The ELO of the player in the role of the match at this point: after the match.
   */
  elo: number;
  /**
   * The role of the match, `null` for the starting point.
   */
  role: Role | null;
  /**
   * The match, `null` for the starting point, before the first match.
   */
  match: MatchRow | null;
}

/**
 * A mark of the ELO axis.
 */
interface TrendTick {
  /**
   * The ELO.
   */
  value: number;
  /**
   * Vertical position, 0 (top) to 100 (bottom).
   */
  y: number;
}

/**
 * The chart of the ELO of a role.
 */
interface TrendChart {
  /**
   * The points, the starting one included.
   */
  points: TrendPoint[];
  /**
   * The lines, one per role shown, in a 0–100 box.
   */
  lines: Array<{ role: Role; points: string }>;
  /**
   * The marks of the ELO axis.
   */
  ticks: TrendTick[];
}

/**
 * The page of a player: its record, its statistics by role, its streaks, goals, teammates and opponents, its best and
 * worst matches, the trend of its ELO and its history.
 */
@WebComponent({
  selector: 'page-player-detail',
  styleUrl: './player-detail.xd.component.scss',
  templateUrl: './player-detail.xd.component.html'
})
export class PlayerDetailPage extends CustomElement {
  /**
   * The page of the player, `null` until it is loaded.
   */
  public readonly detail = signal<PlayerDetail | null>(null);
  /**
   * The error of the last load, `''` when it succeeded.
   */
  public readonly error = signal('');
  /**
   * Whether the whole history is shown, not only the last matches.
   */
  public readonly showAll = signal(false);
  /**
   * The player, as a list of at most one item, so that the template reads it without `null`.
   */
  public readonly profile = computed(() => this._computeProfile());
  /**
   * The headline figures: ELO in attack, ELO in defence, best ELO, matches.
   */
  public readonly headline = computed(() => this._computeHeadline());
  /**
   * The record, streaks and goals, under the headline.
   */
  public readonly summary = computed(() => this._computeSummary());
  /**
   * The teammates and opponents worth a mention.
   */
  public readonly mentions = computed(() => this._computeMentions());
  /**
   * The best and worst matches.
   */
  public readonly highlights = computed(() => this._computeHighlights());
  /**
   * The matches of the history shown.
   */
  public readonly history = computed(() => this._computeHistory());
  /**
   * What the page shows: every match, or only the ones in a role. One answer holds all of them: no request on change.
   */
  public readonly filter = signal<RankingMode>('best');
  /**
   * The statistics of the filter, as a list of at most one item.
   */
  public readonly scoped = computed(() => this._computeScoped());
  /**
   * The matches of the filter, newest first.
   */
  public readonly scopedMatches = computed(() => this._computeMatches());
  /**
   * The index of the point of the chart under the pointer, `-1` for none.
   */
  public readonly hovered = signal(-1);
  /**
   * The chart of the ELO of the role shown.
   */
  public readonly trend = computed(() => this._computeTrend());
  /**
   * The point under the pointer, as a list of at most one item, so that the template reads it without `null`.
   */
  public readonly active = computed(() => this._computeActive());
  /**
   * The buttons of the filter.
   */
  public readonly filters: ReadonlyArray<{ value: RankingMode; label: string; icon: string }> = [
    { value: 'best', label: 'Generale', icon: 'trophy' },
    { value: 'attack', label: 'Attacco', icon: 'attack' },
    { value: 'defense', label: 'Difesa', icon: 'defense' }
  ];

  /**
   * How many matches the history shows until it is expanded.
   */
  private readonly _historyPreview = 12;
  /**
   * Names of the roles.
   */
  private readonly _roleLabels: Record<Role, string> = { attack: 'Attacco', defense: 'Difesa' };
  /**
   * Aborts the request in flight.
   */
  private _controller: AbortController | null = null;

  /**
   * Loads the player of the route, again whenever it changes.
   */
  public onInit(): void {
    this.effect(() => {
      const id = route().playerId;
      untracked(() => this._load(id));
    });
  }

  /**
   * Filters the whole page by role, or by none.
   *
   * @param filter - The filter.
   */
  public setFilter(filter: RankingMode): void {
    this.filter.set(filter);
    this.showAll.set(false);
    this.hovered.set(-1);
  }

  /**
   * Finds the match nearest to the pointer on the chart.
   *
   * @param event - The move of the pointer over the plot of the chart.
   */
  public hover(event: PointerEvent): void {
    const count = this.trend().points.length;
    if (count < 2) {
      return;
    }

    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    // The first point is the start, before any match: it has nothing to show
    this.hovered.set(Math.max(1, Math.round(fraction * (count - 1))));
  }

  /**
   * Hides the preview of the match.
   */
  public leave(): void {
    this.hovered.set(-1);
  }

  /**
   * Shows the whole history, or only the last matches.
   */
  public toggleHistory(): void {
    this.showAll.update(showAll => !showAll);
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
   * The step of the podium of a position.
   *
   * @param rank - The position in the leaderboard.
   * @returns `gold`, `silver` or `bronze` for the first three, `''` for the others.
   */
  public podium(rank: number): string {
    return ['', 'gold', 'silver', 'bronze'][rank] ?? '';
  }

  /**
   * Loads a player, aborting the previous request.
   *
   * @param id - The id of the player.
   */
  private async _load(id: number | undefined): Promise<void> {
    this._controller?.abort();
    if (id === undefined) {
      return;
    }

    const controller = new AbortController();
    this._controller = controller;
    try {
      const detail = await fetchPlayer(id, controller.signal);
      this.detail.set(detail);
      this.showAll.set(false);
      this.hovered.set(-1);
      this.filter.set('best');
      this.error.set('');
    } catch (error) {
      if (!controller.signal.aborted) {
        this.detail.set(null);
        this.error.set((error as Error).message);
      }
    }
  }

  /**
   * A share, rounded.
   *
   * @param part - The part.
   * @param total - The total.
   * @returns The percentage, 0 when the total is 0.
   */
  private _rate(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0;
  }

  /**
   * Formats an average.
   *
   * @param total - The sum.
   * @param count - How many values.
   * @returns The average with two decimals, `—` when there are none.
   */
  private _average(total: number, count: number): string {
    return count ? (total / count).toFixed(2) : '—';
  }

  /**
   * A line of a card.
   *
   * @param label - What it measures.
   * @param value - Its value.
   * @param detail - A detail.
   * @param tone - Its tone.
   * @param icon - The icon before the label.
   * @returns The line.
   */
  private _line(label: string, value: string | number, detail = '', tone: Tone = '', icon = ''): StatLine {
    return { label, value: String(value), detail, tone, icon };
  }

  /**
   * A mention of another player.
   *
   * @param label - Why it is mentioned.
   * @param result - The player with its value, `null` when there is none.
   * @param signed - Whether the value is a change of ELO, shown with its sign and tone.
   * @returns The mention, `undefined` when there is no player.
   */
  private _mention(label: string, result: PlayerResult | null, signed: boolean): Mention | undefined {
    if (!result) {
      return undefined;
    }

    if (!signed) {
      return { label, player: result.player, value: `${result.value} partite`, tone: '' };
    }

    return { label, player: result.player, value: `${this.formatDelta(result.value)} ELO`, tone: result.value >= 0 ? 'good' : 'bad' };
  }

  /**
   * Turns a match into a row.
   *
   * @param match - The match.
   * @param label - Why it is shown.
   * @returns The row.
   */
  private _toRow(match: PlayerMatch, label = ''): MatchRow {
    const own = match.team === 'red' ? match.red : match.blue;
    const other = match.team === 'red' ? match.blue : match.red;
    const [ownScore, otherScore] = match.team === 'red' ? [match.redScore, match.blueScore] : [match.blueScore, match.redScore];
    return {
      id: match.id,
      red: match.red,
      blue: match.blue,
      redScore: match.redScore,
      blueScore: match.blueScore,
      winner: match.winner,
      isRed: match.team === 'red',
      label,
      date: new Date(`${match.playedAt.replace(' ', 'T')}Z`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      won: match.team === match.winner,
      score: `${ownScore}-${otherScore}`,
      partner: match.role === 'attack' ? own.defense : own.attack,
      opponents: [other.defense, other.attack],
      delta: match.eloDelta
    };
  }

  /**
   * Computes the value of `profile`.
   *
   * @returns The player, or none.
   */
  private _computeProfile(): LeaderboardEntry[] {
    const detail = this.detail();
    return detail ? [detail.player] : [];
  }

  /**
   * Computes the value of `headline`.
   *
   * @returns The figures, none until the player is loaded.
   */
  private _computeHeadline(): StatLine[] {
    const detail = this.detail();
    if (!detail) {
      return [];
    }

    const filter = this.filter();
    const stats = detail.stats[filter];
    if (filter !== 'best') {
      return [
        this._line('ELO', stats.elo),
        this._line('Miglior ELO', stats.bestElo, '', 'good'),
        this._line('Peggior ELO', stats.worstElo, '', 'bad'),
        this._line('Partite', stats.matches)
      ];
    }

    return [
      this._line('ELO attacco', detail.player.eloAttack, `${detail.player.matchesAttack} p.`, '', 'attack'),
      this._line('ELO difesa', detail.player.eloDefense, `${detail.player.matchesDefense} p.`, '', 'defense'),
      this._line('Miglior ELO', stats.bestElo, '', 'good'),
      this._line('Partite', stats.matches)
    ];
  }

  /**
   * Computes the value of `summary`: record, streaks and goals, under the headline.
   *
   * @returns The figures, none until the player is loaded.
   */
  private _computeSummary(): StatLine[] {
    const detail = this.detail();
    if (!detail) {
      return [];
    }

    const filter = this.filter();
    const stats = detail.stats[filter];
    const record = (wins: number, matches: number): string => `${wins}V - ${matches - wins}S`;
    const lines = [this._line('V / S', record(stats.wins, stats.matches), `${this._rate(stats.wins, stats.matches)}%`)];
    const ratio = stats.goalsAgainst ? stats.goalsFor / stats.goalsAgainst : 0;
    lines.push(
      this._line('Serie vittorie', stats.bestWinStreak, '', 'good', 'flame'),
      this._line('Serie sconfitte', stats.worstLossStreak, '', 'bad'),
      this._line('Goal F / S', `${stats.goalsFor} / ${stats.goalsAgainst}`, stats.goalsAgainst ? ratio.toFixed(2) : '', ratio >= 1 ? 'good' : 'bad', 'goal'),
      this._line('Media goal F / S', `${this._average(stats.goalsFor, stats.matches)} / ${this._average(stats.goalsAgainst, stats.matches)}`)
    );
    return lines;
  }

  /**
   * Computes the value of `mentions`.
   *
   * @returns The mentions, none until the player is loaded.
   */
  private _computeMentions(): Mention[] {
    const stats = this.scoped()[0];
    if (!stats) {
      return [];
    }

    const mentions = [
      this._mention('Compagno più frequente', stats.frequentTeammate, false),
      this._mention('Miglior compagno', stats.bestTeammate, true),
      this._mention('Peggior compagno', stats.worstTeammate, true),
      this._mention('Avversario più forte', stats.strongestOpponent, true),
      this._mention('Avversario più abbordabile', stats.weakestOpponent, true)
    ];
    return mentions.filter((mention): mention is Mention => mention !== undefined);
  }

  /**
   * Computes the value of `highlights`.
   *
   * @returns The best and worst matches, none until the player is loaded.
   */
  private _computeHighlights(): MatchRow[] {
    const stats = this.scoped()[0];
    if (!stats) {
      return [];
    }

    const highlights: MatchRow[] = [];
    const candidates: Array<[string, PlayerMatch | null]> = [
      ['Miglior vittoria (ELO)', stats.bestVictoryByElo],
      ['Peggior sconfitta (ELO)', stats.worstDefeatByElo],
      ['Vittoria più netta', stats.bestVictoryByScore],
      ['Sconfitta più netta', stats.worstDefeatByScore]
    ];
    for (let i = 0; i < candidates.length; i++) {
      const [label, match] = candidates[i]!;
      if (match) {
        highlights.push(this._toRow(match, label));
      }
    }

    return highlights;
  }

  /**
   * Computes the value of `history`.
   *
   * @returns The matches shown, newest first.
   */
  private _computeHistory(): MatchRow[] {
    const matches = this.scopedMatches();
    if (!matches.length) {
      return [];
    }

    const shown = this.showAll() ? matches : matches.slice(0, this._historyPreview);
    return shown.map(match => this._toRow(match));
  }

  /**
   * Computes the value of `scoped`.
   *
   * @returns The statistics of the filter, none until the player is loaded.
   */
  private _computeScoped(): PlayerStats[] {
    const detail = this.detail();
    return detail ? [detail.stats[this.filter()]] : [];
  }

  /**
   * Computes the value of `scopedMatches`.
   *
   * @returns The matches of the filter, newest first.
   */
  private _computeMatches(): PlayerMatch[] {
    const matches = this.detail()?.matches ?? [];
    const filter = this.filter();
    return filter === 'best' ? matches : matches.filter(match => match.role === filter);
  }

  /**
   * Computes the value of `trend`.
   *
   * @returns The points, the lines and the ELO axis of the filter: one line for a role, both for the general one.
   * Empty when the player never played.
   */
  private _computeTrend(): TrendChart {
    const detail = this.detail();
    const filter = this.filter();
    const matches = this.scopedMatches().toReversed();
    if (!detail || !matches.length) {
      return { points: [], lines: [], ticks: [] };
    }

    // The ELO of each role after each match, the starting point first; a role not played in a match keeps its ELO
    const roles: Role[] = filter === 'best' ? ['attack', 'defense'] : [filter];
    const series: Record<Role, number[]> = { attack: [], defense: [] };
    if (filter === 'best') {
      series.attack = detail.eloHistory.attack;
      series.defense = detail.eloHistory.defense;
    } else {
      series[filter] = [matches[0]!.eloBefore, ...matches.map(match => match.eloBefore + match.eloDelta)];
      // The last point is the current ELO of the role, whatever the rounding drifted to
      series[filter][matches.length] = filter === 'attack' ? detail.player.eloAttack : detail.player.eloDefense;
    }

    // In the general one a role never played is a flat line: left out
    const shown = roles.filter(role => filter !== 'best' || (role === 'attack' ? detail.player.matchesAttack : detail.player.matchesDefense) > 0);
    const all = shown.flatMap(role => series[role]);
    const min = Math.min(...all);
    const max = Math.max(...all);
    const padding = Math.max((max - min) * 0.12, 6);
    const low = min - padding;
    const span = max + padding - low;
    const toY = (elo: number): number => (1 - (elo - low) / span) * 100;
    const toX = (index: number): number => (index / matches.length) * 100;

    const points: TrendPoint[] = [];
    for (let index = 0; index <= matches.length; index++) {
      const match = index ? matches[index - 1]! : null;
      const role = match ? match.role : shown[0]!;
      const elo = series[role][index]!;
      points.push({ x: toX(index), y: toY(elo), elo, role: match ? role : null, match: match ? this._toRow(match) : null });
    }

    const lines = shown.map(role => ({
      role,
      points: series[role].map((elo, index) => `${toX(index).toFixed(2)},${toY(elo).toFixed(2)}`).join(' ')
    }));
    const ticks: TrendTick[] = [];
    for (let i = 0; i < 4; i++) {
      const value = Math.round(low + span - (span * i) / 3);
      ticks.push({ value, y: toY(value) });
    }

    return { points, lines, ticks };
  }

  /**
   * Computes the value of `active`.
   *
   * @returns The point under the pointer, or none.
   */
  private _computeActive(): TrendPoint[] {
    const point = this.trend().points[this.hovered()];
    return point ? [point] : [];
  }

  /**
   * Aborts the request in flight, whose answer nobody would read.
   */
  public onDestroy(): void {
    this._controller?.abort();
  }
}

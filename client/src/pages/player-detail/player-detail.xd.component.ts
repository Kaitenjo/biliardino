import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal, untracked } from '@xaendar/core/signals';
import { fetchPlayer } from '../../core/api/api';
import type { LeaderboardEntry, Lineup, PlayerDetail, PlayerMatch, PlayerRef, PlayerResult, Role } from '../../core/api/api.models';
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
 * A card of statistics.
 */
interface StatCard {
  /**
   * Icon of the card.
   */
  icon: string;
  /**
   * Title of the card.
   */
  title: string;
  /**
   * Its lines.
   */
  lines: StatLine[];
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
   * Probability of winning the team of the player had, 0 to 100.
   */
  expected: number;
  /**
   * Name of the role of the player.
   */
  role: string;
  /**
   * The icon of the role of the player.
   */
  roleIcon: string;
  /**
   * ELO of the player in its role.
   */
  roleElo: number;
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
   * The ELO of the player in the role at this point: after the match.
   */
  elo: number;
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
   * The `points` of the line, in a 0–100 box.
   */
  line: string;
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
   * The cards of statistics.
   */
  public readonly cards = computed(() => this._computeCards());
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
   * The role whose chart of the ELO is shown: the two roles have separate ELOs and separate charts, one at a time.
   */
  public readonly trendRole = signal<Role>('attack');
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
   * The roles of the buttons of the chart.
   */
  public readonly trendRoles: ReadonlyArray<{ value: Role; label: string }> = [
    { value: 'attack', label: 'Attacco' },
    { value: 'defense', label: 'Difesa' }
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
   * Shows the chart of the ELO of another role.
   *
   * @param role - The role.
   */
  public setTrendRole(role: Role): void {
    this.trendRole.set(role);
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
   * The share of matches a player won.
   *
   * @param player - The player.
   * @returns The percentage.
   */
  public winRate(player: LeaderboardEntry): number {
    return this._rate(player.wins, player.matches);
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
      // Open on the role the player played most
      this.trendRole.set(detail.player.matchesDefense > detail.player.matchesAttack ? 'defense' : 'attack');
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
      isRed: match.team === 'red',
      label,
      date: new Date(`${match.playedAt.replace(' ', 'T')}Z`).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      won: match.team === match.winner,
      score: `${ownScore}-${otherScore}`,
      expected: Math.round(match.expected * 100),
      role: this._roleLabels[match.role],
      roleIcon: match.role,
      roleElo: match.roleElo,
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

    return [
      this._line('ELO attacco', detail.player.eloAttack, `${detail.player.matchesAttack} p.`, '', 'attack'),
      this._line('ELO difesa', detail.player.eloDefense, `${detail.player.matchesDefense} p.`, '', 'defense'),
      this._line('Miglior ELO', detail.stats.bestElo, '', 'good'),
      this._line('Partite', detail.player.matches)
    ];
  }

  /**
   * Computes the value of `cards`.
   *
   * @returns The cards, none until the player is loaded.
   */
  private _computeCards(): StatCard[] {
    const detail = this.detail();
    if (!detail) {
      return [];
    }

    const { player, stats } = detail;
    const lossesAsAttack = stats.matchesAsAttack - stats.winsAsAttack;
    const lossesAsDefence = stats.matchesAsDefence - stats.winsAsDefence;
    const ratio = stats.goalsAgainst ? stats.goalsFor / stats.goalsAgainst : 0;
    return [
      {
        icon: 'ball',
        title: 'Partite',
        lines: [
          this._line('Partite totali', player.matches),
          this._line('Come attaccante', stats.matchesAsAttack, `${this._rate(stats.matchesAsAttack, player.matches)}%`),
          this._line('Come difensore', stats.matchesAsDefence, `${this._rate(stats.matchesAsDefence, player.matches)}%`)
        ]
      },
      {
        icon: 'trophy',
        title: 'Vittorie e sconfitte',
        lines: [
          this._line('Generale', `${player.wins}V - ${player.losses}S`, `${this._rate(player.wins, player.matches)}%`),
          this._line('Attacco', `${stats.winsAsAttack}V - ${lossesAsAttack}S`, `${this._rate(stats.winsAsAttack, stats.matchesAsAttack)}%`, '', 'attack'),
          this._line('Difesa', `${stats.winsAsDefence}V - ${lossesAsDefence}S`, `${this._rate(stats.winsAsDefence, stats.matchesAsDefence)}%`, '', 'defense')
        ]
      },
      {
        icon: 'flame',
        title: 'Streak',
        lines: [
          this._line('Migliore striscia di vittorie', stats.bestWinStreak, '', 'good'),
          this._line('Peggiore striscia di sconfitte', stats.worstLossStreak, '', 'bad')
        ]
      },
      {
        icon: 'goal',
        title: 'Goal',
        lines: [
          this._line('Goal fatti', stats.goalsFor, '', 'good'),
          this._line('Goal subiti', stats.goalsAgainst, '', 'bad'),
          this._line('Rapporto fatti/subiti', stats.goalsAgainst ? ratio.toFixed(2) : '—', '', ratio >= 1 ? 'good' : 'bad'),
          this._line('Media goal fatti', this._average(stats.goalsFor, player.matches)),
          this._line('Media goal subiti', this._average(stats.goalsAgainst, player.matches))
        ]
      }
    ];
  }

  /**
   * Computes the value of `mentions`.
   *
   * @returns The mentions, none until the player is loaded.
   */
  private _computeMentions(): Mention[] {
    const stats = this.detail()?.stats;
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
    const stats = this.detail()?.stats;
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
    const matches = this.detail()?.matches;
    if (!matches?.length) {
      return [];
    }

    const shown = this.showAll() ? matches : matches.slice(0, this._historyPreview);
    return shown.map(match => this._toRow(match));
  }

  /**
   * Computes the value of `trend`.
   *
   * @returns The points, the line and the ELO axis of the role shown, empty when the player never played in it.
   */
  private _computeTrend(): TrendChart {
    const detail = this.detail();
    const role = this.trendRole();
    const matches = detail ? detail.matches.filter(match => match.role === role).reverse() : [];
    if (!detail || !matches.length) {
      return { points: [], line: '', ticks: [] };
    }

    // The ELO after each match; the last one is the current ELO of the role, whatever the rounding drifted to
    const elos = [matches[0]!.eloBefore];
    for (let i = 0; i < matches.length; i++) {
      elos.push(matches[i]!.eloBefore + matches[i]!.eloDelta);
    }

    elos[elos.length - 1] = role === 'attack' ? detail.player.eloAttack : detail.player.eloDefense;

    const min = Math.min(...elos);
    const max = Math.max(...elos);
    const padding = Math.max((max - min) * 0.12, 6);
    const low = min - padding;
    const span = max + padding - low;
    const toY = (elo: number): number => (1 - (elo - low) / span) * 100;

    const points: TrendPoint[] = elos.map((elo, index) => ({
      x: (index / (elos.length - 1)) * 100,
      y: toY(elo),
      elo,
      match: index ? this._toRow(matches[index - 1]!) : null
    }));
    const ticks: TrendTick[] = [];
    for (let i = 0; i < 4; i++) {
      const value = Math.round(low + span - (span * i) / 3);
      ticks.push({ value, y: toY(value) });
    }

    return { points, line: points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '), ticks };
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

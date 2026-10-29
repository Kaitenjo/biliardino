import * as THREE from 'three';
import { BOARD, FIGURES, NAME, TEXT } from './fonts';
import type { PlayerDetail, PlayerMatch, PlayerResult, PlayerStats, RankingMode, Role } from '../../core/api/api.models';
import { detail, paintedColorSpace } from './detail';
import { phong } from './materials';

/*
  The board of a player, on the wall in front of the foosball table, between the rules and the matches: its icon, its
  name and rank, its figures painted on the slate, and the trend of its ELO as tubes of light
  standing out of the board (brown in attack, white in defence), with its teammates and opponents beside them.
*/

/**
 * Where everything is painted on the slate, in pixels: the size of the canvas (as wide as tall as the face of the
 * board), the icon, the name, the gold rules between the parts, the rows of figures, the chart and the teammates and
 * the opponents; and the sizes of the writings.
 */
interface Layout {
  width: number;
  height: number;
  margin: number;
  icon: { x: number; y: number; radius: number };
  name: { x: number; y: number; size: number; roles: number };
  elo: { scopeY: number; y: number; size: number; scope: number; label: number };
  rules: Array<[number, number, number, number]>;
  /**
   * The rows of figures: which ones (the headline or the summary), from which to which, and where they stand.
   */
  rows: Array<{ figures: 'headline' | 'summary'; from: number; to: number; labelY: number; valueY: number; size: number }>;
  label: number;
  chart: { left: number; right: number; top: number; bottom: number };
  axis: number;
  title: number;
  /**
   * The mentions fill their columns row by row; a name stands `nameY` under its label.
   */
  mentions: { columns: number[]; width: number; titleY: number; top: number; step: number; nameY: number; label: number; name: number; value: number };
  /**
   * The general scope has no chart: only the rules that remain, and the mentions over all the room.
   */
  general: { rules: Array<[number, number, number, number]>; mentions: Layout['mentions'] };
}

/**
 * The wide board, on a wide screen: the chart and the mentions side by side.
 */
const WIDE: Layout = {
  width: 1600,
  height: 1000,
  margin: 60,
  icon: { x: 150, y: 128, radius: 92 },
  name: { x: 290, y: 135, size: 92, roles: 36 },
  elo: { scopeY: 100, y: 190, size: 88, scope: 30, label: 26 },
  rules: [
    [60, 250, 1540, 250],
    [60, 540, 1540, 540],
    [1040, 560, 1040, 950]
  ],
  rows: [
    { figures: 'headline', from: 0, to: 4, labelY: 310, valueY: 380, size: 64 },
    { figures: 'summary', from: 0, to: 5, labelY: 440, valueY: 500, size: 38 }
  ],
  label: 24,
  chart: { left: 140, right: 990, top: 610, bottom: 950 },
  axis: 22,
  title: 26,
  mentions: { columns: [1080], width: 460, titleY: 578, top: 606, step: 76, nameY: 31, label: 22, name: 27, value: 25 },
  general: {
    rules: [
      [60, 250, 1540, 250],
      [60, 540, 1540, 540]
    ],
    mentions: { columns: [60, 820], width: 720, titleY: 585, top: 650, step: 110, nameY: 38, label: 24, name: 30, value: 28 }
  }
};

/**
 * The tall board, on a phone held upright: one part under the other, and bigger, to be read on a small screen.
 */
const TALL: Layout = {
  width: 1000,
  height: 1680,
  margin: 50,
  icon: { x: 130, y: 135, radius: 95 },
  name: { x: 260, y: 140, size: 92, roles: 40 },
  elo: { scopeY: 95, y: 195, size: 92, scope: 34, label: 32 },
  rules: [
    [50, 260, 950, 260],
    [50, 885, 950, 885],
    [50, 1305, 950, 1305]
  ],
  rows: [
    { figures: 'headline', from: 0, to: 2, labelY: 320, valueY: 390, size: 64 },
    { figures: 'headline', from: 2, to: 4, labelY: 445, valueY: 515, size: 64 },
    { figures: 'summary', from: 0, to: 2, labelY: 575, valueY: 630, size: 46 },
    { figures: 'summary', from: 2, to: 4, labelY: 690, valueY: 745, size: 46 },
    { figures: 'summary', from: 4, to: 5, labelY: 805, valueY: 860, size: 46 }
  ],
  label: 32,
  chart: { left: 130, right: 950, top: 980, bottom: 1265 },
  axis: 30,
  title: 34,
  mentions: { columns: [50, 520], width: 430, titleY: 1360, top: 1410, step: 96, nameY: 40, label: 27, name: 35, value: 31 },
  general: {
    rules: [
      [50, 260, 950, 260],
      [50, 885, 950, 885]
    ],
    mentions: { columns: [50], width: 900, titleY: 950, top: 1030, step: 125, nameY: 46, label: 30, name: 38, value: 34 }
  }
};

/**
 * The size of the face of the tall board: as wide as tall as its canvas.
 */
export const TALL_BOARD_SIZE = { width: 3.4, height: (3.4 * TALL.height) / TALL.width };

/**
 * The colours of the rank, by position, and of the lines of the roles.
 */
const RANK_COLORS: Record<number, string> = { 1: '#f5c542', 2: '#d6dbe2', 3: '#d08a4a' };
const ROLE_COLORS: Record<Role, number> = { attack: 0xfb7185, defense: 0x60a5fa };
/**
 * The outline of the match under the pointer: a darker shade of the colour of its role.
 */
const ROLE_RIMS: Record<Role, number> = { attack: 0x9f1239, defense: 0x1e3a8a };

/**
 * Colours of the slate.
 */
const INK = '#f6ebc8';
const MUTED = 'rgba(214, 196, 150, 0.7)';
const GOLD = '#c9a227';
const GOOD = '#4ade80';
const BAD = '#f87171';

/**
 * The names of the scopes, on the board.
 */
const SCOPES: Record<RankingMode, string> = { best: 'Generale', attack: 'Attacco', defense: 'Difesa' };

/**
 * A figure on the board: what it measures, its value, a detail beside it and its colour.
 */
interface Figure {
  label: string;
  value: string;
  detail?: string;
  color?: string;
}

/**
 * Formats a change of ELO with its sign.
 *
 * @param delta - The change.
 * @returns The text, e.g. `+12` or `-8`.
 */
function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * A share, rounded.
 *
 * @param part - The part.
 * @param total - The total.
 * @returns The percentage, 0 when the total is 0.
 */
function rate(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

/**
 * Formats an average.
 *
 * @param total - The sum.
 * @param count - How many values.
 * @returns The average with two decimals, `—` when there are none.
 */
function average(total: number, count: number): string {
  return count ? (total / count).toFixed(2) : '—';
}

/**
 * A match on the chart: where its point is on the board, and the ELO of the player in its role after it.
 */
export interface ChartPoint {
  position: THREE.Vector3;
  match: PlayerMatch;
  elo: number;
}

/**
 * The matches of a scope, oldest first, and the ELO of each role shown after each of them, the starting point first.
 *
 * @param detail - The page of the player.
 * @param scope - The scope.
 * @returns The matches, and the series by role: both in the general scope (but a role never played), one for a role.
 */
function trend(detail: PlayerDetail, scope: RankingMode): { matches: PlayerMatch[]; series: Array<{ role: Role; elos: number[] }> } {
  if (scope === 'best') {
    const series = (['attack', 'defense'] as const)
      .filter(role => (role === 'attack' ? detail.player.matchesAttack : detail.player.matchesDefense) > 0)
      .map(role => ({ role, elos: detail.eloHistory[role] }));
    return { matches: detail.matches.toReversed(), series };
  }

  const matches = detail.matches.filter(match => match.role === scope).toReversed();
  if (!matches.length) {
    return { matches, series: [] };
  }

  const elos = [matches[0]!.eloBefore, ...matches.map(match => match.eloBefore + match.eloDelta)];
  // The last point is the current ELO of the role, whatever the rounding drifted to
  elos[matches.length] = scope === 'attack' ? detail.player.eloAttack : detail.player.eloDefense;
  return { matches, series: [{ role: scope, elos }] };
}

/**
 * The board of a player.
 */
export class PlayerBoard {
  /**
   * The board, the centre of its face at its origin, facing +z.
   */
  public readonly object = new THREE.Group();

  private readonly _width: number;
  private readonly _height: number;
  /**
   * Where everything is painted: tall when the board is taller than wide.
   */
  private readonly _layout: Layout;
  private readonly _canvas = document.createElement('canvas');
  private readonly _texture: THREE.CanvasTexture;
  /**
   * The images of the icons, by URL (`null` while one loads or when it cannot be), and what is shown, to paint it again
   * when an image arrives.
   */
  private readonly _images = new Map<string, HTMLImageElement | null>();
  private _shown: { detail: PlayerDetail; scope: RankingMode } | null = null;
  /**
   * The tubes of the chart, rebuilt with the player and the scope.
   */
  private readonly _chart = new THREE.Group();
  /**
   * The slate, where the pointer is looked for over the chart.
   */
  public readonly slate: THREE.Mesh;
  /**
   * The matches on the chart, and what marks the one under the pointer: a line across the chart and a bead on it.
   */
  private _points: ChartPoint[] = [];
  private readonly _guide: THREE.Mesh;
  private readonly _marker: THREE.Mesh;
  private readonly _rim: THREE.Mesh;

  /**
   * @param width - Width of the face of the board.
   * @param height - Its height.
   */
  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this._layout = height > width ? TALL : WIDE;
    const { chart } = this._layout;
    this._canvas.width = this._layout.width;
    this._canvas.height = this._layout.height;
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.colorSpace = paintedColorSpace();
    this._texture.anisotropy = 8;
    this.slate = new THREE.Mesh(new THREE.PlaneGeometry(width, height), phong({ map: this._texture, roughness: 0.85 }));
    this.slate.position.z = 0.02;
    this.object.add(this.slate);

    const light = new THREE.MeshBasicMaterial({ color: 0xf6dc7a, transparent: true, opacity: 0.55 });
    this._guide = new THREE.Mesh(new THREE.BoxGeometry(0.01, ((chart.bottom - chart.top) / this._layout.height) * height, 0.01), light);
    this._guide.position.set(0, this._y((chart.top + chart.bottom) / 2), 0.05);
    // A bead of the colour of its role, as the ones of the chart, outlined by a thin hull of a darker shade just behind it
    this._marker = new THREE.Mesh(new THREE.SphereGeometry(0.05, detail(8, 16), detail(6, 12)), phong({ color: ROLE_COLORS.attack, emissive: ROLE_COLORS.attack, emissiveIntensity: 0.6, roughness: 0.4 }));
    this._rim = new THREE.Mesh(new THREE.SphereGeometry(0.064, detail(8, 16), detail(6, 12)), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }));
    this._marker.add(this._rim);
    this._guide.visible = false;
    this._marker.visible = false;
    this.object.add(this._guide, this._marker);

    this.object.add(this._chart);
    this.show(null, 'best');
  }

  /**
   * Shows a player, in a scope.
   *
   * @param detail - The page of the player, `null` while it loads.
   * @param scope - All its matches, or only the ones in a role.
   */
  public show(detail: PlayerDetail | null, scope: RankingMode): void {
    const ctx = this._canvas.getContext('2d')!;
    const { chart, margin } = this._layout;
    this._paintSlate(ctx, scope);
    if (!detail) {
      this._shown = null;
      ctx.fillStyle = MUTED;
      ctx.font = `italic 500 60px ${TEXT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Scegli un giocatore…', this._layout.width / 2, this._layout.height / 2);
      this._buildChart([], 0, 1);
      this._texture.needsUpdate = true;
      return;
    }

    this._shown = { detail, scope };
    const stats = detail.stats[scope];
    this._paintHead(ctx, detail, scope);
    this._paintFigures(ctx, detail, stats, scope);
    this._paintMentions(ctx, stats, scope);

    // All the matches together have no chart: the mentions take its room
    if (scope === 'best') {
      this._points = [];
      this._buildChart([], 0, 1);
      this.hover(null);
      this._texture.needsUpdate = true;
      return;
    }

    // The chart: the axis painted, the lines as tubes
    const { matches, series } = trend(detail, scope);
    ctx.fillStyle = GOLD;
    ctx.font = `700 ${this._layout.title}px ${BOARD}`;
    ctx.textAlign = 'left';
    ctx.fillText('ANDAMENTO ELO', margin, chart.top - 32);
    if (!series.length) {
      ctx.fillStyle = MUTED;
      ctx.font = `italic 500 40px ${TEXT}`;
      ctx.fillText('Ancora nessuna partita in questo ruolo', chart.left, (chart.top + chart.bottom) / 2);
      this._buildChart([], 0, 1);
    } else {
      const all = series.flatMap(line => line.elos);
      const padding = Math.max((Math.max(...all) - Math.min(...all)) * 0.12, 6);
      const low = Math.min(...all) - padding;
      const high = Math.max(...all) + padding;
      this._paintAxis(ctx, low, high);
      this._buildChart(series, low, high);
      // A point for each match, on the line of the role it was played in
      const count = matches.length + 1;
      this._points = matches.map((match, i) => {
        const elos = (series.find(line => line.role === match.role) ?? series[0]!).elos;
        const elo = elos[i + 1]!;
        return { position: this._chartPoint(i + 1, count, elo, low, high), match, elo };
      });
      this._buildBeads(this._points);
    }

    this.hover(null);
    this._texture.needsUpdate = true;
  }

  /**
   * Marks the match of the chart nearest to a point of the board, across.
   *
   * @param point - A point on the board, in its own space; `null` to mark none.
   * @returns The match marked, `null` when the point is not over the chart.
   */
  public hover(point: THREE.Vector3 | null): ChartPoint | null {
    const { chart } = this._layout;
    const inside =
      point &&
      this._points.length &&
      point.x >= this._x(chart.left) - 0.1 &&
      point.x <= this._x(chart.right) + 0.1 &&
      point.y <= this._y(chart.top) + 0.1 &&
      point.y >= this._y(chart.bottom) - 0.1;
    if (!inside) {
      this._guide.visible = false;
      this._marker.visible = false;
      return null;
    }

    let nearest = this._points[0]!;
    for (const candidate of this._points) {
      if (Math.abs(candidate.position.x - point.x) < Math.abs(nearest.position.x - point.x)) {
        nearest = candidate;
      }
    }

    this._guide.position.x = nearest.position.x;
    this._marker.position.copy(nearest.position);
    this._marker.position.z += 0.02;
    const marker = this._marker.material as THREE.MeshPhongMaterial;
    marker.color.set(ROLE_COLORS[nearest.match.role]);
    marker.emissive.set(ROLE_COLORS[nearest.match.role]);
    (this._rim.material as THREE.MeshBasicMaterial).color.set(ROLE_RIMS[nearest.match.role]);
    this._guide.visible = true;
    this._marker.visible = true;
    return nearest;
  }

  /**
   * The slate: dark, a little lighter in the middle, with thin gold rules between its parts.
   *
   * @param ctx - The canvas.
   * @param scope - The scope: the general one has fewer rules.
   */
  private _paintSlate(ctx: CanvasRenderingContext2D, scope: RankingMode): void {
    const { width, height } = this._layout;
    const rules = scope === 'best' ? this._layout.general.rules : this._layout.rules;
    const slate = ctx.createRadialGradient(width / 2, height / 2, 100, width / 2, height / 2, Math.max(width, height) * 0.7);
    slate.addColorStop(0, '#1b1f26');
    slate.addColorStop(1, '#0b0d11');
    ctx.fillStyle = slate;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.35)';
    ctx.lineWidth = 2;
    for (const [fromX, fromY, toX, toY] of rules) {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    }
  }

  /**
   * The name of the player, the roles it plays and the scope shown.
   *
   * @param ctx - The canvas.
   * @param detail - The page of the player.
   * @param scope - The scope.
   */
  private _paintHead(ctx: CanvasRenderingContext2D, detail: PlayerDetail, scope: RankingMode): void {
    const { player } = detail;
    const { name, elo: eloAt } = this._layout;
    const right = this._layout.width - this._layout.margin;
    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    ctx.font = `700 ${eloAt.scope}px ${BOARD}`;
    ctx.fillText(SCOPES[scope].toUpperCase(), right, eloAt.scopeY);
    const elo = String(detail.stats[scope].elo);
    ctx.fillStyle = INK;
    ctx.font = `600 ${eloAt.size}px ${FIGURES}`;
    ctx.fillText(elo, right, eloAt.y);
    const eloWidth = ctx.measureText(elo).width;
    ctx.fillStyle = MUTED;
    ctx.font = `500 ${eloAt.label}px ${FIGURES}`;
    ctx.fillText('ELO', right - eloWidth - 14, eloAt.y);
    const eloLeft = right - eloWidth - 14 - ctx.measureText('ELO').width;

    // The name as big as it fits before the ELO
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    let size = name.size;
    ctx.font = `700 ${size}px ${NAME}`;
    const room = eloLeft - 30 - name.x;
    if (ctx.measureText(player.name).width > room) {
      size = Math.max(40, Math.floor((size * room) / ctx.measureText(player.name).width));
      ctx.font = `700 ${size}px ${NAME}`;
    }

    ctx.fillText(player.name, name.x, name.y);
    ctx.fillStyle = MUTED;
    ctx.font = `italic 500 ${name.roles}px ${TEXT}`;
    const roles = player.playsAttack && player.playsDefense ? 'Attacco e difesa' : player.playsAttack ? 'Solo attacco' : 'Solo difesa';
    const rolesY = name.y + name.roles * 1.6;
    ctx.fillText(roles, name.x + 4, rolesY);

    // Its position in the ranking of the scope, after the roles
    const rank = detail.stats[scope].rank;
    const rankX = name.x + 4 + ctx.measureText(`${roles}     `).width;
    ctx.fillStyle = (rank && RANK_COLORS[rank]) || INK;
    // The number in the font of the figures: in the other one a 1 looks like an I. The writing is shortened to what fits
    // before the ELO
    const number = rank ? `${rank}°` : '—';
    ctx.font = `700 ${name.roles}px ${FIGURES}`;
    ctx.fillText(number, rankX, rolesY);
    const numberWidth = ctx.measureText(number).width;
    ctx.font = `700 ${name.roles}px ${BOARD}`;
    const left = eloLeft - 20 - (rankX + numberWidth + 10);
    const caption = (rank ? ['IN CLASSIFICA', 'POSTO'] : ['NON CLASSIFICATO', 'NON CLASS.']).find(text => ctx.measureText(text).width <= left);
    if (caption) {
      ctx.fillText(caption, rankX + numberWidth + 10, rolesY);
    }

    this._paintIcon(ctx, player.icon, rank);
  }

  /**
   * The figures: the ELOs and the matches, then the record, the streaks and the goals.
   *
   * @param ctx - The canvas.
   * @param detail - The page of the player.
   * @param stats - The statistics of the scope.
   * @param scope - The scope.
   */
  private _paintFigures(ctx: CanvasRenderingContext2D, detail: PlayerDetail, stats: PlayerStats, scope: RankingMode): void {
    const headline: Figure[] =
      scope === 'best'
        ? [
            { label: 'ELO attacco', value: String(detail.player.eloAttack), detail: `${detail.player.matchesAttack} p.` },
            { label: 'ELO difesa', value: String(detail.player.eloDefense), detail: `${detail.player.matchesDefense} p.` },
            { label: 'Miglior ELO', value: String(stats.bestElo), color: GOOD },
            { label: 'Partite', value: String(stats.matches) }
          ]
        : [
            { label: 'ELO', value: String(stats.elo) },
            { label: 'Miglior ELO', value: String(stats.bestElo), color: GOOD },
            { label: 'Peggior ELO', value: String(stats.worstElo), color: BAD },
            { label: 'Partite', value: String(stats.matches) }
          ];
    const ratio = stats.goalsAgainst ? stats.goalsFor / stats.goalsAgainst : 0;
    const summary: Figure[] = [
      { label: 'V / S', value: `${stats.wins} - ${stats.matches - stats.wins}`, detail: `${rate(stats.wins, stats.matches)}%` },
      { label: 'Serie vittorie', value: String(stats.bestWinStreak), color: GOOD },
      { label: 'Serie sconfitte', value: String(stats.worstLossStreak), color: BAD },
      { label: 'Goal F / S', value: `${stats.goalsFor} / ${stats.goalsAgainst}`, detail: stats.goalsAgainst ? ratio.toFixed(2) : '', color: ratio >= 1 ? GOOD : BAD },
      { label: 'Media goal F / S', value: `${average(stats.goalsFor, stats.matches)} / ${average(stats.goalsAgainst, stats.matches)}` }
    ];
    for (const row of this._layout.rows) {
      this._paintRow(ctx, (row.figures === 'headline' ? headline : summary).slice(row.from, row.to), row.labelY, row.valueY, row.size);
    }
  }

  /**
   * A row of figures, evenly spread.
   *
   * @param ctx - The canvas.
   * @param figures - The figures.
   * @param labelY - Where their labels stand.
   * @param valueY - Where their values stand.
   * @param size - The size of the values, in pixels.
   */
  private _paintRow(ctx: CanvasRenderingContext2D, figures: Figure[], labelY: number, valueY: number, size: number): void {
    const { margin, label } = this._layout;
    const width = (this._layout.width - margin * 2) / figures.length;
    figures.forEach((figure, i) => {
      const x = margin + i * width;
      ctx.textAlign = 'left';
      ctx.fillStyle = MUTED;
      ctx.font = `500 ${label}px ${FIGURES}`;
      ctx.fillText(figure.label.toUpperCase(), x, labelY);
      ctx.fillStyle = figure.color ?? INK;
      ctx.font = `600 ${size}px ${FIGURES}`;
      ctx.fillText(figure.value, x, valueY);
      if (figure.detail) {
        const end = x + ctx.measureText(figure.value).width + 12;
        ctx.fillStyle = MUTED;
        ctx.font = `500 ${label}px ${FIGURES}`;
        ctx.fillText(figure.detail, end, valueY);
      }
    });
  }

  /**
   * The teammates and the opponents worth a mention, in a column beside the chart.
   *
   * @param ctx - The canvas.
   * @param stats - The statistics of the scope.
   * @param scope - The scope: the general one has no chart, and gives its room to the mentions.
   */
  private _paintMentions(ctx: CanvasRenderingContext2D, stats: PlayerStats, scope: RankingMode): void {
    const mentions: Array<[string, PlayerResult | null, boolean]> = [
      ['Sempre in mezzo alle palle', stats.frequentTeammate, false],
      ['Il tuo squalo', stats.bestTeammate, true],
      ['Il filippo di turno', stats.worstTeammate, true],
      ['Il gargaro di turno', stats.strongestOpponent, true],
      ['Sogliola Free Elo', stats.weakestOpponent, true]
    ];
    const layout = scope === 'best' ? this._layout.general.mentions : this._layout.mentions;
    ctx.textAlign = 'left';
    ctx.fillStyle = GOLD;
    ctx.font = `700 ${this._layout.title}px ${BOARD}`;
    ctx.fillText('COMPAGNI E AVVERSARI', layout.columns[0]!, layout.titleY);
    const shown = mentions.filter(([, result]) => result);
    shown.forEach(([label, result, isDelta], i) => {
      // Row by row across the columns; a wider gap between a mention and the next than between a label and its name
      const x = layout.columns[i % layout.columns.length]!;
      const y = layout.top + Math.floor(i / layout.columns.length) * layout.step;
      ctx.textAlign = 'left';
      ctx.fillStyle = MUTED;
      ctx.font = `italic 500 ${layout.label}px ${TEXT}`;
      ctx.fillText(label, x, y);
      ctx.fillStyle = INK;
      ctx.font = `700 ${layout.name}px ${NAME}`;
      ctx.fillText(result!.player.name, x, y + layout.nameY);
      ctx.textAlign = 'right';
      ctx.fillStyle = isDelta ? (result!.value >= 0 ? GOOD : BAD) : INK;
      ctx.font = `600 ${layout.value}px ${FIGURES}`;
      ctx.fillText(isDelta ? `${signed(result!.value)} ELO` : `${result!.value} partite`, x + layout.width, y + layout.nameY);
    });
  }

  /**
   * The marks of the ELO axis, with faint lines across the chart.
   *
   * @param ctx - The canvas.
   * @param low - The lowest ELO of the chart.
   * @param high - The highest.
   */
  private _paintAxis(ctx: CanvasRenderingContext2D, low: number, high: number): void {
    const { chart } = this._layout;
    ctx.textAlign = 'right';
    ctx.font = `500 ${this._layout.axis}px ${FIGURES}`;
    for (let i = 0; i < 4; i++) {
      const value = Math.round(high - ((high - low) * i) / 3);
      const y = chart.top + ((chart.bottom - chart.top) * i) / 3;
      ctx.fillStyle = MUTED;
      ctx.fillText(String(value), chart.left - 14, y + 8);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(chart.left, y);
      ctx.lineTo(chart.right, y);
      ctx.stroke();
    }
  }

  /**
   * The icon of the player in a round frame, ringed with the colour of its rank: its image, its emoji or a silhouette.
   *
   * @param ctx - The canvas.
   * @param icon - The URL of an image, an emoji, or `''`.
   * @param rank - The rank, `null` when it never played in the scope.
   */
  private _paintIcon(ctx: CanvasRenderingContext2D, icon: string, rank: number | null): void {
    const { x, y, radius } = this._layout.icon;
    const isUrl = /^(https?:|data:|\/)/.test(icon);
    ctx.save();
    ctx.fillStyle = '#2a303a';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();
    const image = isUrl ? this._image(icon) : null;
    if (image) {
      // Covering the frame, from the middle of the image
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, x - radius, y - radius, radius * 2, radius * 2);
    } else if (icon && !isUrl) {
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${radius * 1.1}px ${TEXT}`;
      ctx.fillText(icon, x, y + radius * 0.06);
    } else if (!isUrl) {
      // A silhouette: head and shoulders
      ctx.fillStyle = MUTED;
      ctx.beginPath();
      ctx.arc(x, y - radius * 0.2, radius * 0.34, 0, Math.PI * 2);
      ctx.ellipse(x, y + radius * 0.95, radius * 0.7, radius * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.strokeStyle = (rank && RANK_COLORS[rank]) || '#8b95a5';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * The image of an icon: `null` while it loads (the board is painted again when it arrives) or when it cannot be loaded.
   *
   * @param url - Its URL.
   * @returns The image.
   */
  private _image(url: string): HTMLImageElement | null {
    if (this._images.has(url)) {
      return this._images.get(url)!;
    }

    this._images.set(url, null);
    const image = new Image();
    image.onload = () => {
      this._images.set(url, image);
      if (this._shown) {
        this.show(this._shown.detail, this._shown.scope);
      }
    };

    image.src = url;
    return null;
  }

  /**
   * Rebuilds the tubes of the chart: one per role, standing out of the board, with a bead on the last point.
   *
   * @param series - The ELOs of each role after each match.
   * @param low - The lowest ELO of the chart.
   * @param high - The highest.
   */
  private _buildChart(series: Array<{ role: Role; elos: number[] }>, low: number, high: number): void {
    for (const child of [...this._chart.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this._chart.remove(mesh);
    }

    for (const { role, elos } of series) {
      if (elos.length < 2) {
        continue;
      }

      const points = elos.map((elo, i) => this._chartPoint(i, elos.length, elo, low, high));
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 1; i < points.length; i++) {
        path.add(new THREE.LineCurve3(points[i - 1]!, points[i]!));
      }

      const glow = phong({ color: ROLE_COLORS[role], emissive: ROLE_COLORS[role], emissiveIntensity: 0.6, roughness: 0.4 });
      this._chart.add(new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(detail(400, 800), (points.length - 1) * 2), 0.014, detail(4, 6), false), glow));
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.045, detail(8, 16), detail(6, 12)), glow.clone());
      bead.position.copy(points.at(-1)!);
      this._chart.add(bead);
    }
  }


  /**
   * Draws a bead on each match of the chart, to show where the pointer gets its summary: one instanced mesh for each
   * role, so that they cost two draws whatever the matches.
   *
   * @param points - The matches on the chart.
   */
  private _buildBeads(points: ChartPoint[]): void {
    const geometry = new THREE.SphereGeometry(0.045, detail(8, 16), detail(6, 12));
    const matrix = new THREE.Matrix4();
    for (const role of ['attack', 'defense'] as const) {
      const own = points.filter(point => point.match.role === role);
      if (!own.length) {
        continue;
      }

      const beads = new THREE.InstancedMesh(geometry, phong({ color: ROLE_COLORS[role], emissive: ROLE_COLORS[role], emissiveIntensity: 0.6, roughness: 0.4 }), own.length);
      own.forEach((point, i) => beads.setMatrixAt(i, matrix.makeTranslation(point.position.x, point.position.y, point.position.z)));
      this._chart.add(beads);
    }
  }
  /**
   * Where a point of the chart is on the board, standing out of it.
   *
   * @param index - The point, from 0 (the start).
   * @param count - How many points the line has.
   * @param elo - Its ELO.
   * @param low - The lowest ELO of the chart.
   * @param high - The highest.
   * @returns The point, in the space of the board.
   */
  private _chartPoint(index: number, count: number, elo: number, low: number, high: number): THREE.Vector3 {
    const { chart } = this._layout;
    const x = chart.left + ((chart.right - chart.left) * index) / (count - 1);
    const y = chart.bottom - ((elo - low) / (high - low)) * (chart.bottom - chart.top);
    return new THREE.Vector3(this._x(x), this._y(y), 0.07);
  }

  /**
   * Where a point of the canvas is on the board, across.
   *
   * @param x - Pixels from the left of the canvas.
   * @returns The position on the board, from its centre.
   */
  private _x(x: number): number {
    return (x / this._layout.width - 0.5) * this._width;
  }

  /**
   * Where a point of the canvas is on the board, up and down.
   *
   * @param y - Pixels from the top of the canvas.
   * @returns The position on the board, from its centre.
   */
  private _y(y: number): number {
    return (0.5 - y / this._layout.height) * this._height;
  }
}

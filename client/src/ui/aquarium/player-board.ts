import * as THREE from 'three';
import { DISPLAY, FIGURES, NAME, TEXT } from './fonts';
import type { PlayerDetail, PlayerMatch, PlayerResult, PlayerStats, RankingMode, Role } from '../../core/api/api.models';

/*
  The board of a player, on the wall in front of the foosball table, between the rules and the matches: its name and
  its rank on a medal that turns slowly, its figures painted on the slate, and the trend of its ELO as tubes of light
  standing out of the board (red in attack, blue in defence), with its teammates and opponents beside them.
*/

/**
 * Size of the canvas the slate is painted on, in pixels: as wide as tall as the face of the board.
 */
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;

/**
 * Where the chart is on the canvas, in pixels.
 */
const CHART = { left: 140, right: 990, top: 610, bottom: 950 };

/**
 * Where the medal is on the canvas: its centre and its radius, in pixels.
 */
const MEDAL = { x: 150, y: 128, radius: 92 };

/**
 * The colours of the medal by rank, and of the lines of the roles.
 */
const MEDAL_COLORS: Record<number, string> = { 1: '#f5c542', 2: '#d6dbe2', 3: '#d08a4a' };
const ROLE_COLORS: Record<Role, number> = { attack: 0xfb7185, defense: 0x60a5fa };

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
  private readonly _canvas = document.createElement('canvas');
  private readonly _texture: THREE.CanvasTexture;
  private readonly _medalCanvas = document.createElement('canvas');
  private readonly _medalTexture: THREE.CanvasTexture;
  private readonly _medal: THREE.Mesh;
  private readonly _medalMetal: THREE.MeshStandardMaterial;
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

  /**
   * @param width - Width of the face of the board.
   * @param height - Its height.
   */
  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this._canvas.width = CANVAS_WIDTH;
    this._canvas.height = CANVAS_HEIGHT;
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.colorSpace = THREE.SRGBColorSpace;
    this._texture.anisotropy = 8;
    this.slate = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: this._texture, roughness: 0.85 }));
    this.slate.position.z = 0.02;
    this.object.add(this.slate);

    const light = new THREE.MeshBasicMaterial({ color: 0xf6dc7a, transparent: true, opacity: 0.55 });
    this._guide = new THREE.Mesh(new THREE.BoxGeometry(0.01, ((CHART.bottom - CHART.top) / CANVAS_HEIGHT) * height, 0.01), light);
    this._guide.position.set(0, this._y((CHART.top + CHART.bottom) / 2), 0.05);
    this._marker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this._guide.visible = false;
    this._marker.visible = false;
    this.object.add(this._guide, this._marker);

    // The medal: a coin of metal with the rank on its face
    this._medalCanvas.width = 256;
    this._medalCanvas.height = 256;
    this._medalTexture = new THREE.CanvasTexture(this._medalCanvas);
    this._medalTexture.colorSpace = THREE.SRGBColorSpace;
    this._medalMetal = new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.75, roughness: 0.3 });
    const radius = (MEDAL.radius / CANVAS_WIDTH) * width;
    this._medal = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.07, 48), [
      this._medalMetal,
      new THREE.MeshStandardMaterial({ map: this._medalTexture, metalness: 0.5, roughness: 0.35 }),
      this._medalMetal
    ]);
    // Laid flat facing the room, then turned about the vertical
    this._medal.rotation.order = 'YXZ';
    this._medal.rotation.x = Math.PI / 2;
    // The face of a cylinder laid down has its letters sideways: turned back upright
    this._medalTexture.center.set(0.5, 0.5);
    this._medalTexture.rotation = Math.PI / 2;
    // Far enough out of the slate that its edge never sinks into it while it turns
    this._medal.position.set(this._x(MEDAL.x), this._y(MEDAL.y), 0.3);
    this.object.add(this._medal, this._chart);
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
    this._paintSlate(ctx);
    if (!detail) {
      ctx.fillStyle = MUTED;
      ctx.font = `italic 500 60px ${TEXT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Scegli un giocatore…', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      this._medal.visible = false;
      this._buildChart([], 0, 1);
      this._texture.needsUpdate = true;
      return;
    }

    const stats = detail.stats[scope];
    this._paintHead(ctx, detail, scope);
    this._paintFigures(ctx, detail, stats, scope);
    this._paintMentions(ctx, stats);
    this._paintMedal(stats.rank);
    this._medal.visible = true;

    // The chart: the axis painted, the lines as tubes
    const { matches, series } = trend(detail, scope);
    ctx.fillStyle = GOLD;
    ctx.font = `700 26px ${DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.fillText('ANDAMENTO ELO', 60, CHART.top - 32);
    if (!series.length) {
      ctx.fillStyle = MUTED;
      ctx.font = `italic 500 40px ${TEXT}`;
      ctx.fillText('Ancora nessuna partita in questo ruolo', CHART.left, (CHART.top + CHART.bottom) / 2);
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
    const inside =
      point &&
      this._points.length &&
      point.x >= this._x(CHART.left) - 0.1 &&
      point.x <= this._x(CHART.right) + 0.1 &&
      point.y <= this._y(CHART.top) + 0.1 &&
      point.y >= this._y(CHART.bottom) - 0.1;
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
    (this._marker.material as THREE.MeshBasicMaterial).color.set(ROLE_COLORS[nearest.match.role]).lerp(new THREE.Color(0xffffff), 0.4);
    this._guide.visible = true;
    this._marker.visible = true;
    return nearest;
  }

  /**
   * Turns the medal a little to and fro, catching the light.
   *
   * @param time - Seconds since the start.
   */
  public animate(time: number): void {
    this._medal.rotation.y = Math.sin(time * 0.8) * 0.4;
  }

  /**
   * The slate: dark, a little lighter in the middle, with thin gold rules between its parts.
   *
   * @param ctx - The canvas.
   */
  private _paintSlate(ctx: CanvasRenderingContext2D): void {
    const slate = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 100, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.7);
    slate.addColorStop(0, '#1b1f26');
    slate.addColorStop(1, '#0b0d11');
    ctx.fillStyle = slate;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = 'rgba(201, 162, 39, 0.35)';
    ctx.lineWidth = 2;
    for (const y of [250, 540]) {
      ctx.beginPath();
      ctx.moveTo(60, y);
      ctx.lineTo(CANVAS_WIDTH - 60, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(1040, 560);
    ctx.lineTo(1040, 950);
    ctx.stroke();
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
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = `700 92px ${NAME}`;
    ctx.fillText(player.name, 290, 135);
    ctx.fillStyle = MUTED;
    ctx.font = `italic 500 36px ${TEXT}`;
    const roles = player.playsAttack && player.playsDefense ? 'Attacco e difesa' : player.playsAttack ? 'Solo attacco' : 'Solo difesa';
    ctx.fillText(roles, 294, 192);

    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    ctx.font = `700 30px ${DISPLAY}`;
    ctx.fillText(SCOPES[scope].toUpperCase(), CANVAS_WIDTH - 60, 100);
    const elo = String(detail.stats[scope].elo);
    ctx.fillStyle = INK;
    ctx.font = `600 88px ${FIGURES}`;
    ctx.fillText(elo, CANVAS_WIDTH - 60, 190);
    const eloWidth = ctx.measureText(elo).width;
    ctx.fillStyle = MUTED;
    ctx.font = `500 26px ${FIGURES}`;
    ctx.fillText('ELO', CANVAS_WIDTH - 60 - eloWidth - 14, 190);
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
    this._paintRow(ctx, headline, 310, 380, 64);
    this._paintRow(ctx, summary, 440, 500, 38);
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
    const width = (CANVAS_WIDTH - 120) / figures.length;
    figures.forEach((figure, i) => {
      const x = 60 + i * width;
      ctx.textAlign = 'left';
      ctx.fillStyle = MUTED;
      ctx.font = `500 24px ${FIGURES}`;
      ctx.fillText(figure.label.toUpperCase(), x, labelY);
      ctx.fillStyle = figure.color ?? INK;
      ctx.font = `600 ${size}px ${FIGURES}`;
      ctx.fillText(figure.value, x, valueY);
      if (figure.detail) {
        const end = x + ctx.measureText(figure.value).width + 12;
        ctx.fillStyle = MUTED;
        ctx.font = `500 24px ${FIGURES}`;
        ctx.fillText(figure.detail, end, valueY);
      }
    });
  }

  /**
   * The teammates and the opponents worth a mention, in a column beside the chart.
   *
   * @param ctx - The canvas.
   * @param stats - The statistics of the scope.
   */
  private _paintMentions(ctx: CanvasRenderingContext2D, stats: PlayerStats): void {
    const mentions: Array<[string, PlayerResult | null, boolean]> = [
      ['Sempre in mezzo alle palle', stats.frequentTeammate, false],
      ['True Bro', stats.bestTeammate, true],
      ['Il filippo di turno', stats.worstTeammate, true],
      ['Best Enemy', stats.strongestOpponent, true],
      ['Free Elo', stats.weakestOpponent, true]
    ];
    ctx.textAlign = 'left';
    ctx.fillStyle = GOLD;
    ctx.font = `700 26px ${DISPLAY}`;
    ctx.fillText('COMPAGNI E AVVERSARI', 1080, CHART.top - 32);
    let y = CHART.top - 4;
    for (const [label, result, isDelta] of mentions) {
      if (!result) {
        continue;
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = MUTED;
      ctx.font = `italic 500 26px ${TEXT}`;
      ctx.fillText(label, 1080, y);
      ctx.fillStyle = INK;
      ctx.font = `700 32px ${NAME}`;
      ctx.fillText(result.player.name, 1080, y + 33);
      ctx.textAlign = 'right';
      ctx.fillStyle = isDelta ? (result.value >= 0 ? GOOD : BAD) : INK;
      ctx.font = `600 30px ${FIGURES}`;
      ctx.fillText(isDelta ? `${signed(result.value)} ELO` : `${result.value} partite`, CANVAS_WIDTH - 60, y + 33);
      // A wider gap between a mention and the next than between a label and its name
      y += 76;
    }
  }

  /**
   * The marks of the ELO axis, with faint lines across the chart.
   *
   * @param ctx - The canvas.
   * @param low - The lowest ELO of the chart.
   * @param high - The highest.
   */
  private _paintAxis(ctx: CanvasRenderingContext2D, low: number, high: number): void {
    ctx.textAlign = 'right';
    ctx.font = `500 22px ${FIGURES}`;
    for (let i = 0; i < 4; i++) {
      const value = Math.round(high - ((high - low) * i) / 3);
      const y = CHART.top + ((CHART.bottom - CHART.top) * i) / 3;
      ctx.fillStyle = MUTED;
      ctx.fillText(String(value), CHART.left - 14, y + 8);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CHART.left, y);
      ctx.lineTo(CHART.right, y);
      ctx.stroke();
    }
  }

  /**
   * The rank on the face of the medal, and the metal of its rim: gold, silver, bronze, or steel further down.
   *
   * @param rank - The rank, `null` when it never played in the scope.
   */
  private _paintMedal(rank: number | null): void {
    const color = (rank && MEDAL_COLORS[rank]) || '#8b95a5';
    this._medalMetal.color.set(color);
    const ctx = this._medalCanvas.getContext('2d')!;
    const face = ctx.createRadialGradient(100, 90, 10, 128, 128, 128);
    face.addColorStop(0, '#ffffff');
    face.addColorStop(0.35, color);
    face.addColorStop(1, '#3a2a0a');
    ctx.fillStyle = face;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(40, 26, 8, 0.6)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2a1d04';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 104px ${DISPLAY}`;
    ctx.fillText(rank ? `${rank}°` : '—', 128, 136);
    this._medalTexture.needsUpdate = true;
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

      const glow = new THREE.MeshStandardMaterial({ color: ROLE_COLORS[role], emissive: ROLE_COLORS[role], emissiveIntensity: 0.6, roughness: 0.4 });
      this._chart.add(new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(800, (points.length - 1) * 2), 0.014, 6, false), glow));
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), glow.clone());
      bead.position.copy(points.at(-1)!);
      this._chart.add(bead);
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
    const x = CHART.left + ((CHART.right - CHART.left) * index) / (count - 1);
    const y = CHART.bottom - ((elo - low) / (high - low)) * (CHART.bottom - CHART.top);
    return new THREE.Vector3(this._x(x), this._y(y), 0.07);
  }

  /**
   * Where a point of the canvas is on the board, across.
   *
   * @param x - Pixels from the left of the canvas.
   * @returns The position on the board, from its centre.
   */
  private _x(x: number): number {
    return (x / CANVAS_WIDTH - 0.5) * this._width;
  }

  /**
   * Where a point of the canvas is on the board, up and down.
   *
   * @param y - Pixels from the top of the canvas.
   * @returns The position on the board, from its centre.
   */
  private _y(y: number): number {
    return (0.5 - y / CANVAS_HEIGHT) * this._height;
  }
}

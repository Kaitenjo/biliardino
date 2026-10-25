import { CustomElement, Property, Query, WebComponent } from '@xaendar/core';
import { computed, signal, untracked } from '@xaendar/core/signals';
import type { InputSignal, QuerySignal } from '@xaendar/core/signals';
import type { LeaderboardEntry, LobbyPlayer, MatchPlayer, PlayerDetail, RankingMode, RunningMatch } from '../../core/api/api.models';
import type { SeatKey } from './foosball3d';
import { loadFonts } from './fonts';
import type { AquariumScene, ChartHover, View, Wall } from './scene';

/**
 * A place by the foosball table, with the player of the match standing there.
 */
interface Seat {
  key: SeatKey;
  /**
   * Its team: white is the red one of the match, brown the blue one.
   */
  side: 'white' | 'brown';
  role: string;
  player: MatchPlayer;
}

/**
 * A place of the podium of the hall of fame.
 */
export interface PodiumPlace {
  player: LeaderboardEntry;
  /**
   * Its rank, 1 to 3: players tied in the leaderboard share it.
   */
  place: number;
  /**
   * The step it stands on: 0 the left one (the 2nd), 1 the middle one (the 1st), 2 the right one (the 3rd).
   */
  slot: number;
}

/**
 * The 3D lobby (three.js), filling its box: the ocean seen through the window of a rich lounge under the sea, with a
 * creature for each
 * player in the lobby (clownfish, surgeonfish, puffer, angelfish, goldfish, great white shark, betta, octopus, sole,
 * sardines and tuna, picked at random and all different while possible) and its name above; and the lounge,
 * with a foosball table where the icons of the 4 players of the match stand by their handles. The camera
 * travels between the two as `view` changes, and to the left of the aquarium, to the hall of fame: a sunken temple
 * with the first three of the leaderboard on its podium. It draws only while it is on the screen.
 */
@WebComponent({
  selector: 'lobby-aquarium',
  styleUrl: './aquarium.xd.component.scss',
  templateUrl: './aquarium.xd.component.html'
})
export class AquariumComponent extends CustomElement {
  /**
   * The players in the lobby.
   */
  @Property.required()
  public accessor players!: InputSignal<LobbyPlayer[]>;
  /**
   * The match to play, whose players stand at the table; `null` when there is none.
   */
  @Property<InputSignal<RunningMatch | null>>(null)
  public accessor match!: InputSignal<RunningMatch | null>;
  /**
   * The first three of the leaderboard, standing on the podium of the hall of fame.
   */
  @Property<InputSignal<PodiumPlace[]>>([])
  public accessor podium!: InputSignal<PodiumPlace[]>;
  /**
   * The player on the board in front of the table, `null` for none, and the scope of its figures.
   */
  @Property<InputSignal<PlayerDetail | null>>(null)
  public accessor profile!: InputSignal<PlayerDetail | null>;
  @Property<InputSignal<RankingMode>>('best')
  public accessor profileScope!: InputSignal<RankingMode>;
  /**
   * What the camera shows.
   */
  @Property<InputSignal<View>>('aquarium')
  public accessor view!: InputSignal<View>;
  /**
   * Whether the browser can't draw in 3D (no WebGL): the names are listed instead.
   */
  public readonly failed = signal(false);
  /**
   * What the aquarium shows, for screen readers: who is in.
   */
  public readonly description = computed(() => `Acquario della lobby: ${this.players().map(player => player.name).join(', ') || 'vuoto'}`);
  /**
   * The players of the match by the table.
   */
  public readonly seats = computed(() => this._computeSeats());
  /**
   * The match of the chart of the player under the pointer, as a list of at most one item.
   */
  public readonly chartHover = signal<ChartHover[]>([]);

  /**
   * The box of the scene.
   */
  @Query.required('.water')
  public accessor water!: QuerySignal<HTMLElement>;
  /**
   * Where the scene is drawn.
   */
  @Query.required('canvas')
  public accessor canvas!: QuerySignal<HTMLCanvasElement>;
  /**
   * The layer of the names, over the canvas.
   */
  @Query.required('.labels')
  public accessor labels!: QuerySignal<HTMLElement>;
  /**
   * The icons of the players of the match.
   */
  @Query.all<HTMLElement>('.seat')
  public accessor seatElements!: QuerySignal<HTMLElement[]>;
  /**
   * The icons of the first three, on the podium.
   */
  @Query.all<HTMLElement>('.champion')
  public accessor podiumElements!: QuerySignal<HTMLElement[]>;
  /**
   * Where the page puts what is drawn over the boards on the walls (`matches`), to keep over their faces.
   */
  @Query.all<HTMLSlotElement>('slot')
  public accessor wallSlots!: QuerySignal<HTMLSlotElement[]>;

  /**
   * The 3D scene, once created.
   */
  private _scene: AquariumScene | null = null;
  /**
   * Follows the size of the box.
   */
  private _resizeObserver: ResizeObserver | null = null;
  /**
   * Tells when the box is on the screen.
   */
  private _visibilityObserver: IntersectionObserver | null = null;
  /**
   * Whether the scene left the page, maybe while three.js was downloading.
   */
  private _destroyed = false;

  /**
   * Keeps the scene in step with the players, the view and the icons of the match.
   */
  public onInit(): void {
    this.effect(() => {
      const players = this.players();
      untracked(() => this._scene?.setPlayers(players));
    });
    this.effect(() => {
      const profile = this.profile();
      const scope = this.profileScope();
      untracked(() => this._scene?.setPlayer(profile, scope));
    });
    this.effect(() => {
      const view = this.view();
      untracked(() => this._scene?.setView(view));
    });
    this.effect(() => {
      const elements = this.seatElements();
      untracked(() => this._scene?.setSeats(this._seatMap(elements)));
    });
    this.effect(() => {
      const elements = this.podiumElements();
      untracked(() => this._scene?.setPodium(elements));
    });
  }

  /**
   * Creates the scene once the canvas exists, and follows the size and the visibility of the box.
   */
  public async afterRender(): Promise<void> {
    try {
      // three.js is big: it is downloaded only by the page that shows the scene
      // The writings of the scene are painted once: with their fonts, loaded first
      const [{ AquariumScene }] = await Promise.all([import('./scene'), loadFonts()]);
      if (this._destroyed) {
        return;
      }
      
      this._scene = new AquariumScene(this.canvas(), this.labels(), matchMedia('(prefers-reduced-motion: reduce)').matches);
      this._scene.onChartHover = hover => this.chartHover.set(hover ? [hover] : []);
    } catch {
      this.failed.set(true);
      return;
    }

    const water = this.water();
    this._scene.resize(water.clientWidth, water.clientHeight);
    untracked(() => {
      this._scene!.setPlayers(this.players());
      this._scene!.setView(this.view());
      this._scene!.setSeats(this._seatMap(this.seatElements()));
      this._scene!.setPodium(this.podiumElements());
      this.placeWalls();
      this._scene!.setPlayer(this.profile(), this.profileScope());
    });
    this._resizeObserver = new ResizeObserver(([entry]) => this._scene?.resize(entry!.contentRect.width, entry!.contentRect.height));
    this._resizeObserver.observe(water);
    this._visibilityObserver = new IntersectionObserver(([entry]) => this._scene?.setVisible(entry!.isIntersecting));
    this._visibilityObserver.observe(water);
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
   * The day a match was played.
   *
   * @param playedAt - When, in UTC (`YYYY-MM-DD HH:MM:SS`).
   * @returns The date in Italian time, e.g. `23/10/2026`.
   */
  public formatDate(playedAt: string): string {
    return new Date(`${playedAt.replace(' ', 'T')}Z`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /**
   * Gives the scene what the page put in the slot of each board on the walls, if anything.
   */
  public placeWalls(): void {
    for (const slot of this.wallSlots()) {
      this._scene?.setWall(slot.name as Wall, (slot.assignedElements()[0] as HTMLElement | undefined) ?? null);
    }
  }

  /**
   * Stops drawing and frees the scene.
   */
  public onDestroy(): void {
    this._destroyed = true;
    this._resizeObserver?.disconnect();
    this._visibilityObserver?.disconnect();
    this._scene?.dispose();
    this._scene = null;
  }

  /**
   * The icons of the players by their place.
   *
   * @param elements - The icons.
   * @returns The icons, by the place written on them.
   */
  private _seatMap(elements: HTMLElement[]): Map<SeatKey, HTMLElement> {
    return new Map(elements.map(element => [element.dataset['key'] as SeatKey, element]));
  }

  /**
   * Computes the value of `seats`.
   *
   * @returns The 4 players of the match in their places, none without a match.
   */
  private _computeSeats(): Seat[] {
    const match = this.match();
    if (!match) {
      return [];
    }

    return [
      { key: 'white-defense', side: 'white', role: 'Difesa', player: match.red.defense },
      { key: 'white-attack', side: 'white', role: 'Attacco', player: match.red.attack },
      { key: 'brown-attack', side: 'brown', role: 'Attacco', player: match.blue.attack },
      { key: 'brown-defense', side: 'brown', role: 'Difesa', player: match.blue.defense }
    ];
  }
}

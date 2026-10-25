import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { LobbyPlayer } from '../../core/api/api.models';
import { buildChest, buildCreature, buildRock, buildSeaweed, buildShipwreck, SPECIES } from './creatures';
import type { Creature, Species } from './creatures';
import {
  buildAmphora,
  buildAnchor,
  buildBarrel,
  buildBranchCoral,
  buildBrainCoral,
  buildJellyfish,
  buildRockArch,
  buildSeaFan,
  schoolFishGeometry
} from './decor';
import type { Swaying } from './decor';
import { buildFoosballTable } from './foosball3d';
import type { SeatKey } from './foosball3d';
import { RULES } from '../../core/rules/rules';
import { buildHallOfFame } from './hall-of-fame';
import type { HallOfFame } from './hall-of-fame';
import { buildLounge, LOUNGE_FLOOR, MATCH_BOARD, MATCH_BOARD_SIZE, RULES_BOARD, STATS_BOARD, STATS_BOARD_SIZE, TABLE_POSITION, WALL_Z } from './lounge';
import { PlayerBoard } from './player-board';
import type { PlayerDetail, PlayerMatch, RankingMode } from '../../core/api/api.models';
import { buildRulesBoard } from './rules-board';

/**
 * The match of the chart of the player under the pointer: the match, the ELO of the player after it, and where its
 * point is on the canvas, in pixels.
 */
export interface ChartHover {
  match: PlayerMatch;
  elo: number;
  x: number;
  y: number;
}

/*
  The 3D scene of the aquarium: the sea floor with a wreck, a treasure chest, rocks and seaweed, rays of light and
  bubbles, and a creature for each player in the lobby with its name above. Each creature wanders: it picks a random
  point (on the bottom for the sole, low for the octopus), steers there turning smoothly, now and then stops for a
  moment, and picks another one.
  It draws only while visible on the screen (`setVisible`), and not at all, after the first frame, for who asked for
  less motion.
*/

/**
 * Height of the sand.
 */
const FLOOR_Y = -3.4;

/**
 * Highest point the creatures reach.
 */
const TOP_Y = 2.6;

/**
 * Nearest and farthest depths of the creatures (the camera is at z = 12).
 */
const NEAR_Z = 2;
const FAR_Z = -3.5;

/**
 * How many bubbles rise.
 */
const BUBBLES = 70;

/**
 * Where the camera looks at the aquarium from: the sizes of the water seen are computed from here, wherever the camera
 * is now.
 */
const VIEW_Y = 0.4;
const VIEW_Z = 16;

/**
 * What the camera shows: the hall of fame on the sea floor left of the aquarium, the aquarium through the window of
 * the lounge, the foosball table in the lounge, or one of the three boards on the wall in front of the table: a player
 * in the middle, the rules on its left, the matches on its right.
 */
export type View = 'ranking' | 'aquarium' | 'table' | 'stats' | 'rules' | 'matches';

/**
 * The way of the camera goes from the hall of fame to the board of the player; the rules and the matches are beside
 * it, along the wall. Where each view is: how far along the way (0 the hall of fame, 1 the player), and how far
 * aside along the wall (-1 the rules, 0 the player, 1 the matches).
 */
const VIEW_PROGRESS: Record<View, number> = { ranking: 0, aquarium: 1 / 4, table: 3 / 4, stats: 1, rules: 1, matches: 1 };
const VIEW_SIDE: Record<View, number> = { ranking: 0, aquarium: 0, table: 0, stats: 0, rules: -1, matches: 1 };

/**
 * How far the camera stands in front of the boards, at least.
 */
const STATS_BOARD_DISTANCE = 7.6;
const RULES_BOARD_DISTANCE = 5.4;
const MATCH_BOARD_DISTANCE = 8.8;

/**
 * The boards on the walls whose content is a page element drawn over the canvas: where it is seen from, the corners
 * of the face, and the width the element is laid out at before being scaled to the face (`null`: laid out as big as
 * the face is seen, its content sized on its box).
 */
interface WallBoard {
  view: View;
  corners: THREE.Vector3[];
  layoutWidth: number | null;
}

/**
 * The boards on the walls drawn by the page: the matches.
 */
export type Wall = 'matches';

const WALL_BOARDS: Record<Wall, WallBoard> = {
  matches: {
    view: 'matches',
    corners: [-1, 1].flatMap(z =>
      [-1, 1].map(y => new THREE.Vector3(MATCH_BOARD.x, MATCH_BOARD.y + (y * MATCH_BOARD_SIZE.height) / 2, MATCH_BOARD.z + (z * MATCH_BOARD_SIZE.width) / 2))
    ),
    layoutWidth: null
  }
};

/**
 * Where the hall of fame stands: on the sand, far to the left of the aquarium.
 */
const HALL = new THREE.Vector3(-30, FLOOR_Y, -2);

/**
 * How far the camera stands in front of the hall of fame.
 */
const HALL_DISTANCE = 14;

/**
 * Seconds the camera takes from a place to another, however far: from the aquarium to the table as from the hall of
 * fame to the matches.
 */
const TRAVEL_SECONDS = 1.5;

/**
 * A step of the way of the camera: where it is and what it looks at; and, when it doesn't go straight to the next step,
 * the point its way bends towards.
 */
interface CameraStep {
  position: THREE.Vector3;
  target: THREE.Vector3;
  via?: THREE.Vector3;
}

/**
 * The camera in front of a board on the wall in front of the table, looking at it; a bit higher than its middle, so
 * that its name on top is seen too.
 *
 * @param board - The centre of the face of the board.
 * @param distance - How far from it.
 * @param lift - How much higher than its middle.
 * @returns The step.
 */
function facing(board: THREE.Vector3, distance: number, lift = 0.3): CameraStep {
  return {
    position: new THREE.Vector3(board.x - distance, board.y + lift, board.z),
    target: new THREE.Vector3(board.x, board.y + lift, board.z)
  };
}

/**
 * The way of the camera: the hall of fame, then out of the water through the window of the lounge to the aquarium
 * filling the screen, then back to see the window in the wall of the lounge, then across the lounge to the table, then
 * straight on over it to the board of the player.
 */
const CAMERA_PATH: readonly CameraStep[] = [
  {
    // In front of the hall of fame (moved aside when the screen is wide, see `resize`); from there it bends through the
    // window, not through the wall
    position: new THREE.Vector3(HALL.x, 1.4, HALL.z + HALL_DISTANCE),
    target: new THREE.Vector3(HALL.x, 0.6, HALL.z),
    via: new THREE.Vector3(-3, 0.6, 9)
  },
  { position: new THREE.Vector3(0, VIEW_Y, VIEW_Z), target: new THREE.Vector3(0, -0.4, 0) },
  { position: new THREE.Vector3(2, 1.4, WALL_Z + 17.5), target: new THREE.Vector3(2, 0.2, WALL_Z) },
  {
    // Behind one goal of the table, looking along it
    position: new THREE.Vector3(TABLE_POSITION.x - 5.5, .5, TABLE_POSITION.z),
    target: new THREE.Vector3(TABLE_POSITION.x - 1, LOUNGE_FLOOR + 2, TABLE_POSITION.z)
  },
  // In front of the board of the player (further back on a narrow screen, see `resize`)
  facing(STATS_BOARD, STATS_BOARD_DISTANCE)
];

/**
 * Where the camera stands beside the player, along the wall: in front of the rules, and in front of the matches.
 */
const SIDE_STEPS: Readonly<Record<'rules' | 'matches', CameraStep>> = {
  rules: facing(RULES_BOARD, RULES_BOARD_DISTANCE, 0),
  // Looking a bit below its middle, so that the board stands high and leaves room for its pages under it
  matches: facing(MATCH_BOARD, MATCH_BOARD_DISTANCE, -0.4)
};

/**
 * The species of the little fish without a name that swim in the background.
 */
const BACKGROUND_SPECIES: readonly Species[] = ['clown', 'tang', 'puffer', 'angel', 'gold', 'betta', 'tuna'];

/**
 * The vertical axis, to turn the schools.
 */
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A school of little fish in the background, all drawn at once: it crosses the water, turns back at the edge, and goes
 * up and down slowly.
 */
interface School {
  mesh: THREE.InstancedMesh;
  /**
   * Where each fish is in the school, and its own wobble.
   */
  offsets: THREE.Vector3[];
  phases: number[];
  /**
   * The middle of the school, its depth of rest, and its way: +1 to the right, -1 to the left.
   */
  center: THREE.Vector3;
  baseY: number;
  heading: number;
  direction: 1 | -1;
  speed: number;
}

/**
 * A jellyfish drifting up through the background.
 */
interface Drifter {
  swaying: Swaying;
  speed: number;
}

/**
 * A creature in the water, with where it goes.
 */
interface Inhabitant {
  creature: Creature;
  /**
   * Its species.
   */
  species: Species;
  /**
   * Where it is, how fast it goes, and where it is heading.
   */
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  target: THREE.Vector3;
  /**
   * Which way it faces (around the vertical) and how much its nose points up or down.
   */
  yaw: number;
  pitch: number;
  /**
   * Seconds it stays still before moving on.
   */
  pause: number;
  /**
   * Its own speed: each creature of a species is a bit different.
   */
  speed: number;
  /**
   * The depths where it swims: the players' creatures in front, the little fish without a name behind.
   */
  far: number;
  near: number;
  /**
   * The name of its player, over the canvas; none for the fish of the background.
   */
  label: HTMLElement | null;
  /**
   * How far it has appeared, 0 to 1 (1 once in the water), and the seconds since it began to vanish (`null` while it
   * stays): it grows in when its player enters the lobby, shrinks away when it leaves.
   */
  appear: number;
  vanish: number | null;
  /**
   * Its size once grown.
   */
  baseScale: THREE.Vector3;
}

/**
 * A puff around a creature appearing or vanishing: bubbles bursting out and a ring of light widening.
 */
interface Burst {
  bubbles: THREE.Points;
  velocities: Float32Array;
  ring: THREE.Mesh;
  /**
   * How big the creature is: the ring grows as wide.
   */
  size: number;
  age: number;
}

/**
 * Seconds a creature takes to grow in, to shrink away, and a puff to fade.
 */
const APPEAR_SECONDS = 0.6;
const VANISH_SECONDS = 0.5;
const BURST_SECONDS = 0.9;

/**
 * Bubbles in each puff.
 */
const BURST_BUBBLES = 40;

/**
 * Draws a bubble: a light ring with a faint inside.
 *
 * @returns The texture.
 */
function bubbleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(16, 16, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}

/**
 * Overshoots a bit and settles: the bounce of a creature growing in.
 *
 * @param t - From 0 to 1.
 * @returns The scale, from 0 to 1.
 */
function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/**
 * The aquarium in 3D.
 */
export class AquariumScene {
  private readonly _renderer: THREE.WebGLRenderer;
  private readonly _scene = new THREE.Scene();
  private readonly _camera = new THREE.PerspectiveCamera(38, 2, 0.1, 100);
  private readonly _inhabitants = new Map<number, Inhabitant>();
  private readonly _seaweeds: Array<{ segments: THREE.Object3D[]; phase: number }> = [];
  private readonly _swaying: Swaying[] = [];
  private readonly _jellyfish: Drifter[] = [];
  private readonly _schools: School[] = [];
  private readonly _background: Inhabitant[] = [];
  private readonly _dummy = new THREE.Object3D();
  private readonly _bubbleMap = bubbleTexture();
  private readonly _bursts: Burst[] = [];
  /**
   * Whether the players were already put in the water once: the first ones are there at once, the later ones appear.
   */
  private _populated = false;
  /**
   * Where the players of the match stand by the table, and the elements of their icons.
   */
  private readonly _seatAnchors = new Map<SeatKey, THREE.Vector3>();
  private _seatElements = new Map<SeatKey, HTMLElement>();
  /**
   * The hall of fame, the reflections of its metals, and the icons of the first three standing on its podium.
   */
  private readonly _hall: HallOfFame;
  private readonly _environment: THREE.Texture;
  private _podiumElements: HTMLElement[] = [];
  /**
   * What is drawn over the boards on the walls, kept over their faces.
   */
  private readonly _wallElements = new Map<Wall, HTMLElement>();
  /**
   * The way of the camera: its first step moves with the size of the screen.
   */
  private readonly _path: CameraStep[] = CAMERA_PATH.map(step => ({ position: step.position.clone(), target: step.target.clone(), via: step.via?.clone() }));
  /**
   * Where the camera stands beside the player, moved back on a narrow screen.
   */
  private readonly _sides = {
    rules: { position: SIDE_STEPS.rules.position.clone(), target: SIDE_STEPS.rules.target.clone() },
    matches: { position: SIDE_STEPS.matches.position.clone(), target: SIDE_STEPS.matches.target.clone() }
  };
  /**
   * How far the camera is along its way (0 the hall of fame, 1 the player) and aside along the wall (-1 the rules, 1 the
   * matches); where its trip started, where it is going, and the seconds since it left.
   */
  private _progress = VIEW_PROGRESS.aquarium;
  private _side = 0;
  private _start = { progress: VIEW_PROGRESS.aquarium, side: 0 };
  private _goal = { progress: VIEW_PROGRESS.aquarium, side: 0 };
  private _travelled = 0;
  private readonly _aside = new THREE.Vector3();
  /**
   * The board of the player, in the middle of the wall in front of the table.
   */
  private readonly _playerBoard: PlayerBoard;
  /**
   * Called with the match of the chart under the pointer, `null` when there is none anymore.
   */
  public onChartHover: ((hover: ChartHover | null) => void) | null = null;
  /**
   * Finds what is under the pointer, and whether a match of the chart is marked.
   */
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _pointer = new THREE.Vector2();
  private _hovering = false;
  /**
   * Marks the match under the pointer, while the camera is at the board of the player.
   *
   * @param event - The move of the pointer over the canvas.
   */
  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (this._near('stats', 0.05) < 1) {
      this._clearHover();
      return;
    }

    const rect = this._renderer.domElement.getBoundingClientRect();
    this._pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._pointer, this._camera);
    const [hit] = this._raycaster.intersectObject(this._playerBoard.slate);
    const point = hit ? this._playerBoard.hover(this._playerBoard.object.worldToLocal(hit.point.clone())) : null;
    if (!point) {
      this._clearHover();
      return;
    }

    this._hovering = true;
    this._projected.copy(point.position);
    this._playerBoard.object.localToWorld(this._projected).project(this._camera);
    this.onChartHover?.({
      match: point.match,
      elo: point.elo,
      x: ((this._projected.x + 1) / 2) * this._width,
      y: ((1 - this._projected.y) / 2) * this._height
    });
    this._drawIfStill();
  };
  /**
   * Unmarks the match when the pointer leaves the canvas.
   */
  private readonly _onPointerLeave = (): void => this._clearHover();
  private readonly _lookAt = new THREE.Vector3();
  /**
   * The light of the water: full in the aquarium, dimmed in the lounge, so that the lamps cast clear shadows there.
   */
  private readonly _hemisphere = new THREE.HemisphereLight(0xaeeaff, 0xd8b77c, 1.6);
  private readonly _rays: THREE.Mesh[] = [];
  private readonly _bubbles: THREE.Points;
  private readonly _bubbleSpeeds = new Float32Array(BUBBLES);
  private readonly _glow: THREE.PointLight;
  private readonly _projected = new THREE.Vector3();
  /**
   * The layer over the canvas for the names.
   */
  private readonly _labels: HTMLElement;
  /**
   * Whether to draw a single still frame (less motion).
   */
  private readonly _still: boolean;
  private _width = 1;
  private _height = 1;
  private _halfWidth = 8;
  private _running = false;
  private _frame = 0;
  private _last = 0;

  /**
   * @param canvas - Where to draw.
   * @param labels - The layer over the canvas for the names.
   * @param still - Whether to draw a single still frame (less motion).
   * @throws When WebGL is not available.
   */
  constructor(canvas: HTMLCanvasElement, labels: HTMLElement, still: boolean) {
    this._labels = labels;
    this._still = still;
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Soft shadows, cast in the lounge by its two chandeliers
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this._scene.background = this._waterGradient();
    const environment = new THREE.PMREMGenerator(this._renderer);
    this._environment = environment.fromScene(new RoomEnvironment(), 0.04).texture;
    environment.dispose();
    this._scene.fog = new THREE.FogExp2(0x0b4f74, 0.04);
    this._applyCamera();

    this._scene.add(this._hemisphere);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(3, 10, 6);
    this._scene.add(sun);

    this._buildFloor();
    const chest = buildChest();
    chest.object.position.set(5.6, FLOOR_Y - 0.08, 0.6);
    chest.object.rotation.y = -0.55;
    this._scene.add(chest.object);
    this._glow = chest.glow;

    const wreck = buildShipwreck();
    wreck.position.set(-6.5, FLOOR_Y + 0.15, -7.5);
    wreck.rotation.set(0.12, 0.55, 0.2);
    wreck.scale.setScalar(1.35);
    this._scene.add(wreck);

    this._buildDecor();
    this._buildRays();
    this._bubbles = this._buildBubbles();
    this._scene.add(this._bubbles);
    this._buildSchools();
    this._buildJellyfish();
    this._buildBackgroundFish();
    this._hall = buildHallOfFame(this._environment);
    this._hall.object.position.copy(HALL);
    this._scene.add(this._hall.object);

    const lounge = buildLounge();
    this._scene.add(lounge);
    const table = buildFoosballTable();
    table.object.position.copy(TABLE_POSITION);
    this._scene.add(table.object);
    // The board of the rules, facing the table
    const board = buildRulesBoard(RULES);
    board.position.copy(RULES_BOARD);
    board.rotation.y = -Math.PI / 2;
    this._scene.add(board);
    // The board of the player, between the rules and the matches
    this._playerBoard = new PlayerBoard(STATS_BOARD_SIZE.width, STATS_BOARD_SIZE.height);
    this._playerBoard.object.position.copy(STATS_BOARD);
    this._playerBoard.object.rotation.y = -Math.PI / 2;
    this._scene.add(this._playerBoard.object);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerleave', this._onPointerLeave);
    // Everything in the lounge receives shadows; only the furniture casts them (not the room itself, nor the chandeliers)
    for (const part of [lounge, table.object]) {
      part.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.receiveShadow = true;
          object.castShadow = !this._castsNoShadow(object);
        }
      });
    }
    for (const [key, anchor] of Object.entries(table.seats) as Array<[SeatKey, THREE.Vector3]>) {
      this._seatAnchors.set(key, anchor.clone().add(TABLE_POSITION));
    }
  }

  /**
   * Moves the camera to a place, along its way and along the wall of the boards; at once for who asked for less motion,
   * or while nothing is drawn.
   *
   * @param view - Where to go.
   */
  public setView(view: View): void {
    if (VIEW_PROGRESS[view] === this._goal.progress && VIEW_SIDE[view] === this._goal.side) {
      return;
    }

    // A new trip, from wherever the camera is now
    this._start = { progress: this._progress, side: this._side };
    this._goal = { progress: VIEW_PROGRESS[view], side: VIEW_SIDE[view] };
    this._travelled = 0;
    if (this._still || !this._running) {
      this._progress = this._goal.progress;
      this._side = this._goal.side;
      this._applyCamera();
      this._drawIfStill();
    }
  }

  /**
   * Shows a player on its board.
   *
   * @param detail - The page of the player, `null` for none.
   * @param scope - All its matches, or only the ones in a role.
   */
  public setPlayer(detail: PlayerDetail | null, scope: RankingMode): void {
    this._playerBoard.show(detail, scope);
    this._drawIfStill();
  }

  /**
   * The icons of the players of the match, to keep by their places at the table.
   *
   * @param elements - The icons, by place.
   */
  public setSeats(elements: Map<SeatKey, HTMLElement>): void {
    this._seatElements = elements;
    this._drawIfStill();
  }

  /**
   * The icons of the first three of the leaderboard, to keep on the steps of the podium: each one says its step in
   * `data-slot` (0 the left one, 1 the middle one, 2 the right one).
   *
   * @param elements - The icons.
   */
  public setPodium(elements: HTMLElement[]): void {
    this._podiumElements = elements;
    this._drawIfStill();
  }

  /**
   * What to draw over a board on a wall: placed and sized as its face is seen.
   *
   * @param wall - The board.
   * @param element - What to draw over it, `null` for nothing.
   */
  public setWall(wall: Wall, element: HTMLElement | null): void {
    if (element) {
      this._wallElements.set(wall, element);
    } else {
      this._wallElements.delete(wall);
    }

    this._drawIfStill();
  }

  /**
   * Puts a creature in the water for each player that entered, and takes out the ones of who left.
   *
   * @param players - The players in the lobby.
   */
  public setPlayers(players: LobbyPlayer[]): void {
    const ids = new Set(players.map(player => player.id));
    for (const [id, inhabitant] of this._inhabitants) {
      if (!ids.has(id) && inhabitant.vanish === null) {
        this._vanish(id, inhabitant);
      }
    }

    for (const player of players) {
      // Back in while its creature was still vanishing: a new one appears
      const current = this._inhabitants.get(player.id);
      if (current && current.vanish !== null) {
        this._remove(player.id, current);
      }

      if (!this._inhabitants.has(player.id)) {
        this._inhabitants.set(player.id, this._release(player, this._populated));
      }
    }

    this._populated = true;
    this._drawIfStill();
  }

  /**
   * Fits the drawing to its box.
   *
   * @param width - Its width, in pixels.
   * @param height - Its height.
   */
  public resize(width: number, height: number): void {
    this._width = Math.max(1, width);
    this._height = Math.max(1, height);
    this._renderer.setSize(this._width, this._height, false);
    this._camera.aspect = this._width / this._height;
    this._camera.updateProjectionMatrix();
    // Half the width seen at z = 0, minus a margin
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(this._camera.fov / 2)) * VIEW_Z;
    this._halfWidth = Math.max(2, halfHeight * this._camera.aspect - 1.2);
    // The leaderboard covers the left of a wide screen (up to 42rem, plus its margin): the podium is seen in the middle
    // of the rest. On a narrow one it covers the bottom half, and the podium is seen at the top
    const tangent = Math.tan(THREE.MathUtils.degToRad(this._camera.fov / 2));
    const wide = this._width > 900;
    // Far enough to see the whole podium also on a narrow screen
    const distance = Math.max(HALL_DISTANCE, 3.8 / (tangent * this._camera.aspect));
    const covered = (Math.min(42 * 16, this._width * 0.48) + 16) / this._width;
    const aside = wide ? tangent * distance * this._camera.aspect * covered : 0;
    const down = wide ? 0 : tangent * distance * 0.5;
    const [hall] = this._path;
    hall!.position.set(HALL.x - aside, CAMERA_PATH[0]!.position.y - down, HALL.z + distance);
    hall!.target.set(HALL.x - aside, CAMERA_PATH[0]!.target.y - down, HALL.z);
    // The whole boards on the wall, with a margin, also on a narrow screen
    const fit = (distance: number, width: number): number => Math.max(distance, (width / 2 + 0.5) / (tangent * this._camera.aspect));
    this._path[this._path.length - 1]!.position.x = STATS_BOARD.x - fit(STATS_BOARD_DISTANCE, STATS_BOARD_SIZE.width);
    this._sides.rules.position.x = RULES_BOARD.x - fit(RULES_BOARD_DISTANCE, 4.4);
    this._sides.matches.position.x = MATCH_BOARD.x - fit(MATCH_BOARD_DISTANCE, MATCH_BOARD_SIZE.width);
    this._applyCamera();
    this._drawIfStill();
  }

  /**
   * Starts or stops drawing: only while the aquarium is on the screen.
   *
   * @param visible - Whether it is.
   */
  public setVisible(visible: boolean): void {
    if (this._still || visible === this._running) {
      return;
    }

    this._running = visible;
    if (visible) {
      this._last = performance.now();
      this._frame = requestAnimationFrame(this._tick);
    } else {
      cancelAnimationFrame(this._frame);
    }
  }

  /**
   * Stops drawing and frees the memory of the graphics card.
   */
  public dispose(): void {
    this._running = false;
    this._renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this._renderer.domElement.removeEventListener('pointerleave', this._onPointerLeave);
    cancelAnimationFrame(this._frame);
    this._dispose(this._scene);
    this._environment.dispose();
    (this._scene.background as THREE.Texture | null)?.dispose();
    this._renderer.dispose();
    this._labels.replaceChildren();
  }

  /**
   * One frame: moves everything and draws.
   *
   * @param now - The time of the frame.
   */
  private readonly _tick = (now: number): void => {
    if (!this._running) {
      return;
    }

    this._frame = requestAnimationFrame(this._tick);
    const delta = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this._update(delta, now / 1000);
    this._draw();
  };

  /**
   * Draws once, for who asked for less motion: nothing moves.
   */
  private _drawIfStill(): void {
    if (this._still) {
      this._inhabitants.forEach(inhabitant => this._place(inhabitant));
      this._background.forEach(inhabitant => this._place(inhabitant));
      this._draw();
    }
  }

  /**
   * Draws the scene and puts the names over their creatures.
   */
  private _draw(): void {
    // The camera left the board of the player: no match marked on it
    if (this._hovering && this._near('stats', 0.05) < 1) {
      this._clearHover();
    }

    this._renderer.render(this._scene, this._camera);
    // The icons of the players appear once the camera reached the table
    const seatsShown = this._near('table', 0.08);
    for (const [key, element] of this._seatElements) {
      const anchor = this._seatAnchors.get(key);
      if (!anchor) {
        continue;
      }

      this._projected.copy(anchor).project(this._camera);
      const x = ((this._projected.x + 1) / 2) * this._width;
      const y = ((1 - this._projected.y) / 2) * this._height;
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      element.style.opacity = String(seatsShown);
      element.style.visibility = seatsShown > 0 ? 'visible' : 'hidden';
    }

    for (const [wall, element] of this._wallElements) {
      this._placeOnWall(WALL_BOARDS[wall], element);
    }

    // The first three appear once the camera reached the hall of fame
    const podiumShown = this._near('ranking', 0.06);
    for (const element of this._podiumElements) {
      const spot = this._hall.spots[Number(element.dataset['slot'])];
      if (!spot) {
        continue;
      }

      this._projected.copy(spot).add(HALL).project(this._camera);
      const x = ((this._projected.x + 1) / 2) * this._width;
      const y = ((1 - this._projected.y) / 2) * this._height;
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      element.style.opacity = String(podiumShown);
      element.style.visibility = podiumShown > 0 ? 'visible' : 'hidden';
    }

    for (const inhabitant of this._inhabitants.values()) {
      if (!inhabitant.label) {
        continue;
      }

      this._projected.copy(inhabitant.position);
      this._projected.y += inhabitant.creature.height / 2 + 0.25;
      this._projected.project(this._camera);
      const x = ((this._projected.x + 1) / 2) * this._width;
      const y = ((1 - this._projected.y) / 2) * this._height;
      inhabitant.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      inhabitant.label.style.visibility = this._projected.z < 1 ? 'visible' : 'hidden';
    }
  }

  /**
   * Puts what is drawn over a board on a wall over its face, as big as it is seen; it appears once the camera is there.
   *
   * @param board - The board.
   * @param element - What is drawn over it.
   */
  private _placeOnWall(board: WallBoard, element: HTMLElement): void {
    const shown = this._near(board.view, 0.04);
    element.style.opacity = String(shown);
    element.style.visibility = shown > 0 ? 'visible' : 'hidden';
    if (!shown) {
      return;
    }

    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const corner of board.corners) {
      this._projected.copy(corner).project(this._camera);
      const x = ((this._projected.x + 1) / 2) * this._width;
      const y = ((1 - this._projected.y) / 2) * this._height;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }

    // Laid out as big as the face is seen, or at its own width and scaled down to the face
    const scale = board.layoutWidth ? (right - left) / board.layoutWidth : 1;
    element.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${scale.toFixed(4)})`;
    element.style.width = `${((right - left) / scale).toFixed(1)}px`;
    element.style.height = `${((bottom - top) / scale).toFixed(1)}px`;
  }

  /**
   * Moves the creatures, the seaweed, the light and the bubbles.
   *
   * @param delta - Seconds since the last frame.
   * @param time - Seconds since the start.
   */
  private _update(delta: number, time: number): void {
    if (this._progress !== this._goal.progress || this._side !== this._goal.side) {
      // Every trip in TRAVEL_SECONDS, however many steps it crosses: slow at its start and at its end, not at each step
      this._travelled += delta;
      const along = Math.min(1, this._travelled / TRAVEL_SECONDS);
      const eased = along < 1 ? (along < 0.5 ? 4 * along ** 3 : 1 - (-2 * along + 2) ** 3 / 2) : 1;
      this._progress = THREE.MathUtils.lerp(this._start.progress, this._goal.progress, eased);
      this._side = THREE.MathUtils.lerp(this._start.side, this._goal.side, eased);
      this._applyCamera();
    }

    this._playerBoard.animate(time);

    for (const [id, inhabitant] of this._inhabitants) {
      const object = inhabitant.creature.object;
      if (inhabitant.appear < 1) {
        inhabitant.appear = Math.min(1, inhabitant.appear + delta / APPEAR_SECONDS);
        object.scale.copy(inhabitant.baseScale).multiplyScalar(Math.max(0.001, easeOutBack(inhabitant.appear)));
      }

      if (inhabitant.vanish !== null) {
        inhabitant.vanish += delta;
        const left = 1 - Math.min(1, inhabitant.vanish / VANISH_SECONDS);
        object.scale.copy(inhabitant.baseScale).multiplyScalar(Math.max(0.001, left * left));
        // It spins as it goes
        inhabitant.yaw += delta * 9;
        if (left <= 0) {
          this._remove(id, inhabitant);
        }
      }
    }

    this._moveBursts(delta);

    for (const inhabitant of [...this._inhabitants.values(), ...this._background]) {
      this._steer(inhabitant, delta);
      this._place(inhabitant);
      inhabitant.creature.animate(time, Math.min(1, inhabitant.velocity.length() / inhabitant.speed));
    }

    this._swaying.forEach(swaying => swaying.animate(time));
    for (const jellyfish of this._jellyfish) {
      jellyfish.swaying.animate(time);
      const object = jellyfish.swaying.object;
      object.position.y += jellyfish.speed * delta * (0.6 + Math.max(0, Math.sin(time * 2)) * 0.8);
      // Out of sight above: far away the water seen is taller, so the limit depends on its depth
      if (object.position.y > this._visibleTop(object.position.z) + 1.5) {
        object.position.set(this._sideX(object.position.z), FLOOR_Y - 1, object.position.z);
      }
    }

    this._moveSchools(delta, time);
    this._hall.animate(time, delta);

    for (const { segments, phase } of this._seaweeds) {
      segments.forEach((segment, i) => {
        segment.rotation.z = Math.sin(time * 0.9 + phase + i * 0.35) * 0.09;
        segment.rotation.x = Math.cos(time * 0.7 + phase + i * 0.3) * 0.05;
      });
    }

    this._rays.forEach((ray, i) => {
      (ray.material as THREE.MeshBasicMaterial).opacity = 0.07 + Math.sin(time * 0.4 + i * 1.7) * 0.04;
    });
    this._glow.intensity = 2.3 + Math.sin(time * 2.1) * 0.5 + Math.sin(time * 5.3) * 0.2;

    const positions = this._bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < BUBBLES; i++) {
      let y = positions.getY(i) + this._bubbleSpeeds[i]! * delta;
      let x = positions.getX(i) + Math.sin(time * 2 + i) * 0.004;
      if (y > TOP_Y + 1.8) {
        // Back to the bottom, from the chest or from anywhere
        const fromChest = i % 3 === 0;
        x = fromChest ? 5.6 + (Math.random() - 0.5) * 0.6 : (Math.random() - 0.5) * this._halfWidth * 2;
        y = FLOOR_Y + 0.2;
        positions.setZ(i, fromChest ? 0.6 : FAR_Z + Math.random() * (NEAR_Z - FAR_Z));
      }

      positions.setXY(i, x, y);
    }

    positions.needsUpdate = true;
  }

  /**
   * Steers a creature towards its target, slowing down as it gets there; there it waits now and then, and picks
   * another one.
   *
   * @param inhabitant - The creature.
   * @param delta - Seconds since the last frame.
   */
  private _steer(inhabitant: Inhabitant, delta: number): void {
    const toTarget = new THREE.Vector3().subVectors(inhabitant.target, inhabitant.position);
    const distance = toTarget.length();
    const desired = new THREE.Vector3();
    if (inhabitant.pause > 0) {
      inhabitant.pause -= delta;
    } else if (distance < 0.35) {
      inhabitant.target.copy(this._randomPoint(inhabitant.creature, inhabitant.position, inhabitant.far, inhabitant.near));
      if (Math.random() < 0.25) {
        inhabitant.pause = 0.6 + Math.random() * 2;
      }
    } else {
      desired.copy(toTarget).multiplyScalar((inhabitant.speed * Math.min(1, distance / 1.2)) / distance);
    }

    inhabitant.velocity.lerp(desired, 1 - Math.exp(-delta * 1.4));
    inhabitant.position.addScaledVector(inhabitant.velocity, delta);

    const horizontal = Math.hypot(inhabitant.velocity.x, inhabitant.velocity.z);
    if (horizontal > 0.03) {
      const yaw = Math.atan2(-inhabitant.velocity.z, inhabitant.velocity.x);
      // The shortest way round
      const turn = Math.atan2(Math.sin(yaw - inhabitant.yaw), Math.cos(yaw - inhabitant.yaw));
      inhabitant.yaw += turn * (1 - Math.exp(-delta * 3));
    }

    const pitch = inhabitant.creature.motion === 'swim' ? THREE.MathUtils.clamp(Math.atan2(inhabitant.velocity.y, Math.max(horizontal, 0.05)), -0.45, 0.45) : 0;
    inhabitant.pitch += (pitch - inhabitant.pitch) * (1 - Math.exp(-delta * 3));
  }

  /**
   * Whether a part of the lounge casts no shadow: a part of the room itself, or of a chandelier.
   *
   * @param object - The part.
   * @returns Whether it does.
   */
  private _castsNoShadow(object: THREE.Object3D): boolean {
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
      if (parent.userData['noShadow']) {
        return true;
      }
    }

    return false;
  }

  /**
   * Puts the camera where it is along its way, easing in and out of each step. The fog thins in the lounge, and the names
   * of the creatures fade out of the aquarium.
   */
  private _applyCamera(): void {
    const steps = this._path.length - 1;
    const along = this._progress * steps;
    const index = Math.min(steps - 1, Math.floor(along));
    // The trip is eased as a whole: within a step the camera goes on evenly
    const ease = along - index;
    const from = this._path[index]!;
    const to = this._path[index + 1]!;
    if (from.via) {
      // Bending: a quadratic curve from one step to the next, pulled towards `via`
      this._camera.position
        .copy(from.position)
        .multiplyScalar((1 - ease) ** 2)
        .addScaledVector(from.via, 2 * (1 - ease) * ease)
        .addScaledVector(to.position, ease ** 2);
    } else {
      this._camera.position.lerpVectors(from.position, to.position, ease);
    }

    this._lookAt.lerpVectors(from.target, to.target, ease);
    // Aside along the wall, towards the rules or the matches: fully at the player, not at all before the table
    const stats = this._path[steps]!;
    const side = this._side < 0 ? this._sides.rules : this._sides.matches;
    const weight = Math.abs(this._side) * THREE.MathUtils.clamp((this._progress - VIEW_PROGRESS.table) / (1 - VIEW_PROGRESS.table), 0, 1);
    if (weight) {
      this._camera.position.add(this._aside.subVectors(side.position, stats.position).multiplyScalar(weight));
      this._lookAt.add(this._aside.subVectors(side.target, stats.target).multiplyScalar(weight));
    }

    this._camera.lookAt(this._lookAt);
    // From the aquarium into the lounge: 0 in the water, 1 from the table on
    const inside = THREE.MathUtils.clamp((this._progress - VIEW_PROGRESS.aquarium) / (VIEW_PROGRESS.table - VIEW_PROGRESS.aquarium), 0, 1);
    // From the aquarium to the hall of fame: 0 at the aquarium, 1 at the hall
    const away = THREE.MathUtils.clamp((VIEW_PROGRESS.aquarium - this._progress) / VIEW_PROGRESS.aquarium, 0, 1);
    this._hemisphere.intensity = THREE.MathUtils.lerp(1.6, 0.45, inside);
    (this._scene.fog as THREE.FogExp2).density = THREE.MathUtils.lerp(0.04, 0.008, inside);
    this._labels.style.opacity = String(THREE.MathUtils.clamp(1 - Math.max(inside, away) * 6, 0, 1));
  }

  /**
   * Unmarks the match of the chart, if one is marked.
   */
  private _clearHover(): void {
    if (this._hovering) {
      this._hovering = false;
      this._playerBoard.hover(null);
      this.onChartHover?.(null);
      this._drawIfStill();
    }
  }

  /**
   * How much the camera is at a place: 1 there, down to 0 as far as a tolerance along its way and along the wall.
   *
   * @param view - The place.
   * @param tolerance - How far it still shows a bit.
   * @returns From 0 to 1.
   */
  private _near(view: View, tolerance: number): number {
    const distance = Math.abs(this._progress - VIEW_PROGRESS[view]) + Math.abs(this._side - VIEW_SIDE[view]) / 4;
    return THREE.MathUtils.clamp(1 - distance / tolerance, 0, 1);
  }

  /**
   * Moves the model of a creature where it is.
   *
   * @param inhabitant - The creature.
   */
  private _place(inhabitant: Inhabitant): void {
    const object = inhabitant.creature.object;
    object.position.copy(inhabitant.position);
    object.rotation.set(0, inhabitant.yaw, inhabitant.pitch, 'YZX');
  }

  /**
   * Puts the creature of a player in the water, at a random point, with its name.
   *
   * @param player - The player.
   * @param animated - Whether it grows in with a puff (a player entering the lobby), or is there at once.
   * @returns The creature in the water.
   */
  private _release(player: LobbyPlayer, animated: boolean): Inhabitant {
    const species = this._pickSpecies();
    const creature = buildCreature(species);
    this._scene.add(creature.object);
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = player.name;
    this._labels.append(label);
    const position = this._randomPoint(creature);
    const inhabitant: Inhabitant = {
      creature,
      species,
      position,
      velocity: new THREE.Vector3(),
      target: this._randomPoint(creature, position),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      pause: Math.random(),
      speed: creature.speed * (0.8 + Math.random() * 0.4),
      far: FAR_Z,
      near: NEAR_Z,
      label,
      appear: animated && !this._still ? 0 : 1,
      vanish: null,
      baseScale: creature.object.scale.clone()
    };
    this._place(inhabitant);
    creature.animate(0, 0);
    if (inhabitant.appear < 1) {
      creature.object.scale.setScalar(0.001);
      this._burst(position, creature.height);
    }

    return inhabitant;
  }

  /**
   * Starts the vanishing of the creature of a player who left the lobby: its name goes at once, the creature shrinks
   * away in a puff (or goes at once, for who asked for less motion).
   *
   * @param id - The player.
   * @param inhabitant - Its creature.
   */
  private _vanish(id: number, inhabitant: Inhabitant): void {
    inhabitant.label?.remove();
    inhabitant.label = null;
    if (this._still) {
      this._remove(id, inhabitant);
      return;
    }

    inhabitant.vanish = 0;
    this._burst(inhabitant.position, inhabitant.creature.height);
  }

  /**
   * Takes a creature out of the water.
   *
   * @param id - Its player.
   * @param inhabitant - The creature.
   */
  private _remove(id: number, inhabitant: Inhabitant): void {
    this._scene.remove(inhabitant.creature.object);
    this._dispose(inhabitant.creature.object);
    inhabitant.label?.remove();
    this._inhabitants.delete(id);
  }

  /**
   * A puff where a creature appears or vanishes: bubbles bursting out and a ring of light.
   *
   * @param at - Where.
   * @param size - How big the creature is.
   */
  private _burst(at: THREE.Vector3, size: number): void {
    const positions = new Float32Array(BURST_BUBBLES * 3);
    const velocities = new Float32Array(BURST_BUBBLES * 3);
    const direction = new THREE.Vector3();
    for (let i = 0; i < BURST_BUBBLES; i++) {
      direction.randomDirection().multiplyScalar(1.2 + Math.random() * 2.2);
      positions.set([at.x, at.y, at.z], i * 3);
      velocities.set([direction.x, direction.y, direction.z], i * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const bubbles = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.26, map: this._bubbleMap, transparent: true, depthWrite: false }));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.5, 40),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    ring.position.copy(at);
    this._scene.add(bubbles, ring);
    this._bursts.push({ bubbles, velocities, ring, size: Math.max(0.6, size), age: 0 });
  }

  /**
   * Moves the puffs: the bubbles fly out and rise, the rings widen facing the camera, all fade away.
   *
   * @param delta - Seconds since the last frame.
   */
  private _moveBursts(delta: number): void {
    for (let i = this._bursts.length - 1; i >= 0; i--) {
      const burst = this._bursts[i]!;
      burst.age += delta;
      const t = burst.age / BURST_SECONDS;
      if (t >= 1) {
        this._scene.remove(burst.bubbles, burst.ring);
        burst.bubbles.geometry.dispose();
        (burst.bubbles.material as THREE.Material).dispose();
        burst.ring.geometry.dispose();
        (burst.ring.material as THREE.Material).dispose();
        this._bursts.splice(i, 1);
        continue;
      }

      const positions = burst.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const velocities = burst.velocities;
      for (let j = 0; j < BURST_BUBBLES; j++) {
        // Slowed by the water, pushed up
        velocities[j * 3] = velocities[j * 3]! * (1 - delta * 2.5);
        velocities[j * 3 + 1] = velocities[j * 3 + 1]! * (1 - delta * 2.5) + delta * 1.5;
        velocities[j * 3 + 2] = velocities[j * 3 + 2]! * (1 - delta * 2.5);
        positions.setXYZ(
          j,
          positions.getX(j) + velocities[j * 3]! * delta,
          positions.getY(j) + velocities[j * 3 + 1]! * delta,
          positions.getZ(j) + velocities[j * 3 + 2]! * delta
        );
      }

      positions.needsUpdate = true;
      (burst.bubbles.material as THREE.PointsMaterial).opacity = 1 - t;
      burst.ring.quaternion.copy(this._camera.quaternion);
      burst.ring.scale.setScalar(burst.size * (0.6 + t * 3.4));
      (burst.ring.material as THREE.MeshBasicMaterial).opacity = (1 - t) ** 0.7;
    }
  }

  /**
   * A species for a new creature, at random among the ones least present in the water: all different until every
   * species is there, then repeated as little as possible. It says nothing about the player and changes at each load.
   *
   * @returns The species.
   */
  private _pickSpecies(): Species {
    const counts = new Map<Species, number>(SPECIES.map(species => [species, 0]));
    for (const inhabitant of this._inhabitants.values()) {
      counts.set(inhabitant.species, counts.get(inhabitant.species)! + 1);
    }

    const fewest = Math.min(...counts.values());
    const candidates = SPECIES.filter(species => counts.get(species) === fewest);
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  /**
   * A random point for a creature: on the bottom for the sole, low for the octopus, anywhere in the water for the
   * others, but not too far up or down from where it is (fish swim mostly sideways).
   *
   * @param creature - The creature.
   * @param from - Where it is, none for a creature just put in the water.
   * @param far - The farthest depth where it swims.
   * @param near - The nearest one.
   * @returns The point.
   */
  private _randomPoint(creature: Creature, from?: THREE.Vector3, far = FAR_Z, near = NEAR_Z): THREE.Vector3 {
    const z = far + Math.random() * (near - far);
    // Nearer the camera the water seen is narrower
    const halfWidth = this._halfWidth * ((VIEW_Z - z) / VIEW_Z);
    const x = (Math.random() * 2 - 1) * halfWidth;
    switch (creature.motion) {
      case 'bottom':
        return new THREE.Vector3(x, FLOOR_Y + 0.22, z);
      case 'drift':
        return new THREE.Vector3(x, FLOOR_Y + 0.3 + Math.random() * 1.8, z);
      case 'swim': {
        const low = FLOOR_Y + 0.6 + creature.height / 2;
        const y = from ? THREE.MathUtils.clamp(from.y + (Math.random() - 0.5) * 3, low, TOP_Y) : low + Math.random() * (TOP_Y - low);
        return new THREE.Vector3(x, y, z);
      }
    }
  }

  /**
   * The sand with its dunes, rocks and seaweed.
   */
  private _buildFloor(): void {
    const geometry = new THREE.PlaneGeometry(100, 46, 100, 46);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(i, Math.sin(x * 0.55) * 0.12 + Math.cos(z * 0.7 + x * 0.2) * 0.1 + Math.random() * 0.04);
    }

    geometry.computeVertexNormals();
    const sand = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd9bf8c, roughness: 1, flatShading: true }));
    sand.position.set(-15, FLOOR_Y, -6);
    this._scene.add(sand);

    const rocks: Array<[number, number, number, number]> = [
      [4.2, 0.2, 0.45, 0x6b7280],
      [6.9, 1.4, 0.35, 0x57534e],
      [-7.5, 0.8, 0.7, 0x64748b],
      [-4.2, -1.5, 0.4, 0x78716c],
      [1.5, -3.5, 0.6, 0x57534e],
      [-1.4, -2.2, 0.25, 0x6b7280]
    ];
    for (const [x, z, size, color] of rocks) {
      const rock = buildRock(size, color);
      rock.position.set(x, FLOOR_Y + size * 0.2, z);
      this._scene.add(rock);
    }

    const weeds: Array<[number, number, number, number]> = [
      [-8.6, 0.6, 2.6, 0x16a34a],
      [-8.1, -0.4, 3.2, 0x15803d],
      [-7.6, 1.2, 1.9, 0x22c55e],
      [-3.1, -3, 2.4, 0x15803d],
      [8.3, -1.2, 2.8, 0x16a34a],
      [8.9, 0.4, 2.1, 0x22c55e],
      [3.2, -3.6, 3, 0x166534],
      [-0.2, -4, 2.2, 0x15803d]
    ];
    for (const [x, z, height, color] of weeds) {
      const weed = buildSeaweed(height, color);
      weed.object.position.set(x, FLOOR_Y, z);
      this._scene.add(weed.object);
      this._seaweeds.push({ segments: weed.segments, phase: Math.random() * 10 });
    }
  }

  /**
   * The furniture: corals and sea fans among the rocks, an anchor, barrels and amphoras by the wreck, and far away a
   * rock arch, big rocks and a forest of kelp in the fog.
   */
  private _buildDecor(): void {
    const put = (object: THREE.Object3D, x: number, y: number, z: number, scale = 1, turn = Math.random() * Math.PI * 2): void => {
      object.position.set(x, FLOOR_Y + y, z);
      object.rotation.y = turn;
      object.scale.multiplyScalar(scale);
      this._scene.add(object);
    };
    const sway = (swaying: Swaying, x: number, z: number, scale = 1): void => {
      put(swaying.object, x, 0, z, scale);
      this._swaying.push(swaying);
    };

    // Far away, in the fog
    put(buildRockArch(), 9, -0.3, -14, 1.8, -0.3);
    for (const [x, z, size] of [[-13, -15, 2.6], [3, -17, 3.2], [14, -10, 2], [-6, -18, 3]] as const) {
      const rock = buildRock(size, 0x3f4f62);
      rock.position.set(x, FLOOR_Y + size * 0.2, z);
      this._scene.add(rock);
    }

    for (let x = -14; x <= 14; x += 2.6 + Math.random() * 1.6) {
      const kelp = buildSeaweed(5 + Math.random() * 3, Math.random() < 0.5 ? 0x166534 : 0x3f6212, 0.5);
      kelp.object.position.set(x, FLOOR_Y, -10 - Math.random() * 3);
      this._scene.add(kelp.object);
      this._seaweeds.push({ segments: kelp.segments, phase: Math.random() * 10 });
    }

    // Two compact reefs: one by the chest, one at the foot of the wreck. Each a mound of rocks and brain corals, branching
    // corals growing on it, a sea fan behind
    const reef = (x: number, z: number, corals: readonly number[], brain: number, fan: number): void => {
      for (const [dx, dz, size] of [[0, 0, 0.75], [-0.9, 0.3, 0.5], [0.8, -0.2, 0.55], [0.2, -0.8, 0.6]] as const) {
        const rock = buildRock(size, 0x57534e);
        rock.position.set(x + dx, FLOOR_Y + size * 0.25, z + dz);
        this._scene.add(rock);
      }

      put(buildBrainCoral(brain), x - 0.5, 0.15, z + 0.55, 0.75);
      put(buildBrainCoral(brain), x + 1.05, 0.05, z + 0.35, 0.5);
      corals.forEach((color, i) => {
        const angle = (i / corals.length) * Math.PI * 2;
        put(buildBranchCoral(color), x + Math.cos(angle) * 0.55, 0.3, z + Math.sin(angle) * 0.4, 0.9 + (i % 2) * 0.35);
      });
      sway(buildSeaFan(fan), x + 0.3, z - 1.1, 1.3);
    };
    reef(7.4, -1.4, [0xf472b6, 0xfb923c, 0xef4444, 0xf9a8d4], 0x84cc16, 0xa855f7);
    reef(-4.4, -4.6, [0xc084fc, 0xfb7185, 0xfbbf24, 0x2dd4bf], 0xf9a8d4, 0xe11d48);

    // What the wreck lost
    const anchor = buildAnchor();
    put(anchor, -3.2, -0.2, -5.2, 1.2, 0.8);
    anchor.rotation.z = 1.15;
    put(buildBarrel(), -9.3, 0.3, -5.5, 1, 0.7);
    put(buildBarrel(), -4.6, 0.28, -7, 1, -0.4);
    const amphora = buildAmphora();
    put(amphora, -8, 0.2, -3.8, 1.2, 0.4);
    amphora.rotation.z = 1.35;
    put(buildAmphora(), -7.3, -0.05, -4.6, 1.1);
  }

  /**
   * The schools of little fish in the background: silver, yellow and blue, each drawn at once.
   */
  private _buildSchools(): void {
    const geometry = schoolFishGeometry();
    const color = new THREE.Color();
    for (const [count, tint, z, y, speed] of [[40, 0xcbd5e1, -9, 0.6, 1.1], [26, 0xfde047, -6.5, -1.2, 1.4], [32, 0x60a5fa, -12, 1.8, 0.9]] as const) {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5, flatShading: true }), count);
      const offsets: THREE.Vector3[] = [];
      const phases: number[] = [];
      for (let i = 0; i < count; i++) {
        // A loose ball, flattened: a school is wider than tall
        offsets.push(new THREE.Vector3((Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.6));
        phases.push(Math.random() * 10);
        mesh.setColorAt(i, color.set(tint).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12));
      }

      const direction = Math.random() < 0.5 ? 1 : -1;
      this._scene.add(mesh);
      this._schools.push({
        mesh,
        offsets,
        phases,
        center: new THREE.Vector3((Math.random() * 2 - 1) * 6, y, z),
        baseY: y,
        heading: direction > 0 ? 0 : Math.PI,
        direction,
        speed
      });
    }
  }

  /**
   * Moves the schools: across the water, turning back past the edge, up and down slowly; each fish wiggles.
   *
   * @param delta - Seconds since the last frame.
   * @param time - Seconds since the start.
   */
  private _moveSchools(delta: number, time: number): void {
    this._schools.forEach((school, s) => {
      const heading = school.direction > 0 ? 0 : Math.PI;
      school.heading += (heading - school.heading) * (1 - Math.exp(-delta * 0.9));
      school.center.x += Math.cos(school.heading) * school.speed * delta;
      school.center.y = school.baseY + Math.sin(time * 0.25 + s * 2) * 0.7;
      // Past the edge of what is seen at its depth, it turns back
      const edge = this._halfWidth * ((VIEW_Z - school.center.z) / VIEW_Z) + 2;
      if (school.center.x > edge) {
        school.direction = -1;
      } else if (school.center.x < -edge) {
        school.direction = 1;
      }

      school.offsets.forEach((offset, i) => {
        const phase = school.phases[i]!;
        this._dummy.position.copy(offset).applyAxisAngle(UP, school.heading).add(school.center);
        this._dummy.position.y += Math.sin(time * 1.3 + phase) * 0.1;
        this._dummy.rotation.set(0, school.heading + Math.sin(time * 9 + phase) * 0.12, 0);
        this._dummy.updateMatrix();
        school.mesh.setMatrixAt(i, this._dummy.matrix);
      });
      school.mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /**
   * Jellyfish drifting up in the background.
   */
  private _buildJellyfish(): void {
    // Near ones, then far ones, bigger to be seen in the fog
    const jellies = [
      [0xf0abfc, -4, -8, 1], [0x93c5fd, 5, -10, 1], [0xc4b5fd, 1, -7.5, 1],
      [0xf0abfc, -13, -17, 1.6], [0x93c5fd, -10, -19, 1.8], [0xc4b5fd, -15, -20, 1.7], [0xf9a8d4, -7, -18, 1.5],
      [0x93c5fd, 11, -18, 1.7], [0xf0abfc, 15, -20, 1.6]
    ] as const;
    for (const [color, x, z, size] of jellies) {
      const jellyfish = buildJellyfish(color);
      jellyfish.object.scale.setScalar(size);
      jellyfish.object.position.set(this._sideX(z, Math.sign(x)), FLOOR_Y + Math.random() * (this._visibleTop(z) - FLOOR_Y), z);
      jellyfish.animate(0);
      this._scene.add(jellyfish.object);
      this._jellyfish.push({ swaying: jellyfish, speed: 0.12 + Math.random() * 0.1 });
    }
  }

  /**
   * The top of the water seen at a depth.
   *
   * @param z - The depth.
   * @returns The height of the upper edge of the view there.
   */
  private _visibleTop(z: number): number {
    return VIEW_Y + Math.tan(THREE.MathUtils.degToRad(this._camera.fov / 2)) * (VIEW_Z - z);
  }

  /**
   * A point near the left or right edge of the water seen at a depth, where the jellyfish drift.
   *
   * @param z - The depth.
   * @param side - 1 for the right edge, -1 for the left one; at random when not given.
   * @returns The x of the point.
   */
  private _sideX(z: number, side = Math.random() < 0.5 ? -1 : 1): number {
    const halfWidth = this._halfWidth * ((VIEW_Z - z) / VIEW_Z);
    return side * halfWidth * (0.92 + Math.random() * 0.15);
  }

  /**
   * A few little fish without a name, wandering behind the ones of the players.
   */
  private _buildBackgroundFish(): void {
    for (let i = 0; i < 5; i++) {
      const creature = buildCreature(BACKGROUND_SPECIES[Math.floor(Math.random() * BACKGROUND_SPECIES.length)]!);
      creature.object.scale.setScalar(0.45);
      this._scene.add(creature.object);
      const position = this._randomPoint(creature, undefined, -9, -5);
      const fish: Inhabitant = {
        creature,
        species: 'clown',
        position,
        velocity: new THREE.Vector3(),
        target: this._randomPoint(creature, position, -9, -5),
        yaw: Math.random() * Math.PI * 2,
        pitch: 0,
        pause: Math.random(),
        speed: creature.speed * 0.6,
        far: -9,
        near: -5,
        label: null,
        appear: 1,
        vanish: null,
        baseScale: creature.object.scale.clone()
      };
      this._place(fish);
      creature.animate(0, 0);
      this._background.push(fish);
    }
  }

  /**
   * Rays of light coming down from the surface.
   */
  private _buildRays(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 128);
    const map = new THREE.CanvasTexture(canvas);
    for (const [x, z, angle, width] of [[-5, -2, 0.25, 1.6], [-1, -4, 0.2, 2.2], [3, -1, 0.3, 1.3], [6.5, -3, 0.22, 1.8]] as const) {
      const ray = new THREE.Mesh(
        new THREE.PlaneGeometry(width, 14),
        new THREE.MeshBasicMaterial({ map, color: 0xe0f7ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
      );
      ray.position.set(x, 1.8, z);
      ray.rotation.z = angle;
      this._scene.add(ray);
      this._rays.push(ray);
    }
  }

  /**
   * The bubbles, rising at different speeds.
   *
   * @returns The points of the bubbles.
   */
  private _buildBubbles(): THREE.Points {
    const positions = new Float32Array(BUBBLES * 3);
    for (let i = 0; i < BUBBLES; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = FLOOR_Y + Math.random() * (TOP_Y - FLOOR_Y + 1.8);
      positions[i * 3 + 2] = FAR_Z + Math.random() * (NEAR_Z - FAR_Z);
      this._bubbleSpeeds[i] = 0.5 + Math.random() * 0.9;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 0.13, map: this._bubbleMap, transparent: true, depthWrite: false, sizeAttenuation: true })
    );
  }

  /**
   * The colour of the water, light at the top and deep at the bottom.
   *
   * @returns The background.
   */
  private _waterGradient(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#38bdf8');
    gradient.addColorStop(0.45, '#0c6ea3');
    gradient.addColorStop(1, '#0b3550');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    const background = new THREE.CanvasTexture(canvas);
    background.colorSpace = THREE.SRGBColorSpace;
    return background;
  }

  /**
   * Frees the geometries, materials and textures of a part of the scene.
   *
   * @param root - The part.
   */
  private _dispose(root: THREE.Object3D): void {
    root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        for (const used of Array.isArray(object.material) ? object.material : [object.material]) {
          (used as THREE.MeshStandardMaterial).map?.dispose();
          used.dispose();
        }
      }
    });
  }
}

import * as THREE from 'three';
import { DISPLAY } from './fonts';
import { batchStatic } from './batching';
import { detail, isHigh, paintedColorSpace } from './detail';
import { phong } from './materials';
import type { Look } from './materials';

/*
  The room the ocean is seen from: a rich lounge under the sea, with a big window on the ocean and an arched one behind
  the foosball table. Walnut panelling with gilded mouldings, a checkered marble floor, a red rug under the table, a
  coffered ceiling with crystal chandeliers, velvet curtains, chesterfield armchairs, palms in brass pots, and on the
  wall in front of the table the boards of the rules, of a player and of the matches. Only what the camera can see:
  nothing along the back and the left walls.
*/

/**
 * Depth of the wall with the windows: the ocean is in front of it (towards -z), the lounge behind.
 */
export const WALL_Z = 14;

/**
 * Height of the floor of the lounge.
 */
export const LOUNGE_FLOOR = -3;

/**
 * Where the foosball table stands.
 */
export const TABLE_POSITION = new THREE.Vector3(11, LOUNGE_FLOOR, WALL_Z + 9);

/**
 * The extent of the lounge.
 */
const LEFT = -14;
const RIGHT = 22;
const BACK = WALL_Z + 21;
const CEILING = 5.6;

/*
  The three boards on the wall in front of the foosball table, as seen from behind its goal, side by side: the player
  in the middle, straight in front of the table; the rules on its left, the matches on its right.
*/

/**
 * The board of a player: the centre of its face, and the size of the face.
 */
export const STATS_BOARD = new THREE.Vector3(RIGHT - 0.2, 1.3, WALL_Z + 10);
export const STATS_BOARD_SIZE = { width: 6.4, height: 4 };

/**
 * Where the board of the rules hangs, on the left of the player.
 */
export const RULES_BOARD = new THREE.Vector3(RIGHT - 0.1, 1.3, WALL_Z + 3.9);

/**
 * The split-flap board of the matches, on the right of the player: the centre of its black face and the size of the
 * face. The flaps themselves are drawn over the canvas, on the face as the camera sees it.
 */
export const MATCH_BOARD = new THREE.Vector3(RIGHT - 0.2, 1.5, WALL_Z + 17.4);
export const MATCH_BOARD_SIZE = { width: 6.6, height: 3.2 };

/**
 * The big window: its centre and half sizes, and the radius of its corners.
 */
const WINDOW = { x: 0, y: 0.7, halfWidth: 8, halfHeight: 3.3, radius: 0.6 };

/**
 * The arched window behind the table: centre, half width, bottom, and the top of its straight sides.
 */
const ARCH = { x: TABLE_POSITION.x, halfWidth: 1.4, bottom: -1.2, top: 2.4 };

/**
 * A low poly material.
 *
 * @param color - The colour.
 * @param options - Other settings.
 * @returns The material.
 */
function material(color: number, options: Look = {}): THREE.MeshPhongMaterial {
  return phong({ color, roughness: 0.6, metalness: 0.05, flatShading: true, ...options });
}

/**
 * The gilding of frames and mouldings.
 */
function gold(): THREE.MeshPhongMaterial {
  return material(0xd4af37, { metalness: 0.9, roughness: 0.28 });
}

/**
 * Paints a texture.
 *
 * @param width - Width of the canvas.
 * @param height - Its height.
 * @param paint - What to paint.
 * @param repeat - How many times it repeats across and down.
 * @returns The texture.
 */
function texture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d')!);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = paintedColorSpace();
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(repeat[0], repeat[1]);
  return result;
}

/**
 * A board on a wall, as in an old station: a mahogany case with brass edges, a black face, and a gilded plate with its
 * name on top. What it shows is drawn over the canvas, on the face.
 *
 * @param size - The size of its face.
 * @param title - The name on its plate.
 * @returns The board, the centre of its face at its origin, facing +z.
 */
export function wallBoard({ width, height }: { width: number; height: number }, title: string): THREE.Group {
  const board = new THREE.Group();
  const brass = material(0xc9a227, { metalness: 0.85, roughness: 0.3, flatShading: false });
  const caseBox = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, height + 0.5, 0.3), material(0x3a1d10, { roughness: 0.45 }));
  caseBox.position.z = -0.15;
  board.add(caseBox);
  for (const [w, h, x, y] of [
    [width + 0.56, 0.08, 0, (height + 0.5) / 2],
    [width + 0.56, 0.08, 0, -(height + 0.5) / 2],
    [0.08, height + 0.56, (width + 0.5) / 2, 0],
    [0.08, height + 0.56, -(width + 0.5) / 2, 0]
  ] as const) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.34), brass);
    edge.position.set(x, y, -0.13);
    board.add(edge);
  }

  // Dark green slate: the board of the matches is written on it in chalk (the one of the player covers it)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material(0x1d2b24, { roughness: 0.9, flatShading: false }));
  face.position.z = 0.01;
  board.add(face);

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.5),
    phong({
      map: texture(520, 100, ctx => {
        const shine = ctx.createLinearGradient(0, 0, 0, 100);
        shine.addColorStop(0, '#f6dc7a');
        shine.addColorStop(0.5, '#c9a227');
        shine.addColorStop(1, '#8a6a12');
        ctx.fillStyle = shine;
        ctx.fillRect(0, 0, 520, 100);
        ctx.strokeStyle = '#5c4308';
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, 508, 88);
        ctx.fillStyle = '#2b1d03';
        ctx.font = `700 58px ${DISPLAY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, 260, 54);
      }),
      metalness: 0.6,
      roughness: 0.35
    })
  );
  plate.position.set(0, height / 2 + 0.6, 0.02);
  board.add(plate);

  // Two lamps over it
  for (const x of [-width / 3, width / 3]) {
    const lamp = new THREE.PointLight(0xffd8a0, detail(3.5, 5), 6, 1.8);
    lamp.position.set(x, height / 2 + 1, 0.8);
    board.add(lamp);
  }

  batchStatic(board);
  return board;
}

/**
 * Size of a walnut panel, the same on every wall.
 */
const PANEL = 3;

/**
 * A plain wall standing on the floor, its panels as big as on the wall with the windows and starting from the same
 * height, so that they meet at the corners.
 *
 * @param length - Its length.
 * @param height - Its height.
 * @returns The geometry.
 */
function panelledWall(length: number, height: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(length, height);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * length) / PANEL, (LOUNGE_FLOOR + uv.getY(i) * height) / PANEL);
  }

  return geometry;
}

/**
 * A rectangle with rounded corners, as a path.
 *
 * @param path - Where to draw it.
 * @param x - Its centre.
 * @param y - Its centre.
 * @param halfWidth - Half its width.
 * @param halfHeight - Half its height.
 * @param radius - Radius of the corners.
 * @returns The path.
 */
function roundedRect<T extends THREE.Path>(path: T, x: number, y: number, halfWidth: number, halfHeight: number, radius: number): T {
  path.moveTo(x - halfWidth + radius, y - halfHeight);
  path.lineTo(x + halfWidth - radius, y - halfHeight);
  path.quadraticCurveTo(x + halfWidth, y - halfHeight, x + halfWidth, y - halfHeight + radius);
  path.lineTo(x + halfWidth, y + halfHeight - radius);
  path.quadraticCurveTo(x + halfWidth, y + halfHeight, x + halfWidth - radius, y + halfHeight);
  path.lineTo(x - halfWidth + radius, y + halfHeight);
  path.quadraticCurveTo(x - halfWidth, y + halfHeight, x - halfWidth, y + halfHeight - radius);
  path.lineTo(x - halfWidth, y - halfHeight + radius);
  path.quadraticCurveTo(x - halfWidth, y - halfHeight, x - halfWidth + radius, y - halfHeight);
  return path;
}

/**
 * An arched window: straight sides and a round top, as a path.
 *
 * @param path - Where to draw it.
 * @param grow - How much bigger than the window (for its frame).
 * @returns The path.
 */
function arch<T extends THREE.Path>(path: T, grow = 0): T {
  const left = ARCH.x - ARCH.halfWidth - grow;
  const right = ARCH.x + ARCH.halfWidth + grow;
  path.moveTo(left, ARCH.bottom - grow);
  path.lineTo(right, ARCH.bottom - grow);
  path.lineTo(right, ARCH.top);
  path.absarc(ARCH.x, ARCH.top, ARCH.halfWidth + grow, 0, Math.PI, false);
  path.lineTo(left, ARCH.bottom - grow);
  return path;
}

/**
 * Walnut panelling: tall panels with darker grooves.
 *
 * @returns The texture.
 */
function walnut(): THREE.CanvasTexture {
  return texture(128, 128, ctx => {
    const gradient = ctx.createLinearGradient(0, 0, 128, 0);
    gradient.addColorStop(0, '#4a2c17');
    gradient.addColorStop(0.5, '#5c3720');
    gradient.addColorStop(1, '#4a2c17');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(30, 15, 5, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      const x = Math.random() * 128;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 6, 40, x - 6, 90, x + 3, 128);
      ctx.stroke();
    }

    // The edges of a panel
    ctx.strokeStyle = '#2b190c';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 116, 116);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, 10, 108, 108);
  });
}

/**
 * A checkered marble floor, cream and dark green.
 *
 * @returns The texture.
 */
function marble(): THREE.CanvasTexture {
  return texture(128, 128, ctx => {
    for (const [x, y, light] of [[0, 0, true], [64, 0, false], [0, 64, false], [64, 64, true]] as const) {
      ctx.fillStyle = light ? '#efe6d2' : '#1f3b33';
      ctx.fillRect(x, y, 64, 64);
      ctx.strokeStyle = light ? 'rgba(150, 130, 100, 0.35)' : 'rgba(200, 220, 210, 0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + Math.random() * 64, y);
        ctx.quadraticCurveTo(x + Math.random() * 64, y + 32, x + Math.random() * 64, y + 64);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 128, 128);
    ctx.strokeRect(64, 0, 0.5, 128);
    ctx.strokeRect(0, 64, 128, 0.5);
  }, [18, 11]);
}

/**
 * A deep red rug with a golden border.
 *
 * @returns The texture.
 */
function rug(): THREE.CanvasTexture {
  return texture(256, 160, ctx => {
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 240, 144);
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 216, 120);
    ctx.fillStyle = 'rgba(212, 175, 55, 0.35)';
    for (const [x, y] of [[128, 80], [60, 50], [196, 50], [60, 110], [196, 110]]) {
      ctx.beginPath();
      ctx.ellipse(x!, y!, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * A velvet curtain, falling in folds, gathered by a golden tie.
 *
 * @param width - Its width.
 * @param height - Its height.
 * @returns The curtain.
 */
function curtain(width: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(width, height, 24, 1);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    positions.setZ(i, Math.sin(positions.getX(i) * 9) * 0.09);
  }

  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, material(0x7f1d1d, { roughness: 0.9, side: THREE.DoubleSide })));
  const tie = new THREE.Mesh(new THREE.TorusGeometry(width * 0.42, 0.05, 5, detail(10, 14)), gold());
  tie.scale.y = 0.35;
  tie.position.y = -height * 0.15;
  group.add(tie);
  return group;
}

/**
 * A chesterfield sofa in green velvet, its seat, back and rolled arms; on the floor at its origin, facing +z.
 *
 * @param width - Its width.
 * @returns The sofa.
 */
function sofa(width: number): THREE.Group {
  const group = new THREE.Group();
  const velvet = material(0x14532d, { roughness: 0.85 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, 1), velvet);
  seat.position.y = 0.45;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, 0.3), velvet);
  back.position.set(0, 0.9, -0.38);
  group.add(back);
  for (const side of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10), velvet);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(side * (width / 2), 0.78, 0);
    group.add(arm);
  }

  // The buttons of the quilted back, and gold feet
  const button = new THREE.SphereGeometry(0.025, 5, 4);
  const gilt = gold();
  for (let x = -width / 2 + 0.3; x < width / 2 - 0.1; x += 0.3) {
    for (const y of [0.75, 1.05]) {
      const piece = new THREE.Mesh(button, gilt);
      piece.position.set(x, y, -0.22);
      group.add(piece);
    }
  }

  for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
    for (const z of [-0.4, 0.4]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.2, 6), gilt);
      foot.position.set(x, 0.1, z);
      group.add(foot);
    }
  }

  return group;
}

/**
 * A palm in a brass pot.
 *
 * @returns The palm.
 */
function palm(): THREE.Group {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.8, 10), material(0xb08d57, { metalness: 0.85, roughness: 0.3 }));
  pot.position.y = 0.4;
  group.add(pot);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.6, 6), material(0x6b4f2e));
  trunk.position.y = 1.6;
  group.add(trunk);
  const leaf = material(0x15803d, { side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.4), leaf);
    frond.geometry.translate(0, 0.7, 0);
    frond.position.y = 2.35;
    frond.rotation.set(0, (i / 9) * Math.PI * 2, 1 + Math.random() * 0.3);
    group.add(frond);
  }

  return group;
}

/**
 * A crystal chandelier: gilded rings with hanging crystals, and its warm light.
 *
 * @param strength - How bright.
 * @param seen - Whether the camera ever sees it: if not, just its light.
 * @returns The chandelier, hanging from its top.
 */
function chandelier(strength: number, seen: boolean): THREE.Group {
  const group = new THREE.Group();
  if (seen) {
    const gilt = gold();
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), gilt);
    chain.position.y = -0.4;
    group.add(chain);
    const crystal = phong({ color: 0xfffbeb, emissive: 0xffe9b0, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 });
    const drop = new THREE.OctahedronGeometry(0.06, 0);
    for (const [radius, y, count] of [[0.7, -0.9, 14], [0.45, -1.15, 10], [0.2, -1.35, 6]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 4, 20), gilt);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      group.add(ring);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const piece = new THREE.Mesh(drop, crystal);
        piece.scale.y = 1.8;
        piece.position.set(Math.cos(angle) * radius, y - 0.12, Math.sin(angle) * radius);
        group.add(piece);
      }
    }
  }

  const light = new THREE.PointLight(0xffd8a0, strength, 22, 1.5);
  light.position.y = -1.1;
  // At high quality it casts the shadows of the furniture and of the table (see `AquariumScene`)
  if (isHigh()) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.002;
    light.shadow.radius = 2;
  }

  group.add(light);
  // The crystals and rings around the light would darken everything: they cast no shadows
  group.userData['noShadow'] = true;
  return group;
}

/**
 * Marks a part of the room itself (walls, floor, ceiling, frames, curtains): it receives the shadows of the furniture but
 * casts none, or the ceiling would put the whole floor in the shade of the light from the window.
 *
 * @param object - The part.
 * @returns The same part.
 */
function structure<T extends THREE.Object3D>(object: T): T {
  object.userData['noShadow'] = true;
  return object;
}

/**
 * The lounge, with its lights.
 *
 * @returns The lounge.
 */
export function buildLounge(): THREE.Group {
  const group = new THREE.Group();
  const panels = phong({ map: walnut(), roughness: 0.55, metalness: 0.05 });
  const gilt = gold();
  const width = RIGHT - LEFT;
  const depth = BACK - WALL_Z;
  const height = CEILING - LOUNGE_FLOOR;

  // The wall towards the ocean, with the two windows cut out
  const wallShape = new THREE.Shape();
  wallShape.moveTo(LEFT, LOUNGE_FLOOR - 0.5);
  wallShape.lineTo(RIGHT, LOUNGE_FLOOR - 0.5);
  wallShape.lineTo(RIGHT, CEILING + 0.3);
  wallShape.lineTo(LEFT, CEILING + 0.3);
  wallShape.lineTo(LEFT, LOUNGE_FLOOR - 0.5);
  wallShape.holes.push(roundedRect(new THREE.Path(), WINDOW.x, WINDOW.y, WINDOW.halfWidth, WINDOW.halfHeight, WINDOW.radius));
  wallShape.holes.push(arch(new THREE.Path()));
  const wallGeometry = new THREE.ExtrudeGeometry(wallShape, { depth: 0.4, bevelEnabled: false, curveSegments: detail(8, 16) });
  // The texture of an extrusion follows its coordinates: one panel every PANEL units, as on the other walls
  const uv = wallGeometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / PANEL, uv.getY(i) / PANEL);
  }

  const wall = new THREE.Mesh(wallGeometry, panels);
  wall.position.z = WALL_Z;
  group.add(structure(wall));

  // Gilded frames
  const frameShape = roundedRect(new THREE.Shape(), WINDOW.x, WINDOW.y, WINDOW.halfWidth + 0.35, WINDOW.halfHeight + 0.35, WINDOW.radius + 0.35);
  frameShape.holes.push(roundedRect(new THREE.Path(), WINDOW.x, WINDOW.y, WINDOW.halfWidth, WINDOW.halfHeight, WINDOW.radius));
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: detail(1, 2), curveSegments: detail(6, 10) }), gilt);
  frame.position.z = WALL_Z + 0.4;
  group.add(structure(frame));
  const archFrame = arch(new THREE.Shape(), 0.3);
  archFrame.holes.push(arch(new THREE.Path()));
  const archMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(archFrame, { depth: 0.18, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: detail(1, 2), curveSegments: detail(8, 16) }), gilt);
  archMesh.position.z = WALL_Z + 0.4;
  group.add(structure(archMesh));
  const glass = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.04, depthWrite: false });
  const pane = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), WINDOW.x, WINDOW.y, WINDOW.halfWidth, WINDOW.halfHeight, WINDOW.radius), detail(6, 8)), glass);
  pane.position.z = WALL_Z + 0.2;
  group.add(pane);
  const archPane = new THREE.Mesh(new THREE.ShapeGeometry(arch(new THREE.Shape()), detail(8, 12)), glass);
  archPane.position.z = WALL_Z + 0.2;
  group.add(archPane);

  // Velvet curtains at the sides of both windows
  for (const [x, curtainWidth, curtainHeight] of [
    [WINDOW.x - WINDOW.halfWidth - 0.8, 1.4, height - 0.4],
    [WINDOW.x + WINDOW.halfWidth + 0.8, 1.4, height - 0.4],
    [ARCH.x - ARCH.halfWidth - 0.75, 1.1, height - 0.4],
    [ARCH.x + ARCH.halfWidth + 0.75, 1.1, height - 0.4]
  ] as const) {
    const drape = curtain(curtainWidth, curtainHeight);
    drape.position.set(x, LOUNGE_FLOOR + curtainHeight / 2, WALL_Z + 0.75);
    group.add(structure(drape));
  }

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, width - 2, 8), gilt);
  rail.rotation.z = Math.PI / 2;
  rail.position.set((LEFT + RIGHT) / 2, CEILING - 0.25, WALL_Z + 0.75);
  group.add(structure(rail));

  // Marble floor, a rug under the table
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), phong({ map: marble(), roughness: 0.55, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((LEFT + RIGHT) / 2, LOUNGE_FLOOR, (WALL_Z + BACK) / 2);
  group.add(structure(floor));
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(8, 5.5), phong({ map: rug(), roughness: 0.95 }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(TABLE_POSITION.x, LOUNGE_FLOOR + 0.01, TABLE_POSITION.z);
  group.add(structure(carpet));

  // Side and back walls in walnut, a gilded moulding under the ceiling all round
  for (const [x, turn] of [[LEFT, Math.PI / 2], [RIGHT, -Math.PI / 2]] as const) {
    const side = new THREE.Mesh(panelledWall(depth, height), panels);
    side.rotation.y = turn;
    side.position.set(x, LOUNGE_FLOOR + height / 2, (WALL_Z + BACK) / 2);
    group.add(structure(side));
  }

  const back = new THREE.Mesh(panelledWall(width, height), panels);
  back.rotation.y = Math.PI;
  back.position.set((LEFT + RIGHT) / 2, LOUNGE_FLOOR + height / 2, BACK);
  group.add(structure(back));
  // Not on the left wall: its top is never seen
  for (const [x, z, length, turn] of [
    [(LEFT + RIGHT) / 2, BACK - 0.05, width, 0],
    [RIGHT - 0.05, (WALL_Z + BACK) / 2, depth, Math.PI / 2]
  ] as const) {
    for (const y of [CEILING - 0.15]) {
      const moulding = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 0.1), gilt);
      moulding.position.set(x, y, z);
      moulding.rotation.y = turn;
      group.add(structure(moulding));
    }
  }

  // A coffered ceiling: dark wood, gilded beams
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material(0x3b2414, { roughness: 0.7 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((LEFT + RIGHT) / 2, CEILING, (WALL_Z + BACK) / 2);
  group.add(structure(ceiling));
  const beam = material(0x5c3720, { roughness: 0.6 });
  for (let z = WALL_Z + 2; z < BACK; z += 3) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, 0.3), beam);
    piece.position.set((LEFT + RIGHT) / 2, CEILING - 0.15, z);
    group.add(structure(piece));
  }

  for (let x = LEFT + 3; x < RIGHT; x += 4) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, depth), beam);
    piece.position.set(x, CEILING - 0.15, (WALL_Z + BACK) / 2);
    group.add(structure(piece));
  }

  // Chandeliers: over the table, and in the middle of the lounge (never seen: just its light)
  for (const [x, z, strength, seen] of [[TABLE_POSITION.x, TABLE_POSITION.z, 22, true], [-2, WALL_Z + 10, 14, false]] as const) {
    const light = chandelier(strength, seen);
    light.position.set(x, CEILING - 0.3, z);
    group.add(light);
  }

  // Armchairs by the window and by the table. Nothing along the back and the left walls: the camera never looks there
  for (const [x, z, turn] of [[-9, WALL_Z + 4, 0.6], [-4.5, WALL_Z + 3.5, -0.4], [17.5, WALL_Z + 14, -2]] as const) {
    const armchair = sofa(1.1);
    armchair.position.set(x, LOUNGE_FLOOR, z);
    armchair.rotation.y = turn;
    group.add(armchair);
  }

  // The boards of the player and of the matches change their shape with the screen: the scene hangs them

  // Palms by the windows
  for (const [x, z] of [[LEFT + 1.2, WALL_Z + 1.5], [7.4, WALL_Z + 1.3]] as const) {
    const plant = palm();
    plant.position.set(x, LOUNGE_FLOOR, z);
    group.add(plant);
  }

  // Soft light all over, and a cold one from the ocean
  group.add(new THREE.AmbientLight(0xffe7c2, 0.12));
  // The light of the water coming in from the big window, slanting down into the lounge: at high quality it casts the
  // sharp shadows of the furniture on the floor
  const windowLight = new THREE.DirectionalLight(0xdbeafe, 2.2);
  windowLight.position.set(2, CEILING - 0.2, WALL_Z + 0.6);
  windowLight.target.position.set(8, LOUNGE_FLOOR, WALL_Z + 19);
  if (isHigh()) {
    windowLight.castShadow = true;
    windowLight.shadow.mapSize.set(2048, 2048);
    windowLight.shadow.bias = -0.0015;
    windowLight.shadow.normalBias = 0.02;
    Object.assign(windowLight.shadow.camera, { left: -22, right: 22, top: 14, bottom: -14, near: 0.5, far: 45 });
    windowLight.shadow.camera.updateProjectionMatrix();
  }

  group.add(windowLight, windowLight.target);
  const seaLight = new THREE.PointLight(0x7dd3fc, 4, 18, 1.5);
  seaLight.position.set(0, 0.5, WALL_Z + 2.5);
  group.add(seaLight);
  batchStatic(group);
  return group;
}

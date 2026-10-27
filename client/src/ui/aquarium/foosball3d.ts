import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batchStatic } from './batching';
import { detail, isHigh, paintedColorSpace } from './detail';
import { phong } from './materials';
import type { Look } from './materials';

/*
  The foosball table in the lounge, low poly, after the classic Italian table: a light oak cabinet whose long sides are
  trapezoids (the ends lean out), white inner walls and a dark green field, black splayed legs joined by an arch at each
  end, chrome rods through black bushings with black handles, a slot with the balls and a bead score counter for each
  team. Seen from the camera, behind the goal of the brown team, the brown team stands on the
  right side and the white one on the left.
*/

/**
 * Where a player of the match stands, by the handles it moves.
 */
export type SeatKey = 'white-defense' | 'white-attack' | 'brown-attack' | 'brown-defense';

/**
 * Length (along x, goal to goal) and width of the field.
 */
const LENGTH = 4.6;
const WIDTH = 2.2;

/**
 * Height of the field above the floor, and of the rods.
 */
const FIELD_Y = 1.32;
const ROD_Y = 1.62;

/**
 * The cabinet: its bottom and top, and how far its ends lean out at the top.
 */
const CABINET_BOTTOM = FIELD_Y - 0.18;
const CABINET_TOP = FIELD_Y + 0.42;
const END_BOTTOM = LENGTH / 2 + 0.12;
const END_TOP = LENGTH / 2 + 0.42;

/**
 * Thickness of the wooden panels.
 */
const PANEL = 0.08;

/**
 * Width of the deck along the top of each end, where the score counter lies.
 */
const DECK = 0.36;

/**
 * The 8 rods from the left goal: the team that moves them and how many little men they carry.
 */
const RODS: ReadonlyArray<['white' | 'brown', number]> = [
  ['brown', 1],
  ['brown', 2],
  ['white', 3],
  ['brown', 5],
  ['white', 5],
  ['brown', 3],
  ['white', 2],
  ['white', 1]
];

/**
 * A low poly material.
 *
 * @param color - The colour.
 * @param options - Other settings.
 * @returns The material.
 */
function material(color: number, options: Look = {}): THREE.MeshPhongMaterial {
  return phong({ color, roughness: 0.6, metalness: 0.1, flatShading: true, ...options });
}

/**
 * A box.
 *
 * @param width - Its size along x.
 * @param height - Along y.
 * @param depth - Along z.
 * @param color - Its material.
 * @param x - Its position.
 * @param y - Its position.
 * @param z - Its position.
 * @returns The box.
 */
function box(width: number, height: number, depth: number, color: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), color);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Light oak, with its grain along the panels.
 *
 * @returns The material.
 */
function oak(): THREE.MeshPhongMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d8b07a';
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(${150 + Math.random() * 30}, ${100 + Math.random() * 20}, 50, ${0.15 + Math.random() * 0.2})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    const y = Math.random() * 64;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + (Math.random() - 0.5) * 8, 170, y + (Math.random() - 0.5) * 8, 256, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = paintedColorSpace();
  return phong({ map: texture, roughness: 0.55, metalness: 0.05 });
}

/**
 * A soft shadow, dark in the middle and fading to the edges, to lay under small objects.
 *
 * @returns The texture.
 */
function softShadow(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const across = ctx.createLinearGradient(0, 0, 32, 0);
  across.addColorStop(0, 'rgba(0, 0, 0, 0)');
  across.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
  across.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 6, 32, 116);
  // Faded at the two ends as well
  ctx.globalCompositeOperation = 'destination-in';
  const along = ctx.createLinearGradient(0, 0, 0, 128);
  along.addColorStop(0, 'rgba(0, 0, 0, 0)');
  along.addColorStop(0.08, 'rgba(0, 0, 0, 1)');
  along.addColorStop(0.92, 'rgba(0, 0, 0, 1)');
  along.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, 32, 128);
  return new THREE.CanvasTexture(canvas);
}

/**
 * The parts of a little man, built once and shared by all the men of a team: a slightly oval head on a thin neck,
 * shoulders wide across the rod narrowing to the waist, the arms down along the sides, the legs joined in one tapering
 * block and the feet together, flat and wide, stuck out in front like a paddle. Its origin is on the rod, which goes
 * through its chest; it faces +x.
 *
 * @param plastic - Its material.
 * @returns The geometries with their material.
 */
function manShapes(plastic: THREE.Material): Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> {
  const lathe = (points: Array<[number, number]>, scaleZ: number): THREE.BufferGeometry => {
    const geometry = new THREE.LatheGeometry(points.map(([radius, y]) => new THREE.Vector2(radius, y)), detail(8, 14));
    geometry.scale(1, 1, scaleZ);
    return geometry;
  };
  const head = new THREE.SphereGeometry(0.05, detail(8, 14), detail(6, 10));
  head.scale(0.95, 1.18, 0.95);
  head.translate(0, 0.118, 0);
  const neck = new THREE.CylinderGeometry(0.02, 0.024, 0.045, detail(6, 10));
  neck.translate(0, 0.062, 0);
  // From the waist up to the shoulders: round across, flatter front to back
  const torso = lathe([[0.001, -0.1], [0.036, -0.1], [0.042, -0.06], [0.047, -0.01], [0.05, 0.025], [0.042, 0.045], [0.02, 0.052], [0.001, 0.052]], 1.3);
  torso.scale(0.8, 1, 1);
  // The legs, joined, down to the ankles
  const legs = lathe([[0.001, -0.095], [0.04, -0.095], [0.038, -0.15], [0.031, -0.21], [0.026, -0.245], [0.001, -0.245]], 1.15);
  legs.scale(0.85, 1, 1);
  const feet = new RoundedBoxGeometry(0.085, 0.034, 0.072, detail(1, 2), 0.012);
  feet.translate(0.02, -0.258, 0);
  const shapes: THREE.BufferGeometry[] = [head, neck, torso, legs, feet];
  for (const side of [1, -1]) {
    const arm = new THREE.CapsuleGeometry(0.014, 0.1, detail(2, 3), detail(5, 8));
    arm.rotateX(side * 0.12);
    arm.translate(0, -0.025, side * 0.07);
    shapes.push(arm);
  }

  return shapes.map(geometry => ({ geometry, material: plastic }));
}

/**
 * The parts of a handle, built once and shared by all the handles: a black collar on the rod, the long eight-sided grip
 * in cream with a thin black line along each edge, and a rounded black cap at the end. They lie along +z from the end
 * of the rod.
 *
 * @param black - The black of the collar and the cap.
 * @returns Each part: its geometry, its material and its distance from the end of the rod.
 */
function handleShapes(black: THREE.Material): Array<[THREE.BufferGeometry, THREE.Material, number]> {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e9d9b0';
  ctx.fillRect(0, 0, 128, 8);
  ctx.fillStyle = '#141414';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(i * 16 - 5, 0, 8, 8);
  }

  const stripes = new THREE.CanvasTexture(canvas);
  stripes.colorSpace = paintedColorSpace();
  const grip = new THREE.CylinderGeometry(0.052, 0.052, 0.24, 8);
  grip.rotateX(Math.PI / 2);
  const collar = new THREE.CylinderGeometry(0.062, 0.05, 0.06, detail(8, 16));
  collar.rotateX(Math.PI / 2);
  const cap = new THREE.SphereGeometry(0.056, detail(8, 16), detail(6, 10));
  cap.scale(1, 1, 0.75);
  return [
    [collar, black, 0.03],
    [grip, phong({ map: stripes, roughness: 0.35, metalness: 0.2 }), 0.18],
    [cap, black, 0.3]
  ];
}

/**
 * Builds the table, standing on the floor at its origin.
 *
 * @returns The table, and where each player stands (in the coordinates of the table).
 */
export function buildFoosballTable(): { object: THREE.Group; seats: Record<SeatKey, THREE.Vector3> } {
  const group = new THREE.Group();
  const wood = oak();
  const black = material(0x141414, { roughness: 0.45 });
  // Little metalness: there is nothing around to reflect, and a full metal would look black
  const chrome = material(0xf1f5f9, { metalness: 0.45, roughness: 0.2 });
  const whitePaint = material(0xf5f5f0, { roughness: 0.5 });
  const line = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  const height = CABINET_TOP - CABINET_BOTTOM;

  // The long sides: trapezoids, their ends leaning out towards the top
  const side = new THREE.Shape();
  side.moveTo(-END_BOTTOM, CABINET_BOTTOM);
  side.lineTo(END_BOTTOM, CABINET_BOTTOM);
  side.lineTo(END_TOP, CABINET_TOP);
  side.lineTo(-END_TOP, CABINET_TOP);
  side.lineTo(-END_BOTTOM, CABINET_BOTTOM);
  const sideGeometry = new THREE.ExtrudeGeometry(side, { depth: PANEL, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  // The grain along the side: the texture follows the coordinates of the shape
  const uv = sideGeometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / (END_TOP * 2) + 0.5, (uv.getY(i) - CABINET_BOTTOM) / height);
  }

  for (const z of [WIDTH / 2, -(WIDTH / 2 + PANEL)]) {
    const panel = new THREE.Mesh(sideGeometry, wood);
    panel.position.z = z;
    group.add(panel);
    // The white edge along its top
    group.add(box((END_TOP + PANEL) * 2, 0.025, PANEL + 0.03, whitePaint, 0, CABINET_TOP + 0.01, z + PANEL / 2));
  }

  // The ends, leaning out like the sides, with the dark mouth of the goal
  const lean = Math.atan2(END_TOP - END_BOTTOM, height);
  for (const sign of [-1, 1]) {
    const end = box(PANEL, height / Math.cos(lean), WIDTH, wood, sign * ((END_TOP + END_BOTTOM) / 2 + PANEL / 2), (CABINET_TOP + CABINET_BOTTOM) / 2, 0);
    end.rotation.z = -sign * lean;
    group.add(end);
    group.add(box(0.06, 0.2, 0.7, material(0x0b0b0d), sign * (LENGTH / 2 + 0.02), FIELD_Y + 0.12, 0));
    // A narrow wooden deck along the top of the end: the score counter lies on it
    const deckInner = END_TOP - DECK + PANEL;
    const deckOuter = END_TOP + PANEL;
    const deck = box(deckOuter - deckInner, 0.05, WIDTH + PANEL * 2, wood, sign * (deckInner + deckOuter) / 2, CABINET_TOP - 0.025, 0);
    // Its shadow would darken the end below it: it casts none
    deck.userData['noShadow'] = true;
    group.add(deck);
  }

  // The bottom, the field and its white inner walls
  group.add(box(END_BOTTOM * 2, 0.05, WIDTH, wood, 0, CABINET_BOTTOM + 0.025, 0));
  const field = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, WIDTH), material(0x1f6b3a, { roughness: 0.9, metalness: 0 }));
  field.rotation.x = -Math.PI / 2;
  field.position.y = FIELD_Y + 0.005;
  group.add(field);
  group.add(box(LENGTH, 0.04, WIDTH, material(0x14532d), 0, FIELD_Y - 0.02, 0));
  for (const z of [WIDTH / 2 - 0.01, -(WIDTH / 2 - 0.01)]) {
    group.add(box(LENGTH + 0.4, CABINET_TOP - FIELD_Y, 0.02, whitePaint, 0, (CABINET_TOP + FIELD_Y) / 2, z));
  }

  group.add(box(0.03, 0.01, WIDTH, line, 0, FIELD_Y + 0.01, 0));
  const circle = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.33, 24), line);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = FIELD_Y + 0.012;
  group.add(circle);
  for (const x of [-(LENGTH / 2 - 0.25), LENGTH / 2 - 0.25]) {
    group.add(box(0.03, 0.01, 0.9, line, x, FIELD_Y + 0.01, 0));
  }

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, detail(8, 10), detail(6, 8)), material(0xffffff, { roughness: 0.3 }));
  ball.position.set(0.15, FIELD_Y + 0.05, 0.1);
  group.add(ball);

  // Black legs at each end, splayed out, joined by an arch under the end; adjustable feet
  const legTopX = LENGTH / 2 - 0.25;
  const legFootX = LENGTH / 2 + 0.2;
  const legAngle = Math.atan2(legFootX - legTopX, CABINET_BOTTOM);
  const legLength = Math.hypot(legFootX - legTopX, CABINET_BOTTOM);
  for (const sign of [-1, 1]) {
    for (const z of [WIDTH / 2 - 0.05, -(WIDTH / 2 - 0.05)]) {
      const leg = box(0.16, legLength, 0.1, black, sign * (legTopX + legFootX) / 2, CABINET_BOTTOM / 2, z + Math.sign(z) * 0.07);
      leg.rotation.z = sign * legAngle;
      group.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, detail(8, 10)), black);
      foot.position.set(sign * legFootX, 0.02, z + Math.sign(z) * 0.07);
      group.add(foot);
    }

    const arch = new THREE.Mesh(new THREE.TorusGeometry(WIDTH / 2 + 0.02, 0.05, 6, 18, Math.PI), black);
    arch.rotation.y = Math.PI / 2;
    arch.scale.y = 0.55;
    arch.position.set(sign * (legTopX + (legFootX - legTopX) * 0.55), 0.15, 0);
    group.add(arch);
  }

  // The holes to put the ball in, through both long sides at the height of the rods, between the two midfield rods: a
  // black plate with its hole outside, a black disc with its hole on the white wall inside
  const dark = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const entryPlate = new THREE.CylinderGeometry(0.12, 0.12, 0.02, detail(12, 20));
  const entryDisc = new THREE.CylinderGeometry(0.11, 0.11, 0.02, detail(12, 20));
  const entryHole = new THREE.CircleGeometry(0.055, detail(10, 16));
  for (const sign of [1, -1]) {
    const plate = new THREE.Mesh(entryPlate, black);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(0, ROD_Y, sign * (WIDTH / 2 + PANEL + 0.02));
    group.add(plate);
    const outerHole = new THREE.Mesh(entryHole, dark);
    outerHole.rotation.y = sign > 0 ? 0 : Math.PI;
    outerHole.position.set(0, ROD_Y, sign * (WIDTH / 2 + PANEL + 0.032));
    group.add(outerHole);
    const disc = new THREE.Mesh(entryDisc, black);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, ROD_Y, sign * (WIDTH / 2 - 0.03));
    group.add(disc);
    const holeInside = new THREE.Mesh(entryHole, dark);
    holeInside.rotation.y = sign > 0 ? Math.PI : 0;
    holeInside.position.set(0, ROD_Y, sign * (WIDTH / 2 - 0.042));
    group.add(holeInside);
  }

  // The slot with the balls, at the left end of the near side
  group.add(box(0.42, 0.16, 0.06, black, -LENGTH / 2 + 0.25, CABINET_BOTTOM + 0.17, WIDTH / 2 + PANEL + 0.02));
  for (let i = 0; i < 3; i++) {
    const spare = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), material(0xffffff, { roughness: 0.3 }));
    spare.position.set(-LENGTH / 2 + 0.14 + i * 0.1, CABINET_BOTTOM + 0.16, WIDTH / 2 + PANEL + 0.05);
    group.add(spare);
  }

  // A score counter for each team, on the deck of its end, in the middle over the goal: a flat black bar with ten
  // rounded cubes packed together (some room left at one end, to slide them), and a bigger stop at each end
  const cube = new RoundedBoxGeometry(0.075, 0.075, 0.075, detail(1, 3), 0.018);
  const stop = new RoundedBoxGeometry(0.09, 0.095, 0.09, detail(1, 3), 0.025);
  const counterX = END_TOP + PANEL - DECK / 2;
  const contactShadow = isHigh() ? new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false }) : null;
  for (const [x, color] of [[-counterX, 0xb8693a], [counterX, 0xece4c8]] as const) {
    const bead = material(color, { roughness: 0, metalness: 0, flatShading: false });
    const y = CABINET_TOP + 0.045;
    // Too small for the shadows of the lights, which would blur them onto the end: at high quality a soft shadow drawn
    // on the deck instead
    const counter = new THREE.Group();
    counter.userData['noShadow'] = true;
    counter.add(box(0.03, 0.012, 0.98, black, x, y - 0.03, 0));
    for (let i = 0; i < 10; i++) {
      const piece = new THREE.Mesh(cube, bead);
      piece.position.set(x, y, -0.4 + i * 0.077);
      counter.add(piece);
    }

    for (const z of [-0.49, 0.49]) {
      const piece = new THREE.Mesh(stop, bead);
      piece.position.set(x, y + 0.01, z);
      counter.add(piece);
    }

    if (contactShadow) {
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.12), contactShadow);
      shade.rotation.x = -Math.PI / 2;
      shade.position.set(x, CABINET_TOP + 0.002, 0);
      counter.add(shade);
    }

    group.add(counter);
  }

  // The rods: chrome, through black bushings, with the little men and a black handle on the side of their team
  const whiteMan = manShapes(material(0xf1ead6, { roughness: 0.45, flatShading: false }));
  const brownMan = manShapes(material(0xb07a4a, { roughness: 0.45, flatShading: false }));
  const handleParts = handleShapes(black);
  const rodX = (i: number): number => -LENGTH / 2 + (LENGTH * (i + 0.5)) / RODS.length;
  const bushing = new THREE.TorusGeometry(0.065, 0.025, detail(4, 6), detail(8, 12));
  const innerDisc = new THREE.CylinderGeometry(0.1, 0.1, 0.02, detail(10, 16));
  const innerHole = new THREE.CircleGeometry(0.04, detail(8, 12));
  const holeColor = new THREE.MeshBasicMaterial({ color: 0x050505 });
  RODS.forEach(([team, count], i) => {
    const x = rodX(i);
    // The brown team stands on the right side seen from the camera (+z), the white one on the left (-z)
    const near = team === 'brown' ? 1 : -1;
    // From inside the far wall to the handle: it doesn't come out on the other side
    const start = -near * (WIDTH / 2 + 0.05);
    const end = near * (WIDTH / 2 + 0.55);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, Math.abs(end - start), 8), chrome);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(x, ROD_Y, (start + end) / 2);
    group.add(rod);
    for (const z of [WIDTH / 2 + PANEL + 0.01, -(WIDTH / 2 + PANEL + 0.01)]) {
      const ring = new THREE.Mesh(bushing, black);
      ring.position.set(x, ROD_Y, z);
      group.add(ring);
    }

    // Inside, a black rubber disc on each white wall where the rod comes through, with its darker hole
    for (const sign of [1, -1]) {
      const disc = new THREE.Mesh(innerDisc, black);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(x, ROD_Y, sign * (WIDTH / 2 - 0.03));
      group.add(disc);
      const hole = new THREE.Mesh(innerHole, holeColor);
      hole.position.set(x, ROD_Y, sign * (WIDTH / 2 - 0.042));
      hole.rotation.y = sign > 0 ? Math.PI : 0;
      group.add(hole);
    }

    // The handle, from the rod outwards: a black collar, the long eight-sided grip, a rounded black cap
    const handle = new THREE.Group();
    handle.position.set(x, ROD_Y, near * (WIDTH / 2 + 0.55));
    handle.rotation.y = near > 0 ? 0 : Math.PI;
    for (const [geometry, look, z] of handleParts) {
      const part = new THREE.Mesh(geometry, look);
      part.position.z = z;
      handle.add(part);
    }

    group.add(handle);

    // The little men face the goal of the other team: the brown ones attack to the right
    const shapes = team === 'white' ? whiteMan : brownMan;
    for (let k = 0; k < count; k++) {
      const z = -WIDTH / 2 + (WIDTH * (k + 1)) / (count + 1);
      const man = new THREE.Group();
      for (const shape of shapes) {
        man.add(new THREE.Mesh(shape.geometry, shape.material));
      }

      man.position.set(x, ROD_Y, z);
      man.rotation.y = team === 'brown' ? 0 : Math.PI;
      group.add(man);
    }
  });

  // Each player stands beyond the handles of its two rods, a bit above them
  const seat = (first: number, second: number, side: number): THREE.Vector3 => new THREE.Vector3((rodX(first) + rodX(second)) / 2, ROD_Y + 0.35, side * (WIDTH / 2 + 1.25));
  batchStatic(group);
  return {
    object: group,
    seats: {
      // The two teams face each other across the table, mirrored: the near ones closer to the table, by the
      // near goal, the far ones further along (the white attacker stands by the brown goal, and the other way round)
      'brown-defense': new THREE.Vector3(rodX(0) - 0.35, ROD_Y + 0.35, WIDTH / 2 + 0.5),
      'brown-attack': seat(3, 5, 1),
      'white-attack': new THREE.Vector3(rodX(0) - 0.35, ROD_Y + 0.35, -(WIDTH / 2 + 0.5)),
      'white-defense': seat(3, 5, -1)
    }
  };
}

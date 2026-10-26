import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import * as THREE from 'three';
import { DISPLAY } from './fonts';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildChest, buildRock, buildSeaweedBed } from './creatures';
import type { SeaweedBed } from './creatures';
import { buildBranchCoral, buildBrainCoral, buildSeaFan } from './decor';
import type { Swaying } from './decor';
import { batchStatic } from './batching';
import { detail, isHigh, paintedColorSpace } from './detail';
import { phong } from './materials';

/*
  The hall of fame, on the sea floor to the left of the aquarium: the ruins of a sunken temple with the name of the
  championship carved on its frieze, and in front of it a marble podium for the first three of the leaderboard. Over
  the winner a golden cup floats, turning among sparkles, in a beam of light coming down from the surface; gold coins
  rain slowly from above and lie in heaps around the podium.
*/

/**
 * Width and depth of a step of the podium, and the height of each one by its slot: left (the 2nd), centre (the 1st),
 * right (the 3rd).
 */
const STEP_WIDTH = 2.3;
const STEP_DEPTH = 2;
const STEP_HEIGHTS = [1.2, 1.75, 0.8] as const;

/**
 * Height of the slab the steps stand on.
 */
const BASE_HEIGHT = 0.25;

/**
 * The place written on each step, and the colour of its medal, by slot.
 */
const PLACES = [2, 1, 3] as const;
const MEDALS = ['#d6dbe2', '#f5c542', '#d08a4a'] as const;

/**
 * Coins raining down, coins lying in the heaps, and the height they fall from.
 */
const RAIN = 60;
const HEAPED = 220;
const RAIN_TOP = 10;

/**
 * Sparkles around the cup.
 */
const SPARKLES = 46;

/**
 * Where the temple stands, behind the podium, and the height of its columns.
 */
const TEMPLE_Z = -5.5;
const COLUMN_HEIGHT = 5.2;

/**
 * The hall of fame, built.
 */
export interface HallOfFame {
  object: THREE.Group;
  /**
   * Where the players stand, on top of the steps, by slot: left (the 2nd), centre (the 1st), right (the 3rd). In the
   * space of the hall, whose origin is on the sand under the middle of the podium.
   */
  spots: readonly THREE.Vector3[];
  /**
   * Moves the cup, the coins, the sparkles and the seaweed.
   *
   * @param time - Seconds since the start.
   * @param delta - Seconds since the last frame.
   */
  animate(time: number, delta: number): void;
}

/**
 * Paints white marble with grey veins.
 *
 * @returns The texture.
 */
function marbleTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#efe9df';
  ctx.fillRect(0, 0, size, size);
  // Clouds of a warmer and of a cooler white
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 40 + Math.random() * 120;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, i % 2 ? 'rgba(214,204,190,0.35)' : 'rgba(255,255,255,0.4)');
    cloud.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cloud;
    ctx.fillRect(0, 0, size, size);
  }

  // The veins: wandering lines, thin and thick
  for (let i = 0; i < 16; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    let angle = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(110,100,92,${0.18 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 12; j++) {
      angle += (Math.random() - 0.5) * 1.1;
      const length = 18 + Math.random() * 34;
      const nextX = x + Math.cos(angle) * length;
      const nextY = y + Math.sin(angle) * length;
      ctx.quadraticCurveTo(x + Math.cos(angle + 0.6) * length * 0.5, y + Math.sin(angle + 0.6) * length * 0.5, nextX, nextY);
      x = nextX;
      y = nextY;
    }

    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = paintedColorSpace();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Paints the place of a step: its number in the colour of the medal, inside a laurel wreath.
 *
 * @param place - The place, 1 to 3.
 * @param color - The colour of its medal.
 * @returns The texture, transparent around the drawing.
 */
function plaqueTexture(place: number, color: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const centerX = size / 2;
  const centerY = size / 2 + 6;
  const radius = 98;

  // The laurel: leaves along two arcs, from the bottom up to the sides of the top
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(40,26,8,0.55)';
  ctx.lineWidth = 2;
  for (const side of [1, -1]) {
    for (let i = 0; i < 9; i++) {
      const angle = Math.PI / 2 + side * (0.32 + i * 0.27);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + (side * Math.PI) / 2 + side * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // The number, as if cast in metal: light at the top, the colour of the medal at the bottom
  ctx.font = `900 150px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metal = ctx.createLinearGradient(0, centerY - 70, 0, centerY + 70);
  metal.addColorStop(0, '#ffffff');
  metal.addColorStop(0.45, color);
  metal.addColorStop(1, '#5b3b12');
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(40,26,8,0.85)';
  ctx.strokeText(String(place), centerX, centerY + 8);
  ctx.fillStyle = metal;
  ctx.fillText(String(place), centerX, centerY + 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = paintedColorSpace();
  texture.anisotropy = 4;
  return texture;
}

/**
 * Paints the frieze of the temple: the name of the championship carved in the stone, in Roman capitals.
 *
 * @returns The texture.
 */
function friezeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d9d0c1';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `700 62px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = 'CALCIO · BALILLA';
  // Carved: a light edge below, the dark cut above it
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 3);
  ctx.fillStyle = '#5a4a3a';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = paintedColorSpace();
  texture.anisotropy = 4;
  return texture;
}

/**
 * Paints a soft round sparkle.
 *
 * @returns The texture.
 */
function sparkleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.25, 'rgba(255,236,170,0.8)');
  glow.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  // A cross of light through it
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(31, 4, 2, 56);
  ctx.fillRect(4, 31, 56, 2);
  return new THREE.CanvasTexture(canvas);
}

/**
 * The texture of the beam of light: faint where it comes from, full in the middle, fading as it reaches the podium.
 *
 * @returns The texture.
 */
function beamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 128);
  return new THREE.CanvasTexture(canvas);
}

/**
 * The cup of the champion: a gold trophy with two handles, its lid topped by a foosball ball.
 *
 * @param gold - Its material.
 * @returns The cup, its foot at its origin.
 */
function buildCup(gold: THREE.Material): THREE.Group {
  const cup = new THREE.Group();
  // The foot, the stem, the bowl and the lid: finely turned at high quality, low-poly like the rest of the sea at low
  const profile = detail([
    [0, 0], [0.5, 0], [0.42, 0.15], [0.14, 0.35], [0.1, 0.8], [0.2, 0.98], [0.6, 1.45], [0.72, 2], [0.5, 2.2], [0.2, 2.33], [0, 2.38]
  ], [
    [0, 0], [0.55, 0], [0.56, 0.1], [0.44, 0.17], [0.4, 0.3], [0.16, 0.38], [0.1, 0.62], [0.17, 0.72], [0.17, 0.8],
    [0.11, 0.88], [0.2, 0.98], [0.44, 1.16], [0.6, 1.48], [0.68, 1.86], [0.75, 2], [0.7, 2.04], [0.66, 2.08], [0.5, 2.2],
    [0.24, 2.3], [0.09, 2.36], [0, 2.38]
  ]).map(([x, y]) => new THREE.Vector2(x!, y!));
  cup.add(new THREE.Mesh(new THREE.LatheGeometry(profile, detail(12, 40)), gold));

  // The handles: a half ring on each side, its ends on the body of the cup
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.34, detail(0.06, 0.055), detail(4, 10), detail(8, 24), Math.PI), gold);
    handle.position.set(side * 0.6, 1.55, 0);
    handle.rotation.z = (-side * Math.PI) / 2;
    cup.add(handle);
  }

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, detail(10, 24), detail(6, 16)), phong({ color: 0xffffff, roughness: detail(0.6, 0.35), flatShading: !isHigh() }));
  ball.position.y = 2.52;
  cup.add(ball);
  // It turns as a whole: its parts never move one from the other
  batchStatic(cup);
  return cup;
}

/**
 * A column of the temple, fluted: its base, its shaft and its capital; or, broken, just its stump.
 *
 * @param stone - Its material.
 * @param broken - Whether it fell, leaving a stump.
 * @returns The column, its foot at its origin.
 */
function buildColumn(stone: THREE.Material, broken = false): THREE.Group {
  const column = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.22, detail(12, 20)), stone);
  base.position.y = 0.11;
  column.add(base);
  const height = broken ? 1.5 : COLUMN_HEIGHT;
  // Few faces with flat shading: they read as the flutes of the shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(broken ? 0.37 : 0.34, 0.4, height, 16), stone);
  shaft.position.y = 0.22 + height / 2;
  column.add(shaft);
  if (broken) {
    // The jagged break: a slanted chunk left on top
    const chunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.37, 0.45, detail(10, 16), 1, false, 0, Math.PI * 1.3), stone);
    chunk.position.y = 0.22 + height + 0.2;
    chunk.rotation.z = 0.25;
    column.add(chunk);
    return column;
  }

  const echinus = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.38, 0.22, detail(12, 20)), stone);
  echinus.position.y = 0.22 + height + 0.11;
  column.add(echinus);
  const abacus = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 1.1), stone);
  abacus.position.y = 0.22 + height + 0.31;
  column.add(abacus);
  return column;
}

/**
 * The sunken temple: three steps, a wall with a glowing doorway, a row of columns (one fallen, its pieces on the sand),
 * the architrave with the carved frieze and the pediment, broken where the fallen column held it.
 *
 * @param stone - The material of the marble.
 * @param gold - The material of the gilding.
 * @param renderer - What draws it, for the seaweed drawn at once.
 * @param detailed - Whether with the seaweed (high quality).
 * @returns The temple, and its seaweed and fans to sway.
 */
function buildTemple(stone: THREE.Material, gold: THREE.Material, renderer: THREE.WebGLRenderer, detailed: boolean): { object: THREE.Group; seaweeds: SeaweedBed; fans: Swaying[] } {
  const temple = new THREE.Group();
  temple.position.z = TEMPLE_Z;
  const seaweeds = buildSeaweedBed(renderer);
  const fans: Swaying[] = [];
  const darkStone = phong({ color: 0x8c8478, roughness: 0.9, flatShading: true });

  // The steps it stands on
  let floor = 0;
  for (const [width, depth] of [[13.6, 4.8], [13, 4.2], [12.4, 3.6]] as const) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, depth), stone);
    step.position.y = floor + 0.15;
    temple.add(step);
    floor += 0.3;
  }

  // The wall of the cella, with its doorway lit from inside
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10.6, COLUMN_HEIGHT + 0.5, 0.5), darkStone);
  wall.position.set(-0.4, floor + (COLUMN_HEIGHT + 0.5) / 2, -1.2);
  temple.add(wall);
  const doorway = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 3),
    new THREE.MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0.85, fog: false })
  );
  doorway.position.set(0, floor + 1.5, -0.94);
  temple.add(doorway);
  const doorLight = new THREE.PointLight(0xffb84d, 6, 7, 1.6);
  doorLight.position.set(0, floor + 1.4, -0.3);
  temple.add(doorLight);

  // The columns, one fallen: its stump stands, its drums lie on the sand in front
  const columns = [-5, -3, -1, 1, 3, 5];
  columns.forEach((x, i) => {
    const column = buildColumn(stone, i === columns.length - 1);
    column.position.set(x, floor, 0.9);
    temple.add(column);
  });
  for (const [x, z, turn] of [[6.4, 2.6, 0.5], [7.6, 3.9, -0.3]] as const) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 1.5, detail(10, 16)), stone);
    drum.position.set(x, 0.37, z);
    drum.rotation.set(0, turn, Math.PI / 2);
    temple.add(drum);
  }

  // The architrave with the frieze, up to where the fallen column held it; its broken end lies on the sand
  const top = floor + 0.22 + COLUMN_HEIGHT + 0.4;
  const left = -6.2;
  const right = 3.7;
  const architrave = new THREE.Mesh(new THREE.BoxGeometry(right - left, 0.75, 1.3), stone);
  architrave.position.set((left + right) / 2, top + 0.375, 0.9);
  temple.add(architrave);
  const frieze = new THREE.Mesh(new THREE.PlaneGeometry(right - left - 0.4, ((right - left - 0.4) * 96) / 1024), phong({ map: friezeTexture(), roughness: 0.9 }));
  frieze.position.set((left + right) / 2, top + 0.375, 1.56);
  temple.add(frieze);
  const fallen = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 1.3), stone);
  fallen.position.set(5.3, 0.4, 3.4);
  fallen.rotation.set(0.12, -0.45, 0.18);
  temple.add(fallen);

  // The pediment, broken off on the same side, with a gilded disc in its middle
  const peak = 1.8;
  const half = 6.4;
  const edge = (x: number): number => peak * (1 - Math.abs(x) / half);
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(right, 0);
  shape.lineTo(right - 0.35, 0.28);
  shape.lineTo(right + 0.05, 0.5);
  shape.lineTo(right - 0.3, edge(right - 0.3));
  shape.lineTo(0, peak);
  shape.closePath();
  const pediment = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: false }), stone);
  pediment.position.set(0, top + 0.75, 0.35);
  temple.add(pediment);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, detail(16, 32)), gold);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(0, top + 0.75 + peak * 0.38, 1.5);
  temple.add(disc);

  // The sea took it back: seaweed at the feet of the columns, corals and fans on the steps
  for (const [x, z, height, color] of detailed ? [[-5.9, 1.9, 2.6, 0x15803d], [-4.2, 2.2, 1.8, 0x16a34a], [2.2, 2.1, 2.2, 0x166534], [4.3, 2.3, 3, 0x15803d], [6.6, 1.2, 2.4, 0x16a34a]] as const : []) {
    seaweeds.plant(new THREE.Vector3(x, x > -5 && x < 5 ? floor : 0, z), height, color);
  }

  temple.add(seaweeds.object);

  for (const [x, z, color, scale] of [[-6.3, 2.4, 0xf472b6, 1.1], [-2, 2.1, 0xfb923c, 0.8], [5.6, 1.9, 0xc084fc, 1]] as const) {
    const coral = buildBranchCoral(color);
    coral.position.set(x, x > -6 && x < 6 ? floor : 0, z);
    coral.scale.setScalar(scale);
    temple.add(coral);
  }

  const brain = buildBrainCoral(0x84cc16);
  brain.position.set(5.6, 0.85, 3.1);
  brain.scale.multiplyScalar(0.6);
  temple.add(brain);
  for (const [x, z, color] of [[-6.9, 0.6, 0xa855f7], [7, 0.2, 0xe11d48]] as const) {
    const fan = buildSeaFan(color);
    fan.object.position.set(x, 0, z);
    fan.object.scale.setScalar(1.4);
    fan.object.userData['noBatch'] = true;
    temple.add(fan.object);
    fans.push(fan);
  }

  for (const [x, z, size] of [[-7.6, 2.8, 0.7], [8.2, 1.4, 0.55], [-8.4, -0.8, 1]] as const) {
    const rock = buildRock(size, 0x64748b);
    rock.position.set(x, size * 0.2, z);
    temple.add(rock);
  }

  return { object: temple, seaweeds, fans };
}

/**
 * Builds the hall of fame.
 *
 * @param renderer - What draws it, for the coins and the seaweed drawn at once.
 * @param detailed - Whether with the seaweed and the light of the chest (high quality).
 * @param environment - What the metals and the marble reflect, at high quality: they are physical materials then; at
 * low quality, Phong ones that reflect nothing.
 * @returns The hall, its origin on the sand under the middle of the podium, facing +z.
 */
export function buildHallOfFame(renderer: THREE.WebGLRenderer, detailed: boolean, environment: THREE.Texture | null): HallOfFame {
  const group = new THREE.Group();
  const marble = environment
    ? new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.32, metalness: 0, envMap: environment, envMapIntensity: 0.35 })
    : phong({ map: marbleTexture(), roughness: 0.32, metalness: 0 });
  // The gold of the cup and the coins: a mirror of the room at high quality; at low quality flat, with a faint glow of
  // its own to keep it golden in the dark water
  const gold = environment
    ? new THREE.MeshStandardMaterial({ color: 0xf5c542, metalness: 1, roughness: 0.22, envMap: environment, envMapIntensity: 1.4 })
    : phong({ color: 0xf5c542, metalness: 0.3, roughness: 0.55, flatShading: true, emissive: 0x854d0e, emissiveIntensity: 0.3 });

  // The podium: a slab, three steps of marble, each with a band of its metal and its place in a wreath
  const base = new THREE.Mesh(new RoundedBoxGeometry(STEP_WIDTH * 3 + 0.7, BASE_HEIGHT, STEP_DEPTH + 0.7, detail(1, 2), 0.05), marble);
  base.position.y = BASE_HEIGHT / 2;
  group.add(base);
  const spots: THREE.Vector3[] = [];
  STEP_HEIGHTS.forEach((height, slot) => {
    const x = (slot - 1) * (STEP_WIDTH + 0.02);
    const step = new THREE.Mesh(new RoundedBoxGeometry(STEP_WIDTH, height, STEP_DEPTH, detail(1, 3), 0.06), marble);
    step.position.set(x, BASE_HEIGHT + height / 2, 0);
    group.add(step);
    const metal = environment
      ? new THREE.MeshStandardMaterial({ color: MEDALS[slot], metalness: 1, roughness: 0.25, envMap: environment, envMapIntensity: 1.3 })
      : phong({ color: MEDALS[slot], metalness: 0.3, roughness: 0.45 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(STEP_WIDTH + 0.03, 0.09, STEP_DEPTH + 0.03), metal);
    band.position.set(x, BASE_HEIGHT + height - 0.16, 0);
    group.add(band);
    const size = Math.min(1.35, (height - 0.2) * 0.95);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      phong({ map: plaqueTexture(PLACES[slot]!, MEDALS[slot]!), transparent: true, roughness: 0.4, metalness: 0.3 })
    );
    plaque.position.set(x, BASE_HEIGHT + (height - 0.2) / 2, STEP_DEPTH / 2 + 0.01);
    group.add(plaque);
    spots.push(new THREE.Vector3(x, BASE_HEIGHT + height, 0.15));
  });

  const temple = buildTemple(marble, gold, renderer, detailed);
  group.add(temple.object);

  // The cup over the winner, and the sparkles around it
  const cupY = BASE_HEIGHT + STEP_HEIGHTS[1] + 2.1;
  const cup = buildCup(gold);
  cup.position.y = cupY;
  cup.scale.setScalar(0.8);
  cup.userData['noBatch'] = true;
  group.add(cup);
  const sparklePositions = new Float32Array(SPARKLES * 3);
  const sparkleColors = new Float32Array(SPARKLES * 3);
  const sparklePhases: number[] = [];
  for (let i = 0; i < SPARKLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.9 + Math.random() * 0.9;
    sparklePositions.set([Math.cos(angle) * radius, cupY + Math.random() * 2.8, Math.sin(angle) * radius], i * 3);
    sparklePhases.push(Math.random() * Math.PI * 2);
  }

  const sparkleGeometry = new THREE.BufferGeometry();
  sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  sparkleGeometry.setAttribute('color', new THREE.BufferAttribute(sparkleColors, 3));
  const sparkles = new THREE.Points(
    sparkleGeometry,
    new THREE.PointsMaterial({ size: 0.32, map: sparkleTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  group.add(sparkles);

  // The light from the surface on the winner: a spotlight, and its beam seen in the water
  const spot = new THREE.SpotLight(0xffe7a3, 70, 26, 0.36, 0.7, 1.4);
  spot.position.set(0, 13, 1.5);
  spot.target.position.set(0, BASE_HEIGHT + STEP_HEIGHTS[1], 0);
  group.add(spot, spot.target);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.9, 11, detail(16, 32), 1, true),
    new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xfff1c4, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  beam.position.set(0, BASE_HEIGHT + STEP_HEIGHTS[1] + 5.5, 0.3);
  beam.userData['noBatch'] = true;
  group.add(beam);
  const shine = new THREE.PointLight(0xffd26b, 5, 6, 1.5);
  shine.position.set(0, cupY + 1.2, 1.4);
  group.add(shine);

  // The coins: some raining down turning, many in heaps around the podium, a chest overflowing with them
  // Rain and heaps each their own geometry: an InstancedMesh2 adds its own attributes to it
  const coin = (): THREE.BufferGeometry => new THREE.CylinderGeometry(0.13, 0.13, 0.03, detail(8, 14));
  // A material of their own: one shared with plain meshes (the cup) leaves an InstancedMesh2 undrawn
  const coinGold = gold.clone();
  const rain = new InstancedMesh2(coin(), coinGold, { capacity: RAIN, renderer });
  rain.addInstances(RAIN);
  // The coins fall: each one is culled on its own, against where it is now
  rain.frustumCulled = false;
  const falling = Array.from({ length: RAIN }, () => ({
    position: new THREE.Vector3((Math.random() - 0.5) * 14, Math.random() * RAIN_TOP, -4 + Math.random() * 7),
    rotation: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    spin: new THREE.Vector3(0.5 + Math.random() * 2, Math.random(), 0.5 + Math.random() * 2),
    speed: 0.25 + Math.random() * 0.35,
    phase: Math.random() * 10
  }));
  group.add(rain);

  const heaps = new InstancedMesh2(coin(), coinGold, { capacity: HEAPED, renderer });
  heaps.addInstances(HEAPED);
  const dummy = new THREE.Object3D();
  // In the air already: a still scene never moves them
  falling.forEach((coin, i) => {
    dummy.position.copy(coin.position);
    dummy.rotation.copy(coin.rotation);
    dummy.updateMatrix();
    rain.setMatrixAt(i, dummy.matrix);
  });
  const piles = [[-4.7, 0.9, 1.1], [4.8, 1.1, 0.9], [-2.4, 2, 0.6], [2.6, 1.9, 0.7], [0.4, 2.3, 0.5]] as const;
  for (let i = 0; i < HEAPED; i++) {
    const [x, z, radius] = piles[i % piles.length]!;
    const distance = Math.sqrt(Math.random()) * radius;
    const angle = Math.random() * Math.PI * 2;
    dummy.position.set(x + Math.cos(angle) * distance, (1 - distance / radius) * radius * 0.45 * Math.random() + 0.02, z + Math.sin(angle) * distance);
    dummy.rotation.set((Math.random() - 0.5) * 0.7, Math.random() * Math.PI, (Math.random() - 0.5) * 0.7);
    dummy.updateMatrix();
    heaps.setMatrixAt(i, dummy.matrix);
  }

  group.add(heaps);
  const chest = buildChest();
  chest.object.position.set(-5.4, 0, -0.6);
  chest.object.rotation.y = 0.6;
  group.add(chest.object);
  if (!detailed) {
    chest.glow.removeFromParent();
  }

  // The temple, the podium and the chest in batches; the cup, the beam and the fans move
  batchStatic(group);

  return {
    object: group,
    spots,
    animate(time, delta) {
      cup.rotation.y = time * 0.6;
      cup.position.y = cupY + Math.sin(time * 1.2) * 0.12;
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(time * 0.7) * 0.04;
      spot.intensity = 70 + Math.sin(time * 1.3) * 8;

      // Each sparkle flashes now and then; all of them turn slowly around the cup
      for (let i = 0; i < SPARKLES; i++) {
        const flash = Math.max(0, Math.sin(time * 2.4 + sparklePhases[i]!)) ** 6;
        sparkleColors[i * 3] = flash;
        sparkleColors[i * 3 + 1] = flash * 0.92;
        sparkleColors[i * 3 + 2] = flash * 0.7;
      }

      sparkleGeometry.getAttribute('color').needsUpdate = true;
      sparkles.rotation.y = -time * 0.25;

      falling.forEach((coin, i) => {
        coin.position.y -= coin.speed * delta;
        coin.position.x += Math.sin(time * 1.5 + coin.phase) * 0.004;
        if (coin.position.y < 0.05) {
          coin.position.set((Math.random() - 0.5) * 14, RAIN_TOP, -4 + Math.random() * 7);
        }

        coin.rotation.x += coin.spin.x * delta;
        coin.rotation.y += coin.spin.y * delta;
        coin.rotation.z += coin.spin.z * delta;
        dummy.position.copy(coin.position);
        dummy.rotation.copy(coin.rotation);
        dummy.updateMatrix();
        rain.setMatrixAt(i, dummy.matrix);
      });

      temple.seaweeds.animate(time);
      temple.fans.forEach(fan => fan.animate(time));
      chest.glow.intensity = 2.3 + Math.sin(time * 2.1) * 0.5;
    }
  };
}

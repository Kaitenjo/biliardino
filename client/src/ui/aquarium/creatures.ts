import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import * as THREE from 'three';
import { batchMoving } from './batching';
import { buildPurpleDildo } from './decor';
import { detail, paintedColorSpace } from './detail';
import { phong } from './materials';
import type { Look } from './materials';

/*
  The inhabitants and the furniture of the 3D aquarium, low poly, built from the primitives of three.js (no models to
  download). Every creature faces +x with its back up: the scene turns it towards where it swims and calls `animate`
  each frame to move its tail, fins or tentacles.
*/

/**
 * The species of the aquarium.
 */
export type Species = 'clown' | 'tang' | 'puffer' | 'angel' | 'gold' | 'shark' | 'betta' | 'octopus' | 'sole' | 'sardine' | 'tuna' | 'dildo';

/**
 * Every species: each player gets one at random, all different while possible.
 */
export const SPECIES: readonly Species[] = ['clown', 'tang', 'puffer', 'angel', 'gold', 'shark', 'betta', 'octopus', 'sole', 'sardine', 'tuna', 'dildo'];

/**
 * How a creature moves: freely in the water, lying on the bottom (the sole), or drifting low (the octopus).
 */
export type Motion = 'swim' | 'bottom' | 'drift';

/**
 * A creature of the aquarium.
 */
export interface Creature {
  /**
   * Its model, placed and turned by the scene.
   */
  object: THREE.Object3D;
  /**
   * How it moves.
   */
  motion: Motion;
  /**
   * Its cruising speed, in units per second.
   */
  speed: number;
  /**
   * How tall it is, in units: the name of its player goes above.
   */
  height: number;
  /**
   * Moves its tail, fins or tentacles.
   *
   * @param time - Seconds since the start.
   * @param pace - How fast it is swimming, 0 (still) to 1 (cruising).
   */
  animate(time: number, pace: number): void;
}

/**
 * Paints the skin of a body on a canvas: x goes around the body (0 the back, 0.5 the belly), y from the head (0) to the
 * tail (1).
 */
type Painter = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/**
 * The shapes of the tails.
 */
type TailKind = 'fork' | 'round' | 'crescent' | 'flow' | 'shark';

/**
 * The look of a fish.
 */
interface FishSpec {
  /**
   * Half length, half height and half width of the body.
   */
  length: number;
  height: number;
  width: number;
  /**
   * Its skin.
   */
  skin: Painter;
  /**
   * Colour of the fins and the tail.
   */
  fin: number;
  /**
   * Opacity of the fins and the tail, for the veils of the goldfish and the betta.
   */
  finOpacity?: number;
  /**
   * Shape and size of the tail.
   */
  tail: TailKind;
  tailSize: number;
  /**
   * Height of the fin on the back, and of the one below; none when 0.
   */
  dorsal: number;
  anal?: number;
  /**
   * Radius of the eyes; 0 for a fish that gets its own.
   */
  eye: number;
}

/**
 * A fish being built, with the parts that move.
 */
interface FishParts {
  group: THREE.Group;
  tail: THREE.Object3D;
  pectorals: THREE.Object3D[];
}

const DOUBLE = THREE.DoubleSide;

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
 * Paints a texture.
 *
 * @param paint - What to paint.
 * @param width - Width of the canvas.
 * @param height - Height of the canvas.
 * @returns The texture.
 */
function texture(paint: Painter, width = 256, height = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d')!, width, height);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = paintedColorSpace();
  return result;
}

/**
 * Paints a body darker on the back and lighter on the belly.
 *
 * @param ctx - The canvas.
 * @param width - Its width.
 * @param height - Its height.
 * @param back - Colour of the back.
 * @param belly - Colour of the belly.
 * @param side - Colour of the sides, between them.
 */
function countershade(ctx: CanvasRenderingContext2D, width: number, height: number, back: string, belly: string, side = back): void {
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, back);
  gradient.addColorStop(0.22, side);
  gradient.addColorStop(0.5, belly);
  gradient.addColorStop(0.78, side);
  gradient.addColorStop(1, back);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Paints spots at random.
 *
 * @param ctx - The canvas.
 * @param width - Its width.
 * @param height - Its height.
 * @param color - Colour of the spots.
 * @param count - How many.
 * @param radius - Their radius, in pixels.
 */
function spots(ctx: CanvasRenderingContext2D, width: number, height: number, color: string, count: number, radius: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, radius * (0.6 + Math.random() * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Paints bands around the body, across its length.
 *
 * @param ctx - The canvas.
 * @param width - Its width.
 * @param height - Its height.
 * @param bands - Centre and width of each band, as fractions of the length.
 * @param color - Their colour.
 * @param edge - Colour of their edges, none when empty.
 */
function bands(ctx: CanvasRenderingContext2D, width: number, height: number, bands: Array<[number, number]>, color: string, edge = ''): void {
  for (const [center, size] of bands) {
    if (edge) {
      ctx.fillStyle = edge;
      ctx.fillRect(0, (center - size / 2) * height - 3, width, size * height + 6);
    }

    ctx.fillStyle = color;
    ctx.fillRect(0, (center - size / 2) * height, width, size * height);
  }
}

/**
 * A flat shape facing the side (in the xy plane), seen from both sides.
 *
 * @param shape - Its outline.
 * @param color - Its colour.
 * @param opacity - Its opacity.
 * @returns The mesh.
 */
function fin(shape: THREE.Shape, color: number, opacity = 1): THREE.Mesh {
  return new THREE.Mesh(new THREE.ShapeGeometry(shape, detail(4, 8)), material(color, { side: DOUBLE, transparent: opacity < 1, opacity }));
}

/**
 * The outline of a tail, going back from the body (towards -x).
 *
 * @param kind - Its shape.
 * @param size - Its size.
 * @returns The outline.
 */
function tailShape(kind: TailKind, size: number): THREE.Shape {
  const s = size;
  const shape = new THREE.Shape();
  switch (kind) {
    case 'fork':
      shape.moveTo(0, 0.15 * s);
      shape.lineTo(-s, s);
      shape.lineTo(-0.65 * s, 0);
      shape.lineTo(-s, -s);
      shape.lineTo(0, -0.15 * s);
      break;
    case 'round':
      shape.moveTo(0, 0.12 * s);
      shape.quadraticCurveTo(-1.4 * s, 1 * s, -1.1 * s, 0);
      shape.quadraticCurveTo(-1.4 * s, -1 * s, 0, -0.12 * s);
      break;
    case 'crescent':
      shape.moveTo(0, 0.1 * s);
      shape.quadraticCurveTo(-0.45 * s, 0.35 * s, -0.95 * s, 1.15 * s);
      shape.quadraticCurveTo(-0.55 * s, 0, -0.95 * s, -1.15 * s);
      shape.quadraticCurveTo(-0.45 * s, -0.35 * s, 0, -0.1 * s);
      break;
    case 'flow':
      shape.moveTo(0, 0.15 * s);
      shape.bezierCurveTo(-0.8 * s, 1.4 * s, -2 * s, 1.3 * s, -1.8 * s, 0);
      shape.bezierCurveTo(-2 * s, -1.3 * s, -0.8 * s, -1.4 * s, 0, -0.15 * s);
      break;
    case 'shark':
      shape.moveTo(0, 0.12 * s);
      shape.lineTo(-0.95 * s, 1.35 * s);
      shape.lineTo(-0.7 * s, 0.1 * s);
      shape.lineTo(-0.6 * s, -0.75 * s);
      shape.lineTo(0, -0.12 * s);
      break;
  }

  return shape;
}

/**
 * The outline of a fin rising from the body: a curved triangle swept back.
 *
 * @param length - Length of its base.
 * @param height - Its height.
 * @param sweep - How far back its tip goes.
 * @returns The outline.
 */
function finShape(length: number, height: number, sweep: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(length / 2, 0);
  shape.quadraticCurveTo(length * 0.15, height * 0.8, -length / 2 - sweep, height);
  shape.lineTo(-length / 2, 0);
  shape.lineTo(length / 2, 0);
  return shape;
}

/**
 * An oval body along x, with its skin.
 *
 * @param length - Half length.
 * @param height - Half height.
 * @param width - Half width.
 * @param skin - The skin.
 * @param options - Other settings of the material.
 * @returns The mesh.
 */
function body(length: number, height: number, width: number, skin: Painter, options: Look = {}): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, detail(12, 20), detail(8, 14));
  // The poles of the sphere become the nose and the tail: the texture goes from the head to the tail
  geometry.rotateZ(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, phong({ map: texture(skin), roughness: 0.45, metalness: 0.1, flatShading: true, ...options }));
  mesh.scale.set(length, height, width);
  return mesh;
}

/**
 * A pair of eyes on the sides of the head.
 *
 * @param group - Where to put them.
 * @param x - Their position along the body.
 * @param y - Their height.
 * @param z - Their distance from the middle.
 * @param radius - Their radius.
 */
function eyes(group: THREE.Object3D, x: number, y: number, z: number, radius: number): void {
  const white = material(0xffffff, { roughness: 0.3 });
  const black = material(0x0b0b0d, { roughness: 0.2 });
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(radius, detail(6, 10), detail(4, 8)), white);
    eye.position.set(x, y, z * side);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.62, detail(6, 10), detail(4, 8)), black);
    pupil.position.set(radius * 0.15, 0, radius * 0.5 * side);
    eye.add(pupil);
    group.add(eye);
  }
}

/**
 * Builds a fish from its look.
 *
 * @param spec - The look.
 * @returns The fish, with the parts that move.
 */
function buildFish(spec: FishSpec): FishParts {
  const group = new THREE.Group();
  group.add(body(spec.length, spec.height, spec.width, spec.skin));

  const tail = new THREE.Group();
  tail.position.x = -spec.length * 0.9;
  tail.add(fin(tailShape(spec.tail, spec.tailSize), spec.fin, spec.finOpacity));
  group.add(tail);

  if (spec.dorsal) {
    const dorsal = fin(finShape(spec.length * 0.9, spec.dorsal, spec.length * 0.25), spec.fin, spec.finOpacity);
    dorsal.position.set(-spec.length * 0.05, spec.height * 0.82, 0);
    group.add(dorsal);
  }

  if (spec.anal) {
    const anal = fin(finShape(spec.length * 0.6, spec.anal, spec.length * 0.2), spec.fin, spec.finOpacity);
    anal.position.set(-spec.length * 0.3, -spec.height * 0.82, 0);
    anal.scale.y = -1;
    group.add(anal);
  }

  const pectorals: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(spec.length * 0.3, -spec.height * 0.25, spec.width * 0.85 * side);
    const pectoral = fin(finShape(spec.length * 0.35, spec.height * 0.55, spec.length * 0.15), spec.fin, spec.finOpacity);
    pectoral.rotation.set((Math.PI / 2) * side, 0, -0.5);
    pivot.add(pectoral);
    pivot.rotation.y = 0.35 * side;
    group.add(pivot);
    pectorals.push(pivot);
  }

  if (spec.eye) {
    eyes(group, spec.length * 0.62, spec.height * 0.22, spec.width * 0.72, spec.eye);
  }

  return { group, tail, pectorals };
}

/**
 * Makes a creature of a fish: its tail beats faster when it swims, its side fins paddle.
 *
 * @param parts - The fish.
 * @param speed - Its cruising speed.
 * @param height - Its height.
 * @param motion - How it moves.
 * @returns The creature.
 */
function swimmer(parts: FishParts, speed: number, height: number, motion: Motion = 'swim'): Creature {
  const phase = Math.random() * 10;
  return {
    object: parts.group,
    motion,
    speed,
    height,
    animate(time, pace) {
      parts.tail.rotation.y = Math.sin(time * (3 + pace * 7) + phase) * (0.25 + pace * 0.25);
      parts.pectorals.forEach((pectoral, i) => {
        pectoral.rotation.x = Math.sin(time * 4 + phase + i * Math.PI) * 0.25;
      });
    }
  };
}

/**
 * The purple dildo of the sea floor as a creature: lying down, its head forward, it wags around its middle as it swims.
 *
 * @returns The creature.
 */
function buildDildo(): Creature {
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  const toy = buildPurpleDildo();
  toy.scale.setScalar(0.42);
  toy.rotation.z = -Math.PI / 2;
  toy.position.x = -0.72;
  pivot.add(toy);
  group.add(pivot);
  const phase = Math.random() * 10;
  return {
    object: group,
    motion: 'swim',
    speed: 0.9,
    height: 0.7,
    animate(time, pace) {
      pivot.rotation.y = Math.sin(time * (3 + pace * 5) + phase) * (0.12 + pace * 0.14);
    }
  };
}

/**
 * Builds a creature of a species, its parts drawn in batches.
 *
 * @param species - The species.
 * @returns The creature.
 */
export function buildCreature(species: Species): Creature {
  const creature = buildSpecies(species);
  const redraw = batchMoving(creature.object);
  return {
    ...creature,
    animate(time, pace) {
      creature.animate(time, pace);
      redraw();
    }
  };
}

/**
 * Builds a creature of a species, each of its parts a mesh.
 *
 * @param species - The species.
 * @returns The creature.
 */
function buildSpecies(species: Species): Creature {
  switch (species) {
    case 'clown': {
      const fish = buildFish({
        length: 0.55, height: 0.3, width: 0.2, fin: 0xf97316, tail: 'round', tailSize: 0.28, dorsal: 0.22, anal: 0.14, eye: 0.065,
        skin: (ctx, w, h) => {
          ctx.fillStyle = '#f97316';
          ctx.fillRect(0, 0, w, h);
          bands(ctx, w, h, [[0.22, 0.12], [0.5, 0.12], [0.8, 0.08]], '#ffffff', '#111111');
        }
      });
      return swimmer(fish, 1.1, 0.6);
    }
    case 'tang': {
      const fish = buildFish({
        length: 0.6, height: 0.42, width: 0.14, fin: 0x1d4ed8, tail: 'fork', tailSize: 0.3, dorsal: 0.16, anal: 0.12, eye: 0.06,
        skin: (ctx, w, h) => {
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#0f172a';
          for (const x of [0.25, 0.75]) {
            ctx.beginPath();
            ctx.ellipse(x * w, 0.55 * h, 0.12 * w, 0.28 * h, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.fillStyle = '#facc15';
          ctx.fillRect(0, 0.9 * h, w, 0.1 * h);
        }
      });
      fish.tail.traverse(part => {
        if (part instanceof THREE.Mesh) {
          (part.material as THREE.MeshPhongMaterial).color.set(0xfacc15);
        }
      });
      return swimmer(fish, 1.2, 0.85);
    }
    case 'puffer': {
      const fish = buildFish({
        length: 0.42, height: 0.4, width: 0.38, fin: 0xeab308, tail: 'round', tailSize: 0.16, dorsal: 0, eye: 0.08,
        skin: (ctx, w, h) => {
          countershade(ctx, w, h, '#facc15', '#fef9c3', '#fde047');
          spots(ctx, w, h, '#a16207', 28, 5);
        }
      });
      const spike = material(0xfef3c7);
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < 22; i++) {
        // Spread on the sphere (Fibonacci), then stretched as the body
        const y = 1 - (2 * (i + 0.5)) / 22;
        const radius = Math.sqrt(1 - y * y);
        const angle = i * 2.39996;
        const direction = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), spike);
        cone.position.set(direction.x * 0.42, direction.y * 0.4, direction.z * 0.38);
        cone.quaternion.setFromUnitVectors(up, direction);
        fish.group.add(cone);
      }

      return swimmer(fish, 0.6, 0.8);
    }
    case 'angel': {
      const fish = buildFish({
        length: 0.45, height: 0.55, width: 0.1, fin: 0xfbbf24, tail: 'fork', tailSize: 0.22, dorsal: 0.55, anal: 0.5, eye: 0.06,
        skin: (ctx, w, h) => {
          ctx.fillStyle = '#fde68a';
          ctx.fillRect(0, 0, w, h);
          bands(ctx, w, h, [[0.3, 0.07], [0.52, 0.07], [0.74, 0.06]], '#1c1917');
        }
      });
      return swimmer(fish, 0.8, 1.1);
    }
    case 'gold': {
      const fish = buildFish({
        length: 0.5, height: 0.32, width: 0.24, fin: 0xfdba74, finOpacity: 0.85, tail: 'flow', tailSize: 0.3, dorsal: 0.22, anal: 0.12, eye: 0.07,
        skin: (ctx, w, h) => countershade(ctx, w, h, '#ea580c', '#fed7aa', '#f97316')
      });
      return swimmer(fish, 0.9, 0.65);
    }
    case 'shark':
      return buildShark();
    case 'betta': {
      const fish = buildFish({
        length: 0.42, height: 0.22, width: 0.14, fin: 0xa855f7, finOpacity: 0.8, tail: 'flow', tailSize: 0.36, dorsal: 0.32, anal: 0.3, eye: 0.05,
        skin: (ctx, w, h) => {
          countershade(ctx, w, h, '#5b21b6', '#c4b5fd', '#7c3aed');
          spots(ctx, w, h, 'rgba(255,255,255,0.25)', 40, 3);
        }
      });
      return swimmer(fish, 0.8, 0.7);
    }
    case 'dildo':
      return buildDildo();
    case 'tuna': {
      const fish = buildFish({
        length: 1.05, height: 0.32, width: 0.3, fin: 0x1e3a8a, tail: 'crescent', tailSize: 0.42, dorsal: 0.3, anal: 0.16, eye: 0.06,
        skin: (ctx, w, h) => {
          countershade(ctx, w, h, '#0b1f4b', '#f8fafc', '#93a8c4');
          ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
          for (let i = 0; i < 9; i++) {
            ctx.fillRect(0, (0.2 + i * 0.07) * h, w, 3);
          }
        }
      });
      // The yellow finlets before the tail
      const finlet = material(0xfacc15, { side: DOUBLE });
      for (let i = 0; i < 4; i++) {
        for (const y of [1, -1]) {
          const small = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 3), finlet);
          small.position.set(-0.45 - i * 0.1, y * (0.18 - i * 0.025), 0);
          small.rotation.z = y > 0 ? 0.6 : Math.PI - 0.6;
          fish.group.add(small);
        }
      }

      return swimmer(fish, 1.8, 0.7);
    }
    case 'sardine':
      return buildSardines();
    case 'sole':
      return buildSole();
    case 'octopus':
      return buildOctopus();
  }
}

/**
 * A great white shark: a spindle body with a pointed snout, grey above and white below with a ragged line between,
 * a tall triangular fin, long side fins, a crescent tail, black eyes, gill slits and jaws snapping on two rows of
 * teeth.
 *
 * @returns The creature.
 */
function buildShark(): Creature {
  const length = 7.2;
  const half = length / 2;
  // The girth along the body, from the tail (0) to the snout (1)
  const profile: Array<[number, number]> = [
    [0, 0.035], [0.08, 0.06], [0.2, 0.12], [0.4, 0.33], [0.58, 0.42], [0.72, 0.4], [0.84, 0.32], [0.92, 0.22], [0.97, 0.12], [1, 0]
  ];
  const geometry = new THREE.LatheGeometry(profile.map(([t, radius]) => new THREE.Vector2(radius, t * length - half)), detail(10, 18));
  geometry.rotateZ(-Math.PI / 2);
  // Grey back, white belly, the border between them ragged
  const grey = new THREE.Color(0x5f6b7a);
  const white = new THREE.Color(0xf3f4f6);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const border = normals.getY(i) + 0.12 + Math.sin(positions.getX(i) * 9) * 0.07;
    color.lerpColors(white, grey, THREE.MathUtils.smoothstep(border, -0.08, 0.08));
    colors.set([color.r, color.g, color.b], i * 3);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(geometry, phong({ vertexColors: true, roughness: 0.5, flatShading: true }));
  trunk.scale.z = 0.85;
  group.add(trunk);
  const finColor = 0x56616f;
  const x = (t: number): number => t * length - half;

  const dorsal = fin(finShape(0.85, 0.8, 0.3), finColor);
  dorsal.position.set(x(0.55), 0.38, 0);
  group.add(dorsal);
  const second = fin(finShape(0.2, 0.14, 0.05), finColor);
  second.position.set(x(0.16), 0.09, 0);
  group.add(second);
  const anal = fin(finShape(0.2, 0.12, 0.05), finColor);
  anal.position.set(x(0.17), -0.09, 0);
  anal.scale.y = -1;
  group.add(anal);

  // Long side fins, sloping down
  const pectorals: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(x(0.66), -0.2, 0.28 * side);
    const pectoral = fin(finShape(0.55, 0.85, 0.35), finColor);
    pectoral.rotation.set((Math.PI / 2) * side, 0, -0.65);
    pivot.add(pectoral);
    pivot.rotation.x = 0.45 * side;
    group.add(pivot);
    pectorals.push(pivot);
  }

  // The crescent tail, the upper lobe a bit longer
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.05, 0.06);
  tailShape.quadraticCurveTo(-0.35, 0.4, -0.75, 1.1);
  tailShape.quadraticCurveTo(-0.42, 0.35, -0.5, 0);
  tailShape.quadraticCurveTo(-0.4, -0.25, -0.62, -0.88);
  tailShape.quadraticCurveTo(-0.3, -0.32, 0.05, -0.06);
  const tail = new THREE.Group();
  tail.position.x = x(0.02);
  tail.add(fin(tailShape, finColor));
  group.add(tail);

  // Black eyes, a dark ridge above them
  const eye = material(0x020617, { roughness: 0.1, emissive: 0x450a0a, emissiveIntensity: 0.5 });
  const dark = material(0x1f2937);
  for (const side of [1, -1]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, detail(6, 10), detail(4, 8)), eye);
    ball.position.set(x(0.88), 0.08, 0.215 * side);
    group.add(ball);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.05), dark);
    ridge.position.set(x(0.875), 0.15, 0.2 * side);
    ridge.rotation.set(0.3 * side, 0, -0.35);
    group.add(ridge);
    for (let i = 0; i < 5; i++) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.3 - i * 0.025, 0.02), dark);
      slit.position.set(x(0.72 - i * 0.025), -0.02, 0.335 * side);
      slit.rotation.z = 0.15;
      group.add(slit);
    }
  }

  // The mouth: a wide arch under the snout, seen from below a U from one corner to the other round the front. The lower
  // jaw is the patch of belly inside the arch, a shell laid on the body that drops on a hinge between the corners and
  // bares the red palate under it; red cheeks close the sides of the gape
  const radiusAt = (t: number): number => {
    const i = profile.findIndex(([end]) => end >= t);
    const [t0, r0] = profile[Math.max(0, i - 1)]!;
    const [t1, r1] = profile[i]!;
    return t1 === t0 ? r1 : r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
  };
  // A point of the skin: `phi` the angle around the body from the belly, `scale` how far out of it
  const skin = (t: number, phi: number, scale = 1): THREE.Vector3 =>
    new THREE.Vector3(x(t), -radiusAt(t) * Math.cos(phi) * scale, radiusAt(t) * Math.sin(phi) * scale * trunk.scale.z);
  const front = 0.935;
  const corner = 0.78;
  const back = 0.74;
  // The angles of the corners of the trunk around the belly, for the shells to follow its facets
  const step = (Math.PI * 2) / detail(10, 18);
  const widest = step * Math.max(1.5, Math.floor(1.25 / step - 0.5) + 0.5);
  const angles: number[] = [];
  for (let phi = -widest; phi <= widest + 1e-6; phi += step) {
    angles.push(phi);
  }

  const arch = (phi: number): number => corner + (front - corner) * Math.cos((phi / widest) * (Math.PI / 2));
  const hinge = skin(corner - 0.01, widest);
  hinge.z = 0;
  // A shell over the patch of belly inside the arch, its faces turned out
  const shell = (scale: number): THREE.BufferGeometry => {
    const points: number[] = [];
    const rows = 3;
    for (let row = 0; row <= rows; row++) {
      for (const phi of angles) {
        const point = skin(back + ((arch(phi) - back) * row) / rows, phi, scale).sub(hinge);
        points.push(point.x, point.y, point.z);
      }
    }

    const indices: number[] = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < angles.length - 1; column++) {
        const a = row * angles.length + column;
        const b = a + angles.length;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // Turned out: the normal of the middle of the belly points down
    if ((geometry.getAttribute('normal') as THREE.BufferAttribute).getY(Math.floor(angles.length / 2)) > 0) {
      geometry.setIndex(indices.reverse());
      geometry.computeVertexNormals();
    }

    return geometry;
  };
  const red = material(0x7f1d1d, { roughness: 0.4 });
  const palate = new THREE.Mesh(shell(1.01), red);
  palate.position.copy(hinge);
  group.add(palate);

  const jaw = new THREE.Group();
  jaw.position.copy(hinge);
  const opening = 0.36;
  jaw.add(new THREE.Mesh(shell(1.03), material(0xf3f4f6)), new THREE.Mesh(shell(1.03), material(0x991b1b, { roughness: 0.4, side: THREE.BackSide })));
  // The cheeks: from the sides of the lip of the jaw up into the body, hidden in it while the mouth is shut
  for (const side of [1, -1]) {
    // From the back corner of the jaw, along its lip towards the front
    const along = angles.filter(phi => phi * side >= widest * 0.4).sort((a, b) => Math.abs(b) - Math.abs(a));
    const lip = [skin(back, widest * side, 1.03), ...along.map(phi => skin(arch(phi), phi, 1.03))].map(point => point.sub(hinge));
    const points: number[] = [];
    for (const point of lip) {
      const rise = Math.min(Math.max(point.x, 0) * Math.sin(opening) + 0.04, radiusAt((point.x + hinge.x + half) / length) * 1.2);
      // Up and in, towards the middle of the body: straight up from its side it would come out of it
      points.push(point.x, point.y, point.z, point.x, point.y + rise, point.z * 0.5);
    }

    const indices: number[] = [];
    for (let i = 0; i < lip.length - 1; i++) {
      indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    jaw.add(new THREE.Mesh(geometry, material(0x7f1d1d, { roughness: 0.4, side: DOUBLE })));
  }

  // The teeth along the arch: the upper ones hang over the lip, pointing down and out; the lower ones stand inside the
  // lip of the jaw, in the body while the mouth is shut
  const tooth = material(0xf8fafc, { roughness: 0.3 });
  const fang = new THREE.ConeGeometry(0.032, 0.11, 4).translate(0, 0.055, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const teeth = 13;
  for (let i = 0; i < teeth; i++) {
    const phi = -widest + ((i + 0.5) / teeth) * widest * 2;
    const size = 0.55 + 0.45 * Math.cos((phi / widest) * (Math.PI / 2));
    const out = new THREE.Vector3(0, -Math.cos(phi), Math.sin(phi));
    const upper = new THREE.Mesh(fang, tooth);
    upper.position.copy(skin(arch(phi) + 0.004, phi));
    upper.quaternion.setFromUnitVectors(up, new THREE.Vector3(0, -1, 0).lerp(out, 0.35).normalize());
    upper.scale.setScalar(size);
    group.add(upper);
    const lower = new THREE.Mesh(fang, tooth);
    lower.position.copy(skin(arch(phi) - 0.012, phi, 1.03).sub(hinge));
    lower.quaternion.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0).lerp(out, -0.2).normalize());
    lower.scale.setScalar(size * 0.85);
    jaw.add(lower);
  }

  // Bigger than everything else in the water, and stocky
  group.scale.set(1.4, 1.9, 1.5);
  group.add(jaw);

  const phase = Math.random() * 10;
  return {
    object: group,
    motion: 'swim',
    speed: 2,
    height: 2.3,
    animate(time, pace) {
      tail.rotation.y = Math.sin(time * (2.2 + pace * 4) + phase) * (0.22 + pace * 0.18);
      pectorals.forEach((pectoral, i) => {
        pectoral.rotation.y = Math.sin(time * 1.6 + phase + i * Math.PI) * 0.08;
      });
      // Snapping now and then: open, then shut
      const bite = Math.max(0, Math.sin(time * 0.9 + phase));
      jaw.rotation.z = -0.03 - bite ** 3 * (opening - 0.03);
    }
  };
}

/**
 * A little school of sardines, swimming together.
 *
 * @returns The creature.
 */
function buildSardines(): Creature {
  const group = new THREE.Group();
  const fishes: FishParts[] = [];
  const offsets = [
    [0, 0, 0],
    [-0.45, 0.16, 0.2],
    [-0.4, -0.14, -0.2],
    [-0.85, 0.02, 0.05],
    [-0.2, 0.05, -0.38]
  ];
  for (const [x, y, z] of offsets) {
    const fish = buildFish({
      length: 0.3, height: 0.08, width: 0.06, fin: 0x94a3b8, tail: 'fork', tailSize: 0.1, dorsal: 0.06, eye: 0.025,
      skin: (ctx, w, h) => {
        countershade(ctx, w, h, '#1e3a5f', '#f8fafc', '#a5b4c8');
        ctx.fillStyle = '#0f172a';
        for (const side of [0.3, 0.7]) {
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(side * w, (0.25 + i * 0.1) * h, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });
    // Silvery: a bright highlight
    (fish.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>).material.specular.setScalar(0.35);
    fish.group.position.set(x!, y!, z!);
    group.add(fish.group);
    fishes.push(fish);
  }

  group.scale.setScalar(1.4);
  const phase = Math.random() * 10;
  return {
    object: group,
    motion: 'swim',
    speed: 1.5,
    height: 0.6,
    animate(time, pace) {
      fishes.forEach((fish, i) => {
        fish.tail.rotation.y = Math.sin(time * (6 + pace * 8) + phase + i * 1.3) * 0.45;
        fish.group.position.y = offsets[i]![1]! + Math.sin(time * 1.5 + i) * 0.03;
      });
    }
  };
}

/**
 * A sole, flat on the bottom with both eyes on top, its fringe rippling.
 *
 * @returns The creature.
 */
function buildSole(): Creature {
  const group = new THREE.Group();
  const skin: Painter = (ctx, w, h) => {
    ctx.fillStyle = '#8a6239';
    ctx.fillRect(0, 0, w, h);
    spots(ctx, w, h, '#4a321b', 50, 5);
    spots(ctx, w, h, '#e0c49a', 30, 3);
  };
  group.add(body(0.8, 0.11, 0.5, skin));

  const fringe = new THREE.Mesh(new THREE.CircleGeometry(1, detail(14, 28)), material(0xc4a57a, { side: DOUBLE }));
  fringe.rotation.x = -Math.PI / 2;
  fringe.scale.set(0.9, 0.6, 1);
  fringe.position.set(-0.02, -0.01, 0);
  group.add(fringe);

  const tail = new THREE.Group();
  tail.position.x = -0.8;
  const tailFin = fin(tailShape('round', 0.2), 0xc4a57a);
  tailFin.rotation.x = -Math.PI / 2;
  tail.add(tailFin);
  group.add(tail);

  // Both eyes on the top side
  const white = material(0xf5f5f4);
  const black = material(0x0b0b0d);
  for (const [x, z] of [[0.56, 0.08], [0.48, -0.09]] as const) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), white);
    eye.position.set(x, 0.1, z);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), black);
    pupil.position.y = 0.025;
    eye.add(pupil);
    group.add(eye);
  }

  const phase = Math.random() * 10;
  return {
    object: group,
    motion: 'bottom',
    speed: 0.45,
    height: 0.2,
    animate(time, pace) {
      tail.rotation.y = Math.sin(time * (2 + pace * 4) + phase) * 0.3;
      fringe.scale.y = 0.6 + Math.sin(time * 3 + phase) * 0.025 * (0.3 + pace);
      group.rotation.x = Math.sin(time * 2 + phase) * 0.05 * pace;
    }
  };
}

/**
 * An octopus: a big head and eight tentacles that curl and wave, opening up when it pushes itself forward.
 *
 * @returns The creature.
 */
function buildOctopus(): Creature {
  const group = new THREE.Group();
  const skin: Painter = (ctx, w, h) => {
    countershade(ctx, w, h, '#c2410c', '#fdba74', '#ea580c');
    spots(ctx, w, h, '#9a3412', 30, 4);
  };
  const flesh = material(0xea580c);

  const mantle = new THREE.Mesh(new THREE.SphereGeometry(1, detail(10, 18), detail(8, 14)), phong({ map: texture(skin), roughness: 0.5, flatShading: true }));
  mantle.scale.set(0.42, 0.55, 0.42);
  mantle.position.set(-0.08, 0.45, 0);
  mantle.rotation.z = 0.35;
  group.add(mantle);
  eyes(group, 0.25, 0.18, 0.2, 0.07);

  // Each tentacle: segments chained one to the other, thinner and thinner
  const tentacles: THREE.Object3D[][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const root = new THREE.Group();
    root.position.set(Math.cos(angle) * 0.2, 0.08, Math.sin(angle) * 0.2);
    root.rotation.y = -angle;
    group.add(root);
    const segments: THREE.Object3D[] = [];
    let parent: THREE.Object3D = root;
    for (let k = 0; k < 7; k++) {
      const radius = 0.075 * (1 - k / 8);
      const length = 0.15;
      const segment = new THREE.Group();
      const piece = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, length, 6), flesh);
      piece.position.y = -length / 2;
      segment.add(piece);
      if (k > 0) {
        segment.position.y = -length;
      }

      parent.add(segment);
      segments.push(segment);
      parent = segment;
    }

    tentacles.push(segments);
  }

  const phase = Math.random() * 10;
  return {
    object: group,
    motion: 'drift',
    speed: 0.5,
    height: 1.1,
    animate(time, pace) {
      tentacles.forEach((segments, i) => {
        segments.forEach((segment, k) => {
          const base = k === 0 ? 0.5 + pace * 0.5 : 0.18 - pace * 0.1;
          segment.rotation.z = base + Math.sin(time * 2 + phase + i * 0.8 + k * 0.5) * 0.18;
        });
      });
      mantle.scale.y = 0.55 + Math.sin(time * 2 + phase) * 0.03;
    }
  };
}

/**
 * A treasure chest half open, full of gold coins that shine.
 *
 * @returns The chest, and the light of its gold.
 */
export function buildChest(): { object: THREE.Group; glow: THREE.PointLight } {
  const group = new THREE.Group();
  const wood = material(0x7c4a21);
  const gold = material(0xfacc15, { metalness: 0.8, roughness: 0.25, emissive: 0x854d0e, emissiveIntensity: 0.35 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75, 0.9), wood);
  box.position.y = 0.37;
  group.add(box);
  for (const x of [-0.55, 0, 0.55]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.94), gold);
    band.position.set(x, 0.37, 0);
    group.add(band);
  }

  const coins = new THREE.Group();
  const coin = new THREE.CylinderGeometry(0.08, 0.08, 0.02, detail(6, 10));
  for (let i = 0; i < 26; i++) {
    const piece = new THREE.Mesh(coin, gold);
    piece.position.set((Math.random() - 0.5) * 1.15, 0.76 + Math.random() * 0.12, (Math.random() - 0.5) * 0.65);
    piece.rotation.set(Math.random(), Math.random(), Math.random());
    coins.add(piece);
  }

  group.add(coins);

  // The lid, open, turning on its back edge
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.75, -0.45);
  // Seen from both sides: open, its inside shows
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, detail(8, 12), 1, false, 0, Math.PI), material(0x7c4a21, { side: DOUBLE }));
  lid.rotation.z = Math.PI / 2;
  lid.position.z = 0.45;
  hinge.add(lid);
  for (const x of [-0.55, 0.55]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.08, detail(8, 12), 1, true, 0, Math.PI), material(0xfacc15, { metalness: 0.8, roughness: 0.25, side: DOUBLE }));
    band.rotation.z = Math.PI / 2;
    band.position.set(x, 0, 0.45);
    hinge.add(band);
  }

  hinge.rotation.x = -0.75;
  group.add(hinge);

  const glow = new THREE.PointLight(0xfbbf24, 2.5, 4, 1.5);
  glow.position.set(0, 1.1, 0.2);
  group.add(glow);
  return { object: group, glow };
}

/**
 * Half of the Titanic: the bow, broken off at the third funnel, tilted and half buried.
 *
 * @returns The wreck.
 */
export function buildShipwreck(): THREE.Group {
  const group = new THREE.Group();
  const black = material(0x1c1917, { roughness: 0.9 });
  const red = material(0x7f1d1d, { roughness: 0.9 });
  const white = material(0xe7e5e4, { roughness: 0.85 });
  const dark = material(0x292524, { roughness: 0.95 });
  const buff = material(0xd9a441, { roughness: 0.85 });
  const deckWood = material(0x78532f, { roughness: 0.95 });

  // The hull seen from above, the bow towards +x and the torn end towards -x, extruded up
  const outline = new THREE.Shape();
  outline.moveTo(-2.6, -0.8);
  outline.lineTo(1.8, -0.8);
  outline.quadraticCurveTo(3.4, -0.5, 4.2, 0);
  outline.quadraticCurveTo(3.4, 0.5, 1.8, 0.8);
  outline.lineTo(-2.6, 0.8);
  outline.lineTo(-2.35, 0.35);
  outline.lineTo(-2.85, 0.05);
  outline.lineTo(-2.3, -0.4);
  outline.lineTo(-2.6, -0.8);
  const hullGeometry = new THREE.ExtrudeGeometry(outline, { depth: 1.1, bevelEnabled: false });
  hullGeometry.rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hullGeometry, black);
  group.add(hull);
  // The red of the keel
  const keel = new THREE.Mesh(hullGeometry, red);
  keel.scale.set(1.01, 0.28, 1.01);
  keel.position.y = -0.01;
  group.add(keel);

  // The decks laid bare where the ship broke
  for (const [y, reach] of [[0.35, 0.5], [0.7, 0.3], [1.05, 0.6]] as const) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9 + reach, 0.06, 1.5), deckWood);
    plate.position.set(-2.4 - reach / 2 + 0.25, y, 0);
    plate.rotation.z = (y - 0.7) * 0.25;
    group.add(plate);
  }

  // The superstructure: white, with a row of windows
  const superstructure = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 1.3), white);
  superstructure.position.set(0, 1.37, 0);
  group.add(superstructure);
  const windows = material(0x1e293b, { emissive: 0xfbbf24, emissiveIntensity: 0.25 });
  for (const side of [1, -1]) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 0.02), windows);
    row.position.set(0, 1.42, 0.66 * side);
    group.add(row);
  }

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 1.1), white);
  bridge.position.set(2.2, 1.55, 0);
  group.add(bridge);

  // The funnels, buff with a black top, leaning back; the last one is torn
  const funnel = (x: number, height: number, lean: number): void => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, height, detail(8, 12)), buff);
    pipe.scale.z = 1.25;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.34, height * 0.22, detail(8, 12)), black);
    top.position.y = height * 0.39;
    pipe.add(top);
    pipe.position.set(x, 1.65 + height / 2, 0);
    pipe.rotation.z = lean;
    group.add(pipe);
  };
  funnel(1.1, 1.9, 0.1);
  funnel(-0.2, 1.9, 0.14);
  funnel(-1.5, 0.9, 0.3);

  // The foremast, snapped, and the bow rail
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.8, 6), dark);
  mast.position.set(3.1, 1.6, 0);
  mast.rotation.z = -0.4;
  group.add(mast);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 1.1), dark);
  rail.position.set(3.2, 1.12, 0);
  group.add(rail);
  return group;
}

/**
 * The Titan, the submersible that imploded near the Titanic, as it was: a long white capsule with a tapered nose, a
 * grey dome at the back, a clamp around it, blue ropes and a red-tipped pole on top, and a skid under it.
 *
 * @returns The submersible, its nose towards +x.
 */
export function buildTitan(): THREE.Group {
  const group = new THREE.Group();
  const white = material(0xf1f5f9, { roughness: 0.4 });
  const grey = material(0x9ca3af, { roughness: 0.4, metalness: 0.7 });
  const black = material(0x18181b, { roughness: 0.6 });
  const rope = material(0x38bdf8, { roughness: 0.7 });
  const red = material(0xdc2626, { roughness: 0.6 });

  // The body and its long nose, turned around x: the nose tapers and its top is flatter than its belly
  const profile = [
    [-1.3, 0], [-1.3, 0.5], [1.0, 0.55], [1.5, 0.46], [1.9, 0.3], [2.1, 0.12], [2.15, 0]
  ].map(([x, radius]) => new THREE.Vector2(radius!, x!));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, detail(10, 16)), white);
  body.rotation.z = -Math.PI / 2;
  body.position.x = -0.4;
  group.add(body);

  // The titanium dome at the back
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, detail(8, 12), detail(5, 8), 0, Math.PI * 2, 0, Math.PI / 2), grey);
  dome.rotation.z = Math.PI / 2;
  dome.position.x = -1.7;
  group.add(dome);

  // The clamp around the body
  const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 5, detail(10, 16)), black);
  clamp.rotation.y = Math.PI / 2;
  clamp.position.x = 0.2;
  group.add(clamp);

  // The blue rope looping along the top
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.5, 0.35, 0.3), new THREE.Vector3(-1.1, 0.58, 0.1), new THREE.Vector3(-0.7, 0.56, 0.25),
    new THREE.Vector3(-0.3, 0.6, 0), new THREE.Vector3(0.1, 0.57, 0.15), new THREE.Vector3(0.2, 0.45, 0.4)
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(path, 14, 0.035, 4), rope));

  // The pole with its red tip, and the equipment box
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), grey);
  pole.position.set(1.2, 0.8, 0);
  group.add(pole);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), red);
  tip.position.set(1.2, 1.07, 0);
  group.add(tip);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.22), black);
  box.position.set(-0.7, 0.62, 0);
  group.add(box);

  // The skid under it, the thrusters at the back
  const skid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.1), grey);
  skid.position.set(-0.3, -0.75, 0);
  group.add(skid);
  for (const x of [-0.8, 0.4]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.1), grey);
    strut.position.set(x, -0.63, 0);
    group.add(strut);
  }

  for (const z of [-0.2, 0.2]) {
    const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 6), black);
    thruster.rotation.z = Math.PI / 2;
    thruster.position.set(-1.45, -0.45, z);
    group.add(thruster);
  }

  return group;
}

/**
 * Leaves of a seaweed.
 */
const LEAVES = 8;

/**
 * Seaweeds, each a chain of leaves that sways; all of them drawn at once (instancing), a leaf an instance.
 */
export interface SeaweedBed {
  object: InstancedMesh2;
  /**
   * Plants a seaweed.
   *
   * @param position - Where it grows, in the space of the bed.
   * @param height - How tall.
   * @param color - Its colour.
   * @param width - Width of its leaves at the bottom.
   */
  plant(position: THREE.Vector3, height: number, color: number, width?: number): void;
  /**
   * Sways the seaweeds.
   *
   * @param time - Seconds since the start.
   */
  animate(time: number): void;
}

/**
 * Builds an empty bed of seaweeds.
 *
 * @param renderer - What draws it: without it, its buffers are made at the first frame, which draws none of it (a still
 *   scene draws only that one).
 * @returns The bed.
 */
export function buildSeaweedBed(renderer: THREE.WebGLRenderer): SeaweedBed {
  // One leaf, its foot at its origin, a bit longer than its segment to cover the joint: each instance stretches it
  const leaf = new THREE.PlaneGeometry(1, 1.1).translate(0, 0.5, 0);
  const mesh = new InstancedMesh2(leaf, material(0xffffff, { side: DOUBLE }), { renderer });
  // The leaves move: each one is culled on its own, against where it is now
  mesh.frustumCulled = false;
  const weeds: Array<{ position: THREE.Vector3; length: number; width: number; phase: number; first: number }> = [];
  const chain = new THREE.Matrix4();
  const step = new THREE.Matrix4();
  const blade = new THREE.Matrix4();
  const bend = new THREE.Euler();
  const size = new THREE.Vector3();

  // Each segment bends on the one below it; its leaf turns around the stem, narrower going up
  const sway = (weed: (typeof weeds)[number], time: number): void => {
    chain.makeTranslation(weed.position);
    for (let i = 0; i < LEAVES; i++) {
      if (i > 0) {
        chain.multiply(step.makeTranslation(0, weed.length, 0));
      }

      bend.set(Math.cos(time * 0.7 + weed.phase + i * 0.3) * 0.05, 0, Math.sin(time * 0.9 + weed.phase + i * 0.35) * 0.09);
      chain.multiply(step.makeRotationFromEuler(bend));
      blade.makeRotationY(i * 0.6).scale(size.set(weed.width * (1 - i / (LEAVES + 2)), weed.length, 1));
      mesh.setMatrixAt(weed.first + i, step.multiplyMatrices(chain, blade));
    }
  };

  return {
    object: mesh,
    plant(position, height, color, width = 0.22) {
      const weed = { position, length: height / LEAVES, width, phase: Math.random() * 10, first: mesh.instancesCount };
      mesh.addInstances(LEAVES, instance => {
        instance.color = color;
      });
      weeds.push(weed);
      sway(weed, 0);
    },
    animate(time) {
      for (const weed of weeds) {
        sway(weed, time);
      }
    }
  };
}

/**
 * A rock.
 *
 * @param size - Its size.
 * @param color - Its colour.
 * @returns The rock.
 */
export function buildRock(size: number, color: number): THREE.Mesh {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), material(color, { roughness: 0.95 }));
  rock.scale.y = 0.6;
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  return rock;
}

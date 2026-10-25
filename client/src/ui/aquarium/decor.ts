import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
  The furniture of the sea floor and the life in the background of the 3D aquarium, low poly like the creatures:
  corals and sea fans, an anchor, barrels and amphoras by the wreck, a rock arch
  and kelp far away, jellyfish, and the shape of the little fish of the schools.
*/

/**
 * A part of the scenery that moves: `animate` is called each frame.
 */
export interface Swaying {
  object: THREE.Object3D;
  animate(time: number): void;
}

/**
 * A low poly material.
 *
 * @param color - The colour.
 * @param options - Other settings.
 * @returns The material.
 */
function material(color: number, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...options });
}

/**
 * A branching coral: a trunk splitting into branches, rounded at the tips.
 *
 * @param color - Its colour.
 * @returns The coral.
 */
export function buildBranchCoral(color: number): THREE.Group {
  const flesh = material(color);
  const grow = (depth: number, length: number, radius: number): THREE.Group => {
    const node = new THREE.Group();
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius, length, 6), flesh);
    piece.position.y = length / 2;
    node.add(piece);
    if (!depth) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.9, 6, 4), flesh);
      tip.position.y = length;
      node.add(tip);
      return node;
    }

    for (let i = 0; i < 2; i++) {
      const child = grow(depth - 1, length * 0.78, radius * 0.72);
      child.position.y = length;
      child.rotation.set((Math.random() - 0.5) * 1.2, Math.random() * Math.PI * 2, (i ? 1 : -1) * (0.35 + Math.random() * 0.4));
      node.add(child);
    }

    return node;
  };
  const coral = new THREE.Group();
  coral.add(grow(3, 0.42, 0.09));
  return coral;
}

/**
 * A brain coral: a squashed bumpy ball.
 *
 * @param color - Its colour.
 * @returns The coral.
 */
export function buildBrainCoral(color: number): THREE.Mesh {
  const geometry = new THREE.IcosahedronGeometry(0.5, 3);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    point.multiplyScalar(1 + Math.sin(point.x * 22) * Math.sin(point.z * 22) * 0.05);
    positions.setXYZ(i, point.x, point.y, point.z);
  }

  geometry.computeVertexNormals();
  const coral = new THREE.Mesh(geometry, material(color, { roughness: 0.9 }));
  coral.scale.y = 0.6;
  return coral;
}

/**
 * A sea fan: a wide thin fan on a stalk, swaying.
 *
 * @param color - Its colour.
 * @returns The fan.
 */
export function buildSeaFan(color: number): Swaying {
  const group = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.3, 5), material(0x4c1d95));
  stalk.position.y = 0.15;
  group.add(stalk);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-0.75, 0.85);
  shape.quadraticCurveTo(-0.3, 1.45, 0, 1.4);
  shape.quadraticCurveTo(0.35, 1.5, 0.8, 0.95);
  shape.lineTo(0, 0);
  const fan = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), material(color, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  fan.position.y = 0.25;
  group.add(fan);
  const phase = Math.random() * 10;
  return {
    object: group,
    animate(time) {
      fan.rotation.x = Math.sin(time * 0.8 + phase) * 0.12;
    }
  };
}

/**
 * An old anchor, rusty.
 *
 * @returns The anchor.
 */
export function buildAnchor(): THREE.Group {
  const group = new THREE.Group();
  const rust = material(0x7c2d12, { roughness: 1, metalness: 0.3 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), rust);
  shaft.position.y = 0.8;
  group.add(shaft);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 5, 10), rust);
  ring.position.y = 1.7;
  group.add(ring);
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), rust);
  stock.position.y = 1.45;
  stock.rotation.x = Math.PI / 2;
  group.add(stock);
  // The arms: half a ring at the bottom, with a fluke at each end
  const arms = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 12, Math.PI), rust);
  arms.position.y = 0.55;
  arms.rotation.z = Math.PI;
  group.add(arms);
  for (const side of [1, -1]) {
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), rust);
    fluke.position.set(0.55 * side, 0.62, 0);
    group.add(fluke);
  }

  return group;
}

/**
 * A barrel, lying on its side.
 *
 * @returns The barrel.
 */
export function buildBarrel(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.9, 12), material(0x6b4423, { roughness: 0.95 }));
  group.add(body);
  for (const y of [-0.3, 0.3]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 4, 14), material(0x3f3f46, { metalness: 0.4 }));
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    group.add(hoop);
  }

  group.rotation.z = Math.PI / 2;
  return group;
}

/**
 * An amphora of a sunken cargo.
 *
 * @returns The amphora.
 */
export function buildAmphora(): THREE.Mesh {
  const profile = [
    [0.04, 0], [0.18, 0.08], [0.27, 0.32], [0.25, 0.52], [0.14, 0.72], [0.08, 0.82], [0.11, 0.9], [0.1, 0.93]
  ].map(([radius, y]) => new THREE.Vector2(radius!, y!));
  return new THREE.Mesh(new THREE.LatheGeometry(profile, 10), material(0xb45309, { roughness: 0.9 }));
}

/**
 * A big rock arch, far away in the fog.
 *
 * @returns The arch.
 */
export function buildRockArch(): THREE.Group {
  const group = new THREE.Group();
  const stone = material(0x3f4f62, { roughness: 1 });
  for (const x of [-1.7, 1.7]) {
    const pillar = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), stone);
    pillar.scale.set(0.8, 2.2, 0.8);
    pillar.position.set(x, 1.4, 0);
    group.add(pillar);
  }

  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.55, 5, 9, Math.PI), stone);
  arch.position.y = 2.6;
  group.add(arch);
  return group;
}

/**
 * A jellyfish: a pulsing translucent bell and trailing tentacles, drifting.
 *
 * @param color - Its colour.
 * @returns The jellyfish.
 */
export function buildJellyfish(color: number): Swaying {
  const group = new THREE.Group();
  const jelly = material(color, { transparent: true, opacity: 0.55, emissive: color, emissiveIntensity: 0.45, side: THREE.DoubleSide, roughness: 0.2 });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), jelly);
  group.add(bell);
  const strands: THREE.Object3D[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 1.1, 3), jelly);
    strand.geometry.translate(0, -0.55, 0);
    strand.position.set(Math.cos(angle) * 0.22, 0, Math.sin(angle) * 0.22);
    group.add(strand);
    strands.push(strand);
  }

  const phase = Math.random() * 10;
  return {
    object: group,
    animate(time) {
      const pulse = Math.sin(time * 2 + phase);
      bell.scale.set(1 - pulse * 0.08, 1 + pulse * 0.12, 1 - pulse * 0.08);
      strands.forEach((strand, i) => {
        strand.rotation.x = Math.sin(time * 1.4 + phase + i) * 0.15;
        strand.rotation.z = Math.cos(time * 1.2 + phase + i) * 0.15;
      });
    }
  };
}

/**
 * The shape of the little fish of the schools: one geometry, drawn many times at once (instancing).
 *
 * @returns The geometry, facing +x.
 */
export function schoolFishGeometry(): THREE.BufferGeometry {
  const profile = [[0, 0], [0.03, 0.06], [0.055, 0.17], [0.045, 0.27], [0, 0.34]].map(([radius, y]) => new THREE.Vector2(radius!, y!));
  const body = new THREE.LatheGeometry(profile, 6);
  body.translate(0, -0.17, 0);
  body.rotateZ(-Math.PI / 2);
  body.scale(1, 1, 0.6);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(-0.1, 0.06);
  tailShape.lineTo(-0.1, -0.06);
  tailShape.lineTo(0, 0);
  const tail = new THREE.ShapeGeometry(tailShape);
  tail.translate(-0.15, 0, 0);
  return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()])!;
}

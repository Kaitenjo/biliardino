import * as THREE from 'three';

/*
  Fewer draw calls: the meshes of a part of the scene whose materials are the same but for their colour are drawn in
  one go, as the instances of a BatchedMesh, each one with its own colour. The meshes stay where they were, so that
  the animations still move them and what hangs from them, but they are not drawn any more: they leave the layer of
  the camera. A part that moves calls the update of its batches after moving.
  A mesh is left alone if it, or what it hangs from, is marked with `userData.noBatch`: its material changes, or it is
  looked for by the pointer.
*/

/**
 * The layer of the meshes drawn by a batch instead: the camera sees only layer 0.
 */
const BATCHED_LAYER = 31;

/**
 * A mesh to batch, and its material.
 */
interface Entry {
  mesh: THREE.Mesh;
  material: THREE.MeshPhongMaterial | THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
}

/**
 * What two materials must share to be drawn in one batch: everything but their colour.
 *
 * @param material - The material.
 * @returns Its key.
 */
function signature(material: THREE.Material): string {
  const phong = material as THREE.MeshPhongMaterial;
  const standard = material as THREE.MeshStandardMaterial;
  return [
    material.type, phong.map?.uuid, phong.emissive?.getHex(), phong.emissiveIntensity, phong.specular?.getHex(), phong.shininess,
    phong.flatShading, material.vertexColors, material.transparent, material.opacity, material.side, material.depthWrite,
    material.depthTest, material.blending, phong.fog, material.alphaTest, standard.roughness, standard.metalness,
    standard.envMap?.uuid, standard.envMapIntensity
  ].join('|');
}

/**
 * Whether a mesh can be drawn by a batch: a plain one, with one material, shown, not marked.
 *
 * @param object - The object.
 * @returns Whether it can.
 */
function batchable(object: THREE.Object3D): object is THREE.Mesh {
  if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object instanceof THREE.BatchedMesh || 'isInstancedMesh2' in object) {
    return false;
  }

  const material = object.material;
  if (Array.isArray(material) || !(material instanceof THREE.MeshPhongMaterial || material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial)) {
    return false;
  }

  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible || node.userData['noBatch']) {
      return false;
    }
  }

  return true;
}

/**
 * Whether a mesh casts no shadow: it, or what it hangs from, is marked with `userData.noShadow`.
 *
 * @param object - The mesh.
 * @returns Whether it casts none.
 */
function castsNoShadow(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.userData['noShadow']) {
      return true;
    }
  }

  return false;
}

/**
 * The matrix of an object in the space of a part it hangs from.
 *
 * @param object - The object.
 * @param root - The part.
 * @param target - Where to write it.
 * @returns The matrix.
 */
function matrixIn(object: THREE.Object3D, root: THREE.Object3D, target: THREE.Matrix4): THREE.Matrix4 {
  target.identity();
  for (let node: THREE.Object3D | null = object; node && node !== root; node = node.parent) {
    node.updateMatrix();
    target.premultiply(node.matrix);
  }

  return target;
}

/**
 * A copy of a geometry as a batch takes it: indexed, with just the attributes all its geometries share.
 *
 * @param geometry - The geometry.
 * @param uv - Whether it keeps its texture coordinates (its material has a texture).
 * @param color - Whether it keeps its vertex colours.
 * @returns The copy.
 */
function prepare(geometry: THREE.BufferGeometry, uv: boolean, color: boolean): THREE.BufferGeometry {
  const copy = new THREE.BufferGeometry();
  const position = geometry.getAttribute('position');
  copy.setAttribute('position', position);
  if (geometry.getAttribute('normal')) {
    copy.setAttribute('normal', geometry.getAttribute('normal'));
  } else {
    copy.computeVertexNormals();
  }

  if (uv) {
    copy.setAttribute('uv', geometry.getAttribute('uv') ?? new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  }

  if (color) {
    copy.setAttribute('color', geometry.getAttribute('color') ?? new THREE.BufferAttribute(new Float32Array(position.count * 3).fill(1), 3));
  }

  copy.setIndex(geometry.index ?? Array.from({ length: position.count }, (_, i) => i));
  return copy;
}

/**
 * Draws the meshes of a part in batches, one for each material but for its colour; the batches hang from the part.
 *
 * @param root - The part.
 * @param moving - Whether its meshes move: the batch is then never culled as a whole, only each of its instances.
 * @returns The batches, and the meshes each one draws.
 */
function build(root: THREE.Object3D, moving: boolean): Array<{ batch: THREE.BatchedMesh; meshes: THREE.Mesh[] }> {
  const groups = new Map<string, Entry[]>();
  root.traverse(object => {
    if (batchable(object)) {
      const material = object.material as Entry['material'];
      // What casts no shadow apart from what does: a batch casts its shadows or not, as a whole
      const key = `${signature(material)}|${castsNoShadow(object)}`;
      groups.set(key, [...(groups.get(key) ?? []), { mesh: object, material }]);
    }
  });

  const batches: Array<{ batch: THREE.BatchedMesh; meshes: THREE.Mesh[] }> = [];
  const matrix = new THREE.Matrix4();
  for (const entries of groups.values()) {
    // A single mesh is one draw call anyway
    if (entries.length < 2) {
      continue;
    }

    const first = entries[0]!.material;
    const uv = 'map' in first && first.map !== null;
    // The same geometry, used by more meshes, is stored once
    const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    for (const { mesh } of entries) {
      if (!geometries.has(mesh.geometry)) {
        geometries.set(mesh.geometry, prepare(mesh.geometry, uv, first.vertexColors));
      }
    }

    let vertices = 0;
    let indices = 0;
    for (const geometry of geometries.values()) {
      vertices += geometry.getAttribute('position').count;
      indices += geometry.index!.count;
    }

    const coloured = entries.some(({ material }) => !material.color.equals(first.color));
    const material = first.clone();
    if (coloured) {
      // Each instance its own colour, multiplied by the one of the material
      material.color.set(0xffffff);
    }

    const batch = new THREE.BatchedMesh(entries.length, vertices, indices, material);
    batch.frustumCulled = !moving;
    const ids = new Map<THREE.BufferGeometry, number>();
    for (const [source, geometry] of geometries) {
      ids.set(source, batch.addGeometry(geometry));
    }

    entries.forEach(({ mesh, material: own }) => {
      const instance = batch.addInstance(ids.get(mesh.geometry)!);
      batch.setMatrixAt(instance, matrixIn(mesh, root, matrix));
      if (coloured) {
        batch.setColorAt(instance, own.color);
      }

      mesh.layers.set(BATCHED_LAYER);
    });

    batch.userData['noShadow'] = castsNoShadow(entries[0]!.mesh);
    root.add(batch);
    batches.push({ batch, meshes: entries.map(({ mesh }) => mesh) });
  }

  return batches;
}

/**
 * Draws the meshes of a part that doesn't move in batches.
 *
 * @param root - The part.
 */
export function batchStatic(root: THREE.Object3D): void {
  build(root, false);
}

/**
 * Draws the meshes of a part that moves in batches.
 *
 * @param root - The part.
 * @returns What moves the instances of the batches where the meshes are now: to call after moving them.
 */
export function batchMoving(root: THREE.Object3D): () => void {
  const batches = build(root, true);
  const matrix = new THREE.Matrix4();
  return () => {
    for (const { batch, meshes } of batches) {
      meshes.forEach((mesh, instance) => batch.setMatrixAt(instance, matrixIn(mesh, root, matrix)));
    }
  };
}

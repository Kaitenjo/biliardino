import * as THREE from 'three';

/*
  The whole scene is drawn with Phong materials, the cheapest of the lit ones. Their look is still told as for the
  physical ones, how rough and how metallic, and turned into the shininess and the highlight of Phong.
*/

/**
 * The look of a material: the settings of a Phong one, and how rough and how metallic it is.
 */
export interface Look extends THREE.MeshPhongMaterialParameters {
  /**
   * From 0 (polished) to 1 (chalky): the smoother, the smaller and brighter its highlight.
   */
  roughness?: number;
  /**
   * From 0 to 1: a metal's highlight takes its colour, and its own colour darkens.
   */
  metalness?: number;
}

/**
 * A Phong material.
 *
 * @param look - Its look.
 * @returns The material.
 */
export function phong({ roughness = 0.6, metalness = 0, ...options }: Look = {}): THREE.MeshPhongMaterial {
  const material = new THREE.MeshPhongMaterial(options);
  // Rough in quarters, and either a metal or not: materials alike end up the same but for their colour, and are drawn
  // in one batch (see batching.ts)
  const smooth = 1 - Math.round(roughness * 4) / 4;
  material.shininess = 2 + smooth ** 2 * 120;
  if (metalness >= 0.5) {
    // A metal reflects in its colour, and its own colour darkens
    material.specular.copy(material.color);
    material.color.multiplyScalar(1 - metalness * 0.5);
  } else {
    // Anything else reflects a little white light
    material.specular.setScalar(0.04 + 0.06 * smooth);
  }

  return material;
}

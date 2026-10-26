import * as THREE from 'three';
import type { Quality } from '../../core/settings/quality';

/*
  How detailed the scene being built is. At high quality its models are finer, the metals and the marble reflect the
  room, the lamps cast shadows and the colours go through sRGB and a filmic tone mapping; at low quality all of that is
  left out, for slower devices. The scene sets it before building anything (see `AquariumScene.create`), and the
  builders read it.
*/

/**
 * Whether the scene is being built at high quality.
 */
let high = false;

/**
 * Sets the quality of the scene about to be built: before any of its colours is made, since the colour management
 * converts them when they are made.
 *
 * @param quality - The quality.
 */
export function setQuality(quality: Quality): void {
  high = quality === 'high';
  // At low quality no conversion to and from sRGB in each pixel: the colours and the textures are used as written
  THREE.ColorManagement.enabled = high;
}

/**
 * Whether the scene is being built at high quality.
 *
 * @returns Whether it is.
 */
export function isHigh(): boolean {
  return high;
}

/**
 * A setting of the scene by its quality.
 *
 * @param low - The one at low quality.
 * @param highValue - The one at high quality.
 * @returns The one of the quality being built.
 */
export function detail<T>(low: T, highValue: T): T {
  return high ? highValue : low;
}

/**
 * The colour space of the textures painted on a canvas: sRGB, decoded in each pixel, only at high quality.
 *
 * @returns The colour space.
 */
export function paintedColorSpace(): THREE.ColorSpace {
  return detail(THREE.NoColorSpace, THREE.SRGBColorSpace);
}

import * as THREE from 'three';
import { batchStatic } from './batching';
import { phong } from './materials';

/*
  The board of the rules, hanging on the wall of the lounge in front of the foosball table: a parchment in a gilded
  frame. The rules are not painted on it: the page writes them over the parchment (see `Wall` in scene.ts), only when
  the camera is in front of it.
*/

/**
 * Width and height of the board, frame included.
 */
export const BOARD_WIDTH = 4.4;
export const BOARD_HEIGHT = 3;

/**
 * Width of the gilded frame, and the size of the parchment inside it.
 */
const BORDER = 0.16;
export const PAPER_SIZE = { width: BOARD_WIDTH - BORDER * 2, height: BOARD_HEIGHT - BORDER * 2 };

/**
 * Builds the board, facing +z, its centre at its origin.
 *
 * @returns The board.
 */
export function buildRulesBoard(): THREE.Group {
  const group = new THREE.Group();
  const gold = phong({ color: 0xe8e8e8, metalness: 0.2, roughness: 0.5, flatShading: true });

  // The white frame: four mouldings around the parchment
  for (const [width, height, x, y] of [
    [BOARD_WIDTH, BORDER, 0, BOARD_HEIGHT / 2 - BORDER / 2],
    [BOARD_WIDTH, BORDER, 0, -BOARD_HEIGHT / 2 + BORDER / 2],
    [BORDER, BOARD_HEIGHT, -BOARD_WIDTH / 2 + BORDER / 2, 0],
    [BORDER, BOARD_HEIGHT, BOARD_WIDTH / 2 - BORDER / 2, 0]
  ] as const) {
    const moulding = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.12), gold);
    moulding.position.set(x, y, 0.06);
    group.add(moulding);
  }

  const backing = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.04), phong({ color: 0x111111 }));
  group.add(backing);
  // A plain warm paper: the rules are written over it by the page
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(PAPER_SIZE.width, PAPER_SIZE.height), phong({ color: 0xf1e2bf, roughness: 0.85 }));
  paper.position.z = 0.03;
  group.add(paper);
  batchStatic(group);
  return group;
}

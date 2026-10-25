import * as THREE from 'three';
import { DISPLAY, TEXT } from './fonts';

/*
  The board of the rules, hanging on the wall of the lounge in front of the foosball table: a parchment in a gilded
  frame, with the title and the rules as a bulleted list, painted on a canvas.
*/

/**
 * Width and height of the board, frame included.
 */
export const BOARD_WIDTH = 4.4;
export const BOARD_HEIGHT = 3;

/**
 * Size of the canvas the parchment is painted on: as wide as tall as the board, in pixels.
 */
const CANVAS_WIDTH = 1408;
const CANVAS_HEIGHT = 896;

/**
 * Splits a text into the lines that fit a width.
 *
 * @param ctx - The canvas, with its font set.
 * @param text - The text.
 * @param width - The width, in pixels.
 * @returns The lines.
 */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

/**
 * Paints the parchment: a warm paper with darker edges, the title, a gilded rule under it and the bulleted rules.
 *
 * @param rules - The rules.
 * @returns The texture.
 */
function parchment(rules: readonly string[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const paper = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.2, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.7);
  paper.addColorStop(0, '#f7ecd2');
  paper.addColorStop(0.7, '#ecdbb5');
  paper.addColorStop(1, '#cdb183');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const margin = 90;
  ctx.fillStyle = '#3b2414';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 88px ${DISPLAY}`;
  ctx.fillText('Regolamento', CANVAS_WIDTH / 2, 150);
  ctx.strokeStyle = '#b08d57';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2 - 260, 185);
  ctx.lineTo(CANVAS_WIDTH / 2 + 260, 185);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = `600 50px ${TEXT}`;
  const lineHeight = 56;
  const textLeft = margin + 50;
  const textWidth = CANVAS_WIDTH - textLeft - margin;
  let y = 270;
  for (const rule of rules) {
    // The bullet: a gilded dot
    ctx.fillStyle = '#9a7432';
    ctx.beginPath();
    ctx.arc(margin + 16, y - 15, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b1a0e';
    for (const line of wrap(ctx, rule, textWidth)) {
      ctx.fillText(line, textLeft, y);
      y += lineHeight;
    }

    y += 22;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Builds the board, facing +z, its centre at its origin.
 *
 * @param rules - The rules to write on it.
 * @returns The board.
 */
export function buildRulesBoard(rules: readonly string[]): THREE.Group {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.28, flatShading: true });
  const border = 0.16;

  // The gilded frame: four mouldings around the parchment
  for (const [width, height, x, y] of [
    [BOARD_WIDTH, border, 0, BOARD_HEIGHT / 2 - border / 2],
    [BOARD_WIDTH, border, 0, -BOARD_HEIGHT / 2 + border / 2],
    [border, BOARD_HEIGHT, -BOARD_WIDTH / 2 + border / 2, 0],
    [border, BOARD_HEIGHT, BOARD_WIDTH / 2 - border / 2, 0]
  ] as const) {
    const moulding = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.12), gold);
    moulding.position.set(x, y, 0.06);
    group.add(moulding);
  }

  const backing = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.04), new THREE.MeshStandardMaterial({ color: 0x2b190c }));
  group.add(backing);
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_WIDTH - border * 2, BOARD_HEIGHT - border * 2),
    new THREE.MeshStandardMaterial({ map: parchment(rules), roughness: 0.85, metalness: 0 })
  );
  paper.position.z = 0.03;
  group.add(paper);
  return group;
}

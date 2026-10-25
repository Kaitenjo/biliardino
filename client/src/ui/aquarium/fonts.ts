/*
  The fonts of the writings painted in the 3D scene, loaded by the page (index.html) from Google Fonts. A canvas draws
  with a font only once it is loaded, so the scene waits for them before painting.
*/

/**
 * Roman capitals, as carved in stone or cast in metal: titles, plates, the frieze, the numbers of the medals.
 */
export const DISPLAY = '"Cinzel", Georgia, serif';

/**
 * An elegant serif for the names of the players.
 */
export const NAME = '"Playfair Display", Georgia, serif';

/**
 * A book serif for running text: the rules, the notes under the names.
 */
export const TEXT = '"Cormorant Garamond", Georgia, serif';

/**
 * A tall narrow sans for figures and their labels.
 */
export const FIGURES = '"Oswald", "Arial Narrow", sans-serif';

/**
 * The faces used, as the canvas asks for them.
 */
const FACES = [`700 40px ${DISPLAY}`, `900 40px ${DISPLAY}`, `700 40px ${NAME}`, `600 40px ${TEXT}`, `italic 500 40px ${TEXT}`, `500 40px ${FIGURES}`, `600 40px ${FIGURES}`];

/**
 * Seconds to wait for the fonts at most: on a slow network the scene is painted with the fallbacks rather than late.
 */
const TIMEOUT = 2.5;

/**
 * Loads the fonts of the scene.
 *
 * @returns When they are loaded, or the wait is over.
 */
export function loadFonts(): Promise<void> {
  const loaded = Promise.all(FACES.map(face => document.fonts.load(face))).then(() => undefined);
  const late = new Promise<void>(resolve => setTimeout(resolve, TIMEOUT * 1000));
  return Promise.race([loaded, late]).catch(() => undefined);
}

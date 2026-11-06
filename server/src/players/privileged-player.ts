/**
 * The player with rules of its own, by name: it is put in each lobby as it opens (it can leave like anybody else), it
 * can't be banned and it can't have the Felix rule. Compare it in SQL (`name = ?`): `players.name` is `COLLATE NOCASE`,
 * so the case doesn't count.
 */
export const PRIVILEGED_PLAYER = 'Dario Spinosa';

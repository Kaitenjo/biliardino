/**
 * A team of a match.
 */
export type Team = 'brown' | 'white';

/**
 * The role of a player in a match.
 */
export type Role = 'attack' | 'defense';

/**
 * A player as shown in lists and matches.
 */
export interface PlayerSummary {
  /**
   * Id of the player.
   */
  id: number;
  /**
   * Name of the player.
   */
  name: string;
  /**
   * Icon of the player: an emoji or the URL of an image.
   */
  icon: string;
  /**
   * Current ELO.
   */
  elo: number;
}

/**
 * The logged user: the player it belongs to.
 */
export interface AuthUser {
  /**
   * Id of the user.
   */
  id: number;
  /**
   * Id of the player of the user.
   */
  playerId: number;
  /**
   * Name of the player.
   */
  name: string;
  /**
   * Icon of the player.
   */
  icon: string;
  /**
   * Whether it is the super admin: the only one, who can change the roles of anybody without limits.
   */
  isAdmin: boolean;
}

/**
 * The two players of a team, by role.
 */
export interface Lineup<TPlayer> {
  /**
   * The player in attack.
   */
  attack: TPlayer;
  /**
   * The player in defense.
   */
  defense: TPlayer;
}

import { computed, signal } from '@xaendar/core/signals';

/**
 * The pages of the application.
 */
export type RouteName = 'home' | 'player' | 'new-match' | 'availability' | 'roles' | 'login' | 'profile' | 'not-found';

/**
 * The route currently displayed.
 */
export interface Route {
  /**
   * The page.
   */
  name: RouteName;
  /**
   * The id of the player, for the `player` page.
   */
  playerId?: number;
}

/**
 * Pages that need a login.
 */
const PROTECTED_ROUTES: ReadonlySet<RouteName> = new Set(['new-match', 'availability', 'roles', 'profile']);

/**
 * Reads the route from a location hash: `#/`, `#/players/3`, `#/new-match`, `#/availability`, `#/login`, `#/profile`.
 *
 * @param value - The hash.
 * @returns The route.
 */
function parseRoute(value: string): Route {
  const segments = value.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (segments[0]) {
    case undefined:
      return { name: 'home' };
    case 'players': {
      const playerId = Number(segments[1]);
      return Number.isInteger(playerId) && segments.length === 2 ? { name: 'player', playerId } : { name: 'not-found' };
    }
    case 'new-match':
    case 'availability':
    case 'roles':
    case 'login':
    case 'profile':
      return segments.length === 1 ? { name: segments[0] } : { name: 'not-found' };
    default:
      return { name: 'not-found' };
  }
}

/**
 * The current location hash: the whole state of the router derives from it.
 */
const hash = signal(location.hash);

window.addEventListener('hashchange', () => {
  hash.set(location.hash);
  window.scrollTo({ top: 0 });
});

/**
 * The route currently displayed.
 */
export const route = computed(() => parseRoute(hash()));

/**
 * The name of the page currently displayed.
 */
export const routeName = computed(() => route().name);

/**
 * Whether the page currently displayed needs a login.
 */
export const isProtectedRoute = computed(() => PROTECTED_ROUTES.has(routeName()));

/**
 * Displays a page.
 *
 * @param path - The path of the page, e.g. `/players/3`.
 */
export function navigate(path: string): void {
  location.hash = path;
}

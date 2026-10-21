import { CustomElement, WebComponent } from '@xaendar/core';
import { signal } from '@xaendar/core/signals';
import { fetchLeaderboard } from '../../core/api/api';
import type { LeaderboardEntry } from '../../core/api/api.models';
import { login } from '../../core/auth/auth';
import { navigate, routeName } from '../../core/router/router';

/**
 * The login form: the player is picked from a list, then the password is typed. Shown also in place of the pages
 * needing a login, which appear as soon as the user logs in.
 */
@WebComponent({
  selector: 'page-login',
  styleUrl: './login.xd.component.scss',
  templateUrl: './login.xd.component.html'
})
export class LoginPage extends CustomElement {
  /**
   * The players, by name.
   */
  public readonly players = signal<LeaderboardEntry[]>([]);
  /**
   * Whether the login is in progress.
   */
  public readonly busy = signal(false);
  /**
   * The error to show, `''` when there is none.
   */
  public readonly error = signal('');

  /**
   * Loads the players to pick from.
   */
  public onInit(): void {
    this._loadPlayers();
  }

  /**
   * Logs in. From the login page it goes to the home page; in place of another page, that page appears.
   *
   * @param event - The submission of the form.
   * @param name - The name of the player.
   * @param password - The password.
   */
  public async submit(event: SubmitEvent, name: string, password: string): Promise<void> {
    event.preventDefault();
    if (!name || !password) {
      this.error.set('Scegli il giocatore e inserisci la password');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      await login(name, password);
      if (routeName() === 'login') {
        navigate('/');
      }
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Loads the players, by name.
   */
  private async _loadPlayers(): Promise<void> {
    try {
      const players = await fetchLeaderboard();
      this.players.set(players.sort((first, second) => first.name.localeCompare(second.name)));
    } catch (error) {
      this.error.set((error as Error).message);
    }
  }
}

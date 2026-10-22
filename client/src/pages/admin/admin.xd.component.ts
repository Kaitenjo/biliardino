import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal } from '@xaendar/core/signals';
import { fetchAdminRoles, postRecompute, putAdminRoles } from '../../core/api/api';
import type { AdminPlayer, Role } from '../../core/api/api.models';

/**
 * The page of the super admin: the roles of every player, changed with no limit of once a day (a tap on a switch is
 * saved at once), and the recomputation of the ELOs after a manual change to the database.
 */
@WebComponent({
  selector: 'page-admin',
  styleUrl: './admin.xd.component.scss',
  templateUrl: './admin.xd.component.html'
})
export class AdminPage extends CustomElement {
  /**
   * Every player with its roles.
   */
  public readonly players = signal<AdminPlayer[]>([]);
  /**
   * Whether the players are loading.
   */
  public readonly loading = signal(true);
  /**
   * The error to show, `''` when there is none.
   */
  public readonly error = signal('');
  /**
   * The text typed in the search field.
   */
  public readonly query = signal('');
  /**
   * The players being saved, by id.
   */
  public readonly saving = signal<ReadonlySet<number>>(new Set());
  /**
   * Whether the ELOs are being recomputed.
   */
  public readonly recomputing = signal(false);
  /**
   * Whether the ELOs were recomputed, since the page opened.
   */
  public readonly recomputed = signal(false);
  /**
   * The players shown, filtered by the search.
   */
  public readonly rows = computed(() => this._computeRows());

  /**
   * Loads the players.
   */
  public onInit(): void {
    this._load();
  }

  /**
   * Filters the players by name.
   *
   * @param event - The input of the search field.
   */
  public search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /**
   * Whether a player is being saved.
   *
   * @param id - The id of the player.
   * @returns Whether it is.
   */
  public isSaving(id: number): boolean {
    return this.saving().has(id);
  }

  /**
   * Turns a role of a player on or off. The change is shown at once; if the server refuses, it goes back.
   *
   * @param player - The player.
   * @param role - The role.
   */
  public async toggle(player: AdminPlayer, role: Role): Promise<void> {
    if (this.isSaving(player.id)) {
      return;
    }

    const next = { attack: role === 'attack' ? !player.attack : player.attack, defense: role === 'defense' ? !player.defense : player.defense };
    if (!next.attack && !next.defense) {
      this.error.set(`${player.name} deve giocare almeno un ruolo`);
      return;
    }

    this.error.set('');
    this._setRoles(player.id, next);
    this.saving.update(saving => new Set(saving).add(player.id));
    try {
      this._setRoles(player.id, await putAdminRoles(player.id, next));
    } catch (error) {
      this._setRoles(player.id, { attack: player.attack, defense: player.defense });
      this.error.set((error as Error).message);
    } finally {
      this.saving.update(saving => {
        const remaining = new Set(saving);
        remaining.delete(player.id);
        return remaining;
      });
    }
  }

  /**
   * Rebuilds every ELO and statistic from the matches.
   */
  public async recompute(): Promise<void> {
    this.error.set('');
    this.recomputed.set(false);
    this.recomputing.set(true);
    try {
      await postRecompute();
      this.recomputed.set(true);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.recomputing.set(false);
    }
  }

  /**
   * Loads the players.
   */
  private async _load(): Promise<void> {
    try {
      this.players.set(await fetchAdminRoles());
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Replaces the roles of a player.
   *
   * @param id - The id of the player.
   * @param roles - Its roles.
   */
  private _setRoles(id: number, roles: { attack: boolean; defense: boolean }): void {
    this.players.update(players => players.map(player => (player.id === id ? { ...player, attack: roles.attack, defense: roles.defense } : player)));
  }

  /**
   * Computes the value of `rows`.
   *
   * @returns The players shown.
   */
  private _computeRows(): AdminPlayer[] {
    const query = this.query().trim().toLowerCase();
    return this.players().filter(player => !query || player.name.toLowerCase().includes(query));
  }
}

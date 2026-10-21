import { CustomElement, WebComponent } from '@xaendar/core';
import { computed, signal } from '@xaendar/core/signals';
import { fetchRoles, putRoles } from '../../core/api/api';
import type { Lineup, Role, UserRoles } from '../../core/api/api.models';
import { changePassword } from '../../core/auth/auth';

/**
 * The profile of the logged user: its player, the roles it plays and the change of the password.
 */
@WebComponent({
  selector: 'page-profile',
  styleUrl: './profile.xd.component.scss',
  templateUrl: './profile.xd.component.html'
})
export class ProfilePage extends CustomElement {
  /**
   * Whether the change is in progress.
   */
  public readonly busy = signal(false);
  /**
   * The error to show, `''` when there is none.
   */
  public readonly error = signal('');
  /**
   * Whether the password was just changed.
   */
  public readonly changed = signal(false);
  /**
   * The roles the user plays, `null` until they are loaded.
   */
  public readonly roles = signal<UserRoles | null>(null);
  /**
   * The roles chosen with the switches, not saved yet.
   */
  public readonly draft = signal<Lineup<boolean> | null>(null);
  /**
   * Whether the draft differs from the saved roles, so that there is something to confirm.
   */
  public readonly canConfirm = computed(() => this._computeCanConfirm());
  /**
   * Whether the roles are being saved.
   */
  public readonly savingRoles = signal(false);
  /**
   * The error of the roles, `''` when there is none.
   */
  public readonly rolesError = signal('');

  /**
   * Minimum length of a new password, as checked by the server.
   */
  private readonly _minPasswordLength = 4;

  /**
   * Loads the roles the user plays.
   */
  public onInit(): void {
    this._loadRoles();
  }

  /**
   * Whether the draft has a role.
   *
   * @param role - The role.
   * @returns Whether it is on in the draft.
   */
  public plays(role: Role): boolean {
    return this.draft()?.[role] ?? false;
  }

  /**
   * Turns a role on or off in the draft, which is saved only when the user confirms it.
   *
   * @param role - The role.
   */
  public toggleRole(role: Role): void {
    const draft = this.draft();
    if (!draft || this.roles()?.locked || this.savingRoles()) {
      return;
    }

    this.rolesError.set('');
    this.draft.set(role === 'attack' ? { attack: !draft.attack, defense: draft.defense } : { attack: draft.attack, defense: !draft.defense });
  }

  /**
   * Saves the roles of the draft. They can change once a day, so the day is used up: the server refuses a second change
   * until tomorrow.
   */
  public async confirmRoles(): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.canConfirm()) {
      return;
    }

    if (!draft.attack && !draft.defense) {
      this.rolesError.set('Devi giocare almeno un ruolo');
      return;
    }

    this.savingRoles.set(true);
    this.rolesError.set('');
    try {
      const saved = await putRoles(draft);
      this.roles.set(saved);
      this.draft.set({ attack: saved.attack, defense: saved.defense });
    } catch (error) {
      this.rolesError.set((error as Error).message);
    } finally {
      this.savingRoles.set(false);
    }
  }

  /**
   * Drops the changes of the draft.
   */
  public cancelRoles(): void {
    const roles = this.roles();
    if (roles) {
      this.draft.set({ attack: roles.attack, defense: roles.defense });
      this.rolesError.set('');
    }
  }

  /**
   * Changes the password, and clears the form.
   *
   * @param event - The submission of the form.
   * @param form - The form.
   * @param currentPassword - The current password.
   * @param newPassword - The new password.
   * @param confirmation - The new password, typed again.
   */
  public async submit(event: SubmitEvent, form: HTMLFormElement, currentPassword: string, newPassword: string, confirmation: string): Promise<void> {
    event.preventDefault();
    this.changed.set(false);
    if (newPassword.length < this._minPasswordLength) {
      this.error.set(`La nuova password deve avere almeno ${this._minPasswordLength} caratteri`);
      return;
    }

    if (newPassword !== confirmation) {
      this.error.set('Le due password non coincidono');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      await changePassword(currentPassword, newPassword);
      form.reset();
      this.changed.set(true);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Loads the roles the user plays.
   */
  private async _loadRoles(): Promise<void> {
    try {
      const roles = await fetchRoles();
      this.roles.set(roles);
      this.draft.set({ attack: roles.attack, defense: roles.defense });
    } catch (error) {
      this.rolesError.set((error as Error).message);
    }
  }

  /**
   * Computes the value of `canConfirm`.
   *
   * @returns Whether the draft differs from the saved roles and the roles can still change today.
   */
  private _computeCanConfirm(): boolean {
    const roles = this.roles();
    const draft = this.draft();
    return Boolean(roles && draft && !roles.locked && (roles.attack !== draft.attack || roles.defense !== draft.defense));
  }
}

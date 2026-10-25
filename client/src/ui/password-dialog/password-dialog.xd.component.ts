import { CustomElement, Query, WebComponent } from '@xaendar/core';
import { signal } from '@xaendar/core/signals';
import type { QuerySignal } from '@xaendar/core/signals';
import { changePassword } from '../../core/auth/auth';

/**
 * The modal to change the password of the logged user, opened from the menu of the user with `open()`.
 */
@WebComponent({
  selector: 'password-dialog',
  styleUrl: './password-dialog.xd.component.scss',
  templateUrl: './password-dialog.xd.component.html'
})
export class PasswordDialogComponent extends CustomElement {
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
   * The modal.
   */
  @Query.required('dialog')
  public accessor dialog!: QuerySignal<HTMLDialogElement>;

  /**
   * Minimum length of a new password, as checked by the server.
   */
  private readonly _minPasswordLength = 4;

  /**
   * Opens the modal, with an empty form.
   */
  public open(): void {
    this.error.set('');
    this.changed.set(false);
    this.dialog().showModal();
  }

  /**
   * Closes the modal.
   */
  public close(): void {
    this.dialog().close();
  }

  /**
   * Closes the modal on a click on its backdrop, which the browser reports as a click on the modal itself.
   *
   * @param event - The click.
   */
  public onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()) {
      this.close();
    }
  }

  /**
   * Clears the form when the modal closes, however it was closed (button, backdrop, Escape).
   *
   * @param form - The form.
   */
  public onClosed(form: HTMLFormElement): void {
    form.reset();
    this.error.set('');
    this.changed.set(false);
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
}

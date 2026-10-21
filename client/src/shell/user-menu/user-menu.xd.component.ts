import { CustomElement, WebComponent } from '@xaendar/core';
import { signal } from '@xaendar/core/signals';
import { logout } from '../../core/auth/auth';
import { isProtectedRoute, navigate } from '../../core/router/router';

/**
 * The dropdown of the logged user: its icon, opening the links to the profile and the logout.
 */
@WebComponent({
  selector: 'user-menu',
  styleUrl: './user-menu.xd.component.scss',
  templateUrl: './user-menu.xd.component.html'
})
export class UserMenuComponent extends CustomElement {
  /**
   * Whether the dropdown is open.
   */
  public readonly expanded = signal(false);

  /**
   * Closes the dropdown on a click outside of it.
   *
   * @param event - The click.
   */
  private readonly _onDocumentClick = (event: MouseEvent): void => {
    if (!event.composedPath().includes(this)) {
      this.expanded.set(false);
    }
  };
  /**
   * Closes the dropdown on Escape.
   *
   * @param event - The key pressed.
   */
  private readonly _onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.expanded.set(false);
    }
  };

  /**
   * Starts listening to the clicks and keys outside of the dropdown.
   */
  public onInit(): void {
    document.addEventListener('click', this._onDocumentClick);
    document.addEventListener('keydown', this._onDocumentKeydown);
  }

  /**
   * Opens or closes the dropdown.
   */
  public toggle(): void {
    this.expanded.update(expanded => !expanded);
  }

  /**
   * Closes the dropdown.
   */
  public close(): void {
    this.expanded.set(false);
  }

  /**
   * Logs out, leaving the pages that need a login.
   */
  public async logOut(): Promise<void> {
    this.expanded.set(false);
    await logout();
    if (isProtectedRoute()) {
      navigate('/');
    }
  }

  /**
   * Stops listening to the document.
   */
  public onDestroy(): void {
    document.removeEventListener('click', this._onDocumentClick);
    document.removeEventListener('keydown', this._onDocumentKeydown);
  }
}

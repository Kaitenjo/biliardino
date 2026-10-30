import { CustomElement, WebComponent } from '@xaendar/core';
import { signal } from '@xaendar/core/signals';
import { disablePush, enablePush, pushEnabled, pushSupported, syncPush } from '../../core/notifications/push';

/**
 * How long the reason of a failure stays visible, in milliseconds.
 */
const ERROR_MS = 6000;

/**
 * The small round button of the top bar that turns the notifications of this browser on (green) or off. Shown only to
 * a logged user, in a browser that supports them.
 */
@WebComponent({
  selector: 'push-toggle',
  styleUrl: './push-toggle.xd.component.scss',
  templateUrl: './push-toggle.xd.component.html'
})
export class PushToggleComponent extends CustomElement {
  /**
   * Whether this browser can receive the notifications.
   */
  public readonly pushSupported = pushSupported;
  /**
   * Whether the user receives the notifications in this browser.
   */
  public readonly pushEnabled = pushEnabled;
  /**
   * Whether the notifications are being turned on or off.
   */
  public readonly busy = signal(false);
  /**
   * Why the notifications couldn't be turned on, `''` when nothing failed.
   */
  public readonly error = signal('');

  /**
   * The timer that hides the error.
   */
  private _errorTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Reads whether this browser is subscribed: the button exists only with a logged user, so the browser is now its own.
   */
  public onInit(): void {
    syncPush();
  }

  /**
   * Turns the notifications of this browser on or off.
   */
  public async toggle(): Promise<void> {
    this._showError('');
    this.busy.set(true);
    try {
      await (pushEnabled() ? disablePush() : enablePush());
    } catch (error) {
      this._showError(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Stops the timer of the error.
   */
  public onDestroy(): void {
    if (this._errorTimer !== null) {
      clearTimeout(this._errorTimer);
    }
  }

  /**
   * Shows the reason of a failure for a few seconds.
   *
   * @param message - The reason, `''` to hide it.
   */
  private _showError(message: string): void {
    if (this._errorTimer !== null) {
      clearTimeout(this._errorTimer);
      this._errorTimer = null;
    }

    this.error.set(message);
    if (message) {
      this._errorTimer = setTimeout(() => this.error.set(''), ERROR_MS);
    }
  }
}

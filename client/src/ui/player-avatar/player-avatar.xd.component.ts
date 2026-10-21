import { CustomElement, HostProperty, Property, WebComponent } from '@xaendar/core';
import { computed, signal, untracked } from '@xaendar/core/signals';
import type { InputSignal } from '@xaendar/core/signals';

/**
 * The icon of a player: its avatar when the icon is a URL, an emoji otherwise, a silhouette when it has none or the
 * image cannot be loaded.
 */
@WebComponent({
  selector: 'player-avatar',
  styleUrl: './player-avatar.xd.component.scss',
  templateUrl: './player-avatar.xd.component.html'
})
export class PlayerAvatarComponent extends CustomElement {
  /**
   * The icon: the URL of an image, an emoji, or `''`.
   */
  @Property('')
  public accessor icon!: InputSignal<string>;
  /**
   * The name of the player, read by screen readers.
   */
  @Property('')
  public accessor label!: InputSignal<string>;
  /**
   * The size: `sm`, `md`, `lg` or `xl`.
   */
  @HostProperty('data-size')
  @Property('md')
  public accessor size!: InputSignal<string>;
  /**
   * Whether the image of the icon failed to load.
   */
  public readonly failed = signal(false);
  /**
   * What to show: the image, the emoji or the silhouette.
   */
  public readonly kind = computed(() => this._computeKind());

  /**
   * Tries the image again whenever the icon changes.
   */
  public onInit(): void {
    this.effect(() => {
      this.icon();
      untracked(() => this.failed.set(false));
    });
  }

  /**
   * Falls back to the silhouette.
   */
  public fail(): void {
    this.failed.set(true);
  }

  /**
   * Computes the value of `kind`.
   *
   * @returns `image`, `emoji` or `silhouette`.
   */
  private _computeKind(): 'image' | 'emoji' | 'silhouette' {
    const icon = this.icon();
    if (!icon) {
      return 'silhouette';
    }

    if (/^(https?:|data:|\/)/.test(icon)) {
      return this.failed() ? 'silhouette' : 'image';
    }

    return 'emoji';
  }
}

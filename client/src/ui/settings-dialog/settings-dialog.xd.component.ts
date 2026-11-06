import { CustomElement, Query, WebComponent } from '@xaendar/core';
import { computed } from '@xaendar/core/signals';
import type { QuerySignal } from '@xaendar/core/signals';
import { cameraTransitions, setCameraTransitions } from '../../core/settings/camera';
import { pinification, setPinification } from '../../core/settings/pinification';
import { quality, setQuality } from '../../core/settings/quality';
import { purpleToy, setPurpleToy } from '../../core/settings/toy';

/**
 * The modal with the settings of this device: the quality of the 3D scene, the travel of its camera, whether the
 * purple dildo floats in the aquarium of the lobby and the pinification of its fish. Opened from the menu of the user
 * with `open()`.
 */
@WebComponent({
  selector: 'settings-dialog',
  styleUrl: './settings-dialog.xd.component.scss',
  templateUrl: './settings-dialog.xd.component.html'
})
export class SettingsDialogComponent extends CustomElement {
  /**
   * Whether the scene is drawn at high quality.
   */
  public readonly high = computed(() => quality() === 'high');
  /**
   * Whether the camera travels between the places of the scene.
   */
  public readonly transitions = cameraTransitions;
  /**
   * Whether the purple dildo floats in the aquarium.
   */
  public readonly toy = purpleToy;
  /**
   * Whether the pinification is on: every creature of the aquarium is a penis, as big as the ELO of its player.
   */
  public readonly pinification = pinification;

  /**
   * The modal.
   */
  @Query.required('dialog')
  public accessor dialog!: QuerySignal<HTMLDialogElement>;

  /**
   * Opens the modal.
   */
  public open(): void {
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
   * Switches to the other quality.
   */
  public toggleQuality(): void {
    setQuality(this.high() ? 'low' : 'high');
  }

  /**
   * Switches the travel of the camera on or off.
   */
  public toggleTransitions(): void {
    setCameraTransitions(!this.transitions());
  }

  /**
   * Shows or hides the purple dildo.
   */
  public toggleToy(): void {
    setPurpleToy(!this.toy());
  }

  /**
   * Turns the pinification on or off.
   */
  public togglePinification(): void {
    setPinification(!this.pinification());
  }
}

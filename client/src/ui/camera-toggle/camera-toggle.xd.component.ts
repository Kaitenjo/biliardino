import { CustomElement, WebComponent } from '@xaendar/core';
import { cameraTransitions, setCameraTransitions } from '../../core/settings/camera';

/**
 * The small round button of the top bar that turns on or off the travel of the camera between the places of the 3D
 * scene on this device: off, it jumps to the next place at once.
 */
@WebComponent({
  selector: 'camera-toggle',
  styleUrl: './camera-toggle.xd.component.scss',
  templateUrl: './camera-toggle.xd.component.html'
})
export class CameraToggleComponent extends CustomElement {
  /**
   * Whether the camera travels.
   */
  public readonly on = cameraTransitions;

  /**
   * Switches to the other choice.
   */
  public toggle(): void {
    setCameraTransitions(!this.on());
  }
}

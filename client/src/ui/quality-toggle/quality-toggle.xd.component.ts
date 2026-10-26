import { CustomElement, WebComponent } from '@xaendar/core';
import { computed } from '@xaendar/core/signals';
import { quality, setQuality } from '../../core/settings/quality';

/**
 * The small round button of the top bar that switches the quality of the 3D scene on this device: low (the default,
 * without what only decorates it) or high (gold).
 */
@WebComponent({
  selector: 'quality-toggle',
  styleUrl: './quality-toggle.xd.component.scss',
  templateUrl: './quality-toggle.xd.component.html'
})
export class QualityToggleComponent extends CustomElement {
  /**
   * Whether the scene is drawn at high quality.
   */
  public readonly high = computed(() => quality() === 'high');

  /**
   * Switches to the other quality.
   */
  public toggle(): void {
    setQuality(this.high() ? 'low' : 'high');
  }
}

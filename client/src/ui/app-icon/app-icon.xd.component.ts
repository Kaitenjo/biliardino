import { CustomElement, HostProperty, Property, WebComponent } from '@xaendar/core';
import type { InputSignal } from '@xaendar/core/signals';

/**
 * An icon of the application: an inline SVG as big as the text around it, in its colour.
 *
 * Names: `trophy`, `play`, `calendar`, `defense`, `attack`, `balanced`, `medal`, `goal`, `star`, `zap`, `book`,
 * `close`, `save`, `dice`, `arrow-left`, `arrow-right`, `trend`, `users`, `award`, `history`, `flame`, `ball`, `user`,
 * `logout`, `check`, `check-circle`, `hd`.
 */
@WebComponent({
  selector: 'app-icon',
  styleUrl: './app-icon.xd.component.scss',
  templateUrl: './app-icon.xd.component.html'
})
export class AppIconComponent extends CustomElement {
  /**
   * The name of the icon.
   */
  @HostProperty('data-name')
  @Property('')
  public accessor name!: InputSignal<string>;
}

import { CustomElement, Query, WebComponent } from '@xaendar/core';
import { QuerySignal, signal } from '@xaendar/core/signals';

/**
 * The header of every page: the navigation and, on the right, the login button or
 * the dropdown of the logged user.
 */
@WebComponent({
  selector: 'app-header',
  styleUrl: './app-header.xd.component.scss',
  templateUrl: './app-header.xd.component.html'
})
export class AppHeaderComponent extends CustomElement {

  public showLabels = signal(true);

  @Query.required('nav')
  public accessor navElement!: QuerySignal<HTMLElement>

  /**
   * How wide the links are with their names, measured while they are shown: the names are shown only when they fit.
   */
  private _labelledWidth = 0;

  private readonly _resizeObserver = new ResizeObserver(() => {
    const nav = this.navElement();
    if (this.showLabels()) {
      this._labelledWidth = nav.scrollWidth;
    }

    this.showLabels.set(nav.clientWidth >= this._labelledWidth);
  });

  public afterRender(): void {
    this._resizeObserver.observe(this.navElement());
  }

  public onDestroy(): void {
    this._resizeObserver.disconnect();
  }
}

import { CustomElement, Query, WebComponent } from '@xaendar/core';
import { QuerySignal, signal } from '@xaendar/core/signals';

/**
 * The header of every page: the name of the application, the navigation and, on the right, the login button or
 * the dropdown of the logged user.
 */
@WebComponent({
  selector: 'app-header',
  styleUrl: './app-header.xd.component.scss',
  templateUrl: './app-header.xd.component.html'
})
export class AppHeaderComponent extends CustomElement {

  public showIcon = signal(true);

  @Query.required('nav')
  public accessor navElement!: QuerySignal<HTMLElement>

  private _resizeObserver = new ResizeObserver(entries => this.showIcon.set(entries![0]!.contentRect.width > 386));

  public afterRender(): void {
    this._resizeObserver.observe(this.navElement());
  }

  public onDestroy(): void {
    this._resizeObserver.disconnect();
  }
}

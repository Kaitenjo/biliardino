import { CustomElement, WebComponent } from '@xaendar/core';

/**
 * Renders the page of the current route. The pages needing a login show the login form until the user logs in.
 */
@WebComponent({
  selector: 'app-outlet',
  templateUrl: './app-outlet.xd.component.html'
})
export class AppOutletComponent extends CustomElement {}

import { CustomElement, WebComponent } from '@xaendar/core';

/**
 * The application: the header, and the page of the current route below it.
 */
@WebComponent({
  selector: 'biliardino-root',
  styleUrl: './biliardino-root.xd.component.scss',
  templateUrl: './biliardino-root.xd.component.html'
})
export class BiliardinoRootComponent extends CustomElement {}

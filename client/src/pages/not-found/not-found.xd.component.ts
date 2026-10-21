import { CustomElement, WebComponent } from '@xaendar/core';

/**
 * The page shown for an unknown route.
 */
@WebComponent({
  selector: 'page-not-found',
  styleUrl: './not-found.xd.component.scss',
  templateUrl: './not-found.xd.component.html'
})
export class NotFoundPage extends CustomElement {}

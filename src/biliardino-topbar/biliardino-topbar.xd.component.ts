import { BaseWebComponent, WebComponent } from '@xaendar/core';

type Page = {
  title: string;
  route: string;
};

@WebComponent({
  selector: 'biliardino-topbar',
  styleUrl: './biliardino-topbar.xd.component.css',
  templateUrl: './biliardino-topbar.xd.component.html'
})
export class BiliardinoTopbarComponent extends BaseWebComponent {
  public readonly pages: Page[] = [
    { title: 'Home', route: '/' },
    { title: 'Profile', route: '/profile' },
    { title: 'Rules', route: '/rules' }
  ];
}
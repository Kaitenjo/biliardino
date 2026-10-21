import { describe, expect, it } from 'vitest';
import { BiliardinoRootComponent } from './biliardino-root.xd.component';

describe('BiliardinoRootComponent', () => {
  it('renders the header and the outlet', () => {
    const element = document.createElement('biliardino-root');
    document.body.append(element);

    expect(element).toBeInstanceOf(BiliardinoRootComponent);
    expect(element.shadowRoot?.querySelector('app-header')).not.toBeNull();
    expect(element.shadowRoot?.querySelector('main app-outlet')).not.toBeNull();
    element.remove();
  });
});

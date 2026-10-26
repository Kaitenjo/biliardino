import { describe, expect, it } from 'vitest';
import { quality, setQuality } from '../../core/settings/quality';
import { QualityToggleComponent } from './quality-toggle.xd.component';

describe('QualityToggleComponent', () => {
  it('switches the quality of the scene, low by default', async () => {
    setQuality('low');
    const element = document.createElement('quality-toggle');
    document.body.append(element);
    await Promise.resolve();

    expect(element).toBeInstanceOf(QualityToggleComponent);
    const button = element.shadowRoot!.querySelector('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    expect(quality()).toBe('high');
    expect(localStorage.getItem('biliardino-quality')).toBe('high');

    button.click();
    expect(quality()).toBe('low');
    element.remove();
  });
});

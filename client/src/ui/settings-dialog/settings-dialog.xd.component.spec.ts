import { describe, expect, it } from 'vitest';
import { cameraTransitions, setCameraTransitions } from '../../core/settings/camera';
import { quality, setQuality } from '../../core/settings/quality';
import { SettingsDialogComponent } from './settings-dialog.xd.component';

describe('SettingsDialogComponent', () => {
  it('switches the quality of the scene and the travel of the camera', async () => {
    setQuality('low');
    setCameraTransitions(true);
    const element = document.createElement('settings-dialog');
    document.body.append(element);
    await Promise.resolve();

    expect(element).toBeInstanceOf(SettingsDialogComponent);
    const [qualitySwitch, cameraSwitch] = element.shadowRoot!.querySelectorAll<HTMLInputElement>('input');

    qualitySwitch.click();
    expect(quality()).toBe('high');
    expect(localStorage.getItem('biliardino-quality')).toBe('high');

    cameraSwitch.click();
    expect(cameraTransitions()).toBe(false);
    element.remove();
  });
});

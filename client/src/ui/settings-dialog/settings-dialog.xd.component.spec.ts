import { describe, expect, it } from 'vitest';
import { cameraTransitions, setCameraTransitions } from '../../core/settings/camera';
import { penisFish, setPenisFish } from '../../core/settings/penis-fish';
import { quality, setQuality } from '../../core/settings/quality';
import { purpleToy, setPurpleToy } from '../../core/settings/toy';
import { SettingsDialogComponent } from './settings-dialog.xd.component';

describe('SettingsDialogComponent', () => {
  it('switches the quality of the scene, the travel of the camera, the purple dildo and the penises', async () => {
    setQuality('low');
    setCameraTransitions(true);
    setPurpleToy(false);
    setPenisFish(false);
    const element = document.createElement('settings-dialog');
    document.body.append(element);
    await Promise.resolve();

    expect(element).toBeInstanceOf(SettingsDialogComponent);
    const [qualitySwitch, cameraSwitch, toySwitch, penisSwitch] = element.shadowRoot!.querySelectorAll<HTMLInputElement>('input');

    qualitySwitch.click();
    expect(quality()).toBe('high');
    expect(localStorage.getItem('biliardino-quality')).toBe('high');

    cameraSwitch.click();
    expect(cameraTransitions()).toBe(false);

    toySwitch.click();
    expect(purpleToy()).toBe(true);
    expect(localStorage.getItem('biliardino-purple-toy')).toBe('on');
    // Independent of the purple dildo
    expect(penisFish()).toBe(false);

    penisSwitch.click();
    expect(penisFish()).toBe(true);
    expect(localStorage.getItem('biliardino-penis-fish')).toBe('on');
    expect(purpleToy()).toBe(true);
    element.remove();
  });
});

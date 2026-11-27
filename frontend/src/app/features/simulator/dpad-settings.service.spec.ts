import { DpadSettings, DPAD_STORAGE_KEY } from './dpad-settings.service';

describe('ajuste de cruceta', () => {
  beforeEach(() => localStorage.removeItem(DPAD_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(DPAD_STORAGE_KEY));
  it('empieza apagada y recuerda la elección', () => {
    const settings = new DpadSettings();
    expect(settings.visible()).toBe(false);
    settings.toggle();
    expect(settings.visible()).toBe(true);
    expect(new DpadSettings().visible()).toBe(true);
    settings.toggle();
    expect(new DpadSettings().visible()).toBe(false);
  });
});

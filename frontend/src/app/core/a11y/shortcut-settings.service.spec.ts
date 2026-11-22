import { TestBed } from '@angular/core/testing';

import { SHORTCUTS_STORAGE_KEY, ShortcutSettings } from './shortcut-settings.service';

/**
 * «Atajos de una tecla» (plan visual F6-10; H-07; WCAG 2.1.4 Atajos con teclas de caracteres; VD-18): activos por
 * defecto y se pueden apagar. El ajuste se recuerda en el navegador (por dispositivo) y un almacenamiento bloqueado
 * nunca rompe el juego: vale el valor por defecto.
 */
// req: BLOQUE-H (H-07), RNF-04, WCAG 2.1.4
describe('ShortcutSettings', () => {
  const create = () => {
    TestBed.resetTestingModule();
    return TestBed.inject(ShortcutSettings);
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('por defecto están activos (VD-18)', () => {
    expect(create().enabled()).toBe(true);
  });

  it('al apagarlos se recuerda y la siguiente visita los encuentra apagados', () => {
    const first = create();
    first.set(false);
    expect(first.enabled()).toBe(false);
    expect(localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe('off');
    expect(create().enabled()).toBe(false);
  });

  it('alternar los apaga y los vuelve a encender', () => {
    const settings = create();
    settings.toggle();
    expect(settings.enabled()).toBe(false);
    settings.toggle();
    expect(settings.enabled()).toBe(true);
    expect(localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe('on');
  });

  it('un almacenamiento que lanza al leer deja el valor por defecto, sin error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError'); });
    expect(() => create()).not.toThrow();
    expect(create().enabled()).toBe(true);
  });

  it('un almacenamiento que lanza al guardar conserva el cambio durante la sesión', () => {
    const settings = create();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('lleno', 'QuotaExceededError'); });
    expect(() => settings.set(false)).not.toThrow();
    expect(settings.enabled()).toBe(false);
  });

  it('un valor guardado desconocido cuenta como activo', () => {
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, 'quizás');
    expect(create().enabled()).toBe(true);
  });
});

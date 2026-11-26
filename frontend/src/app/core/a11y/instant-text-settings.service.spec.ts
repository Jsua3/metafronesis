import { TestBed } from '@angular/core/testing';

import { INSTANT_TEXT_STORAGE_KEY, InstantTextSettings } from './instant-text-settings.service';

/**
 * «Texto instantáneo» (P8): apagado por defecto, se recuerda en el navegador y un almacenamiento bloqueado nunca rompe
 * el juego.
 */
describe('InstantTextSettings', () => {
  const create = () => {
    TestBed.resetTestingModule();
    return TestBed.inject(InstantTextSettings);
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('por defecto está apagado: la máquina de escribir es parte del juego', () => {
    expect(create().enabled()).toBe(false);
  });

  it('al encenderlo se recuerda y la siguiente visita lo encuentra encendido', () => {
    const first = create();
    first.set(true);
    expect(first.enabled()).toBe(true);
    expect(localStorage.getItem(INSTANT_TEXT_STORAGE_KEY)).toBe('on');
    expect(create().enabled()).toBe(true);
  });

  it('alternar lo enciende y lo apaga', () => {
    const settings = create();
    settings.toggle();
    expect(settings.enabled()).toBe(true);
    settings.toggle();
    expect(settings.enabled()).toBe(false);
    expect(localStorage.getItem(INSTANT_TEXT_STORAGE_KEY)).toBe('off');
  });

  it('un valor guardado raro vale por defecto', () => {
    localStorage.setItem(INSTANT_TEXT_STORAGE_KEY, 'tal vez');
    expect(create().enabled()).toBe(false);
  });

  it('un almacenamiento que lanza al leer deja el valor por defecto, sin error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError'); });
    expect(() => create()).not.toThrow();
    expect(create().enabled()).toBe(false);
  });

  it('un almacenamiento que lanza al guardar conserva el cambio durante la sesión', () => {
    const settings = create();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('lleno', 'QuotaExceededError'); });
    expect(() => settings.set(true)).not.toThrow();
    expect(settings.enabled()).toBe(true);
  });
});

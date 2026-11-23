import { TestBed } from '@angular/core/testing';

import { CAMERA_STORAGE_KEY, CameraSettings } from './camera-settings.service';

/**
 * Ajustes de la cámara (bloque M1): la «vista cercana» que alterna Z y el «acercamiento automático» al hablar, revisar
 * y reaccionar. Se recuerdan por navegador; un almacenamiento bloqueado nunca rompe el juego.
 */
describe('CameraSettings', () => {
  const create = () => {
    TestBed.resetTestingModule();
    return TestBed.inject(CameraSettings);
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('por defecto: vista normal y acercamiento automático encendido', () => {
    const settings = create();
    expect(settings.cercana()).toBe(false);
    expect(settings.acercarAuto()).toBe(true);
  });

  it('alternar la vista cercana se recuerda en la siguiente visita', () => {
    create().toggleCercana();
    expect(JSON.parse(localStorage.getItem(CAMERA_STORAGE_KEY)!)).toEqual({ v: 1, cercana: true, auto: true });
    expect(create().cercana()).toBe(true);
  });

  it('apagar el acercamiento automático se recuerda', () => {
    create().setAcercarAuto(false);
    const next = create();
    expect(next.acercarAuto()).toBe(false);
    expect(next.cercana()).toBe(false);
  });

  it.each([['no es JSON', '{roto'], ['otra versión', '{"v":2,"cercana":true,"auto":false}'], ['tipos raros', '{"v":1,"cercana":"si","auto":0}']])(
    'un valor guardado inválido (%s) vale por defecto', (_nombre, raw) => {
      localStorage.setItem(CAMERA_STORAGE_KEY, raw);
      const settings = create();
      expect(settings.cercana()).toBe(false);
      expect(settings.acercarAuto()).toBe(true);
    },
  );

  it('un almacenamiento que lanza al leer deja los valores por defecto, sin error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError'); });
    expect(() => create()).not.toThrow();
    expect(create().acercarAuto()).toBe(true);
  });

  it('un almacenamiento que lanza al guardar conserva el cambio durante la sesión', () => {
    const settings = create();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('lleno', 'QuotaExceededError'); });
    expect(() => settings.setCercana(true)).not.toThrow();
    expect(settings.cercana()).toBe(true);
  });
});

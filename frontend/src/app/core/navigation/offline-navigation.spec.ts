import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationError, RedirectCommand, Router, provideRouter } from '@angular/router';

import { isOfflineLoadError, offlineNavigationHandler } from './offline-navigation';

/**
 * Sin conexión (plan visual F4-3): si una navegación falla porque no se pudo descargar el código de una ruta
 * perezosa, se muestra la página «Sin conexión» con la ruta pedida para reintentar, en vez de quedarse quieta.
 */
// req: BLOQUE-H (estados), RNF-004
describe('navegación sin conexión', () => {
  const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
  afterEach(() => { if (online) Object.defineProperty(Navigator.prototype, 'onLine', online); });

  it('reconoce los fallos de descarga de un módulo perezoso (Chrome, Firefox, Safari y webpack)', () => {
    for (const error of [
      new TypeError('Failed to fetch dynamically imported module: http://x/chunk-ABC.js'),
      new TypeError('error loading dynamically imported module'),
      new TypeError('Importing a module script failed.'),
      Object.assign(new Error('Loading chunk 7 failed.'), { name: 'ChunkLoadError' }),
    ]) {
      expect(isOfflineLoadError(error), String(error)).toBe(true);
    }
  });

  it('no confunde otros errores de navegación con la falta de red, salvo que el navegador diga que está sin red', () => {
    expect(isOfflineLoadError(new Error('NG04002: Cannot match any routes'))).toBe(false);
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
    expect(isOfflineLoadError(new Error('cualquier cosa'))).toBe(true);
  });

  it('redirige a /sin-conexion con la ruta pedida, sin cambiar la dirección visible; los demás errores siguen su curso', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const failed = new NavigationError(1, '/portal/simulador', new TypeError('Failed to fetch dynamically imported module: x'));
    const result = TestBed.runInInjectionContext(() => offlineNavigationHandler(failed));
    expect(result).toBeInstanceOf(RedirectCommand);
    const command = result as RedirectCommand;
    expect(TestBed.inject(Router).serializeUrl(command.redirectTo)).toBe('/sin-conexion?desde=%2Fportal%2Fsimulador');
    expect(command.navigationBehaviorOptions?.skipLocationChange).toBe(true);
    const other = new NavigationError(2, '/portal/x', new Error('otra cosa'));
    expect(TestBed.runInInjectionContext(() => offlineNavigationHandler(other))).toBeUndefined();
  });

  it('si la que falla es la propia «Sin conexión», no vuelve a redirigir (sin bucle: revisión de F4, I-1)', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const failed = new NavigationError(3, '/sin-conexion?desde=%2Fportal%2Fsimulador', new TypeError('Failed to fetch dynamically imported module: x'));
    expect(TestBed.runInInjectionContext(() => offlineNavigationHandler(failed))).toBeUndefined();
  });
});

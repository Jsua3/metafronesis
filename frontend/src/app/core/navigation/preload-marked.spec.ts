import { of, throwError } from 'rxjs';

import { PreloadMarkedRoutes } from './preload-marked';

/**
 * Precarga solo de las rutas marcadas (plan visual F4-3): «Sin conexión» se descarga con red, justo tras la primera
 * navegación, para que esté lista cuando falte; el resto del portal sigue perezoso (el bundle inicial no crece).
 */
// req: BLOQUE-H (estados)
describe('PreloadMarkedRoutes', () => {
  it('precarga las rutas con data.precargar y deja perezosas las demás', () => {
    const strategy = new PreloadMarkedRoutes();
    const load = vi.fn(() => of('cargada'));
    let result: unknown;
    strategy.preload({ path: 'sin-conexion', data: { precargar: true } }, load).subscribe(value => (result = value));
    expect(load).toHaveBeenCalledTimes(1);
    expect(result).toBe('cargada');
    load.mockClear();
    strategy.preload({ path: 'portal' }, load).subscribe(value => (result = value));
    strategy.preload({ path: 'otra', data: { precargar: 'sí' } }, load).subscribe();
    expect(load).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('si la precarga falla (p. ej. sin red), no rompe la precarga de las demás: emite null y termina (revisión de F4, I-1)', () => {
    const strategy = new PreloadMarkedRoutes();
    const values: unknown[] = [];
    let failed = false;
    let completed = false;
    strategy.preload({ path: 'sin-conexion', data: { precargar: true } }, () => throwError(() => new TypeError('Failed to fetch')))
      .subscribe({ next: value => values.push(value), error: () => (failed = true), complete: () => (completed = true) });
    expect(failed).toBe(false);
    expect(values).toEqual([null]);
    expect(completed).toBe(true);
  });
});

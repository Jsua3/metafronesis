import { fromWindowIso, toWindowIso, windowError, windowText } from './assignment-window.util';

/**
 * La ventana de una asignación en pantalla (plan visual F10-5; C7, RF-14, RF-15): los campos de fecha y hora del navegador
 * (`datetime-local`, sin zona) se mandan como un instante ISO 8601, así que el servidor la lleva a la hora de Bogotá sea cual
 * sea la zona de la docente; y al revés, lo que el servidor devuelve se muestra y se edita en la hora del navegador.
 */
// req: RF-14, RF-15, RNF-04
describe('assignment-window.util', () => {
  it('toWindowIso manda el instante en UTC y «sin fecha» como null', () => {
    const local = '2026-10-20T08:00';
    expect(toWindowIso(local)).toBe(new Date(local).toISOString());
    expect(toWindowIso('')).toBeNull();
    expect(toWindowIso('   ')).toBeNull();
    expect(toWindowIso('no es una fecha')).toBeNull();
  });

  it('fromWindowIso devuelve el valor que un campo datetime-local entiende, en la hora del navegador', () => {
    const instant = new Date(2026, 9, 20, 8, 5); // 20 de octubre, 8:05 hora local
    expect(fromWindowIso(instant.toISOString())).toBe('2026-10-20T08:05');
    expect(fromWindowIso(undefined)).toBe('');
    expect(fromWindowIso('basura')).toBe('');
  });

  it('un valor de ida y vuelta no se mueve', () => {
    for (const value of ['2026-01-01T00:00', '2026-10-20T23:59', '2027-02-28T12:30']) {
      expect(fromWindowIso(toWindowIso(value)!)).toBe(value);
    }
  });

  it('windowError exige que el cierre sea posterior a la apertura, solo si hay dos fechas', () => {
    expect(windowError('', '')).toBeNull();
    expect(windowError('2026-10-20T08:00', '')).toBeNull();
    expect(windowError('', '2026-10-20T08:00')).toBeNull();
    expect(windowError('2026-10-20T08:00', '2026-10-21T08:00')).toBeNull();
    expect(windowError('2026-10-20T08:00', '2026-10-20T08:00')).toBe('El cierre debe ser posterior a la apertura.');
    expect(windowError('2026-10-21T08:00', '2026-10-20T08:00')).toBe('El cierre debe ser posterior a la apertura.');
  });

  it('windowText dice la ventana con palabras, también cuando no hay fechas', () => {
    expect(windowText(undefined, undefined)).toBe('Sin fechas: abierto desde ya y sin cierre.');
    expect(windowText('2026-10-20T08:00:00-05:00', undefined)).toMatch(/^Abre el .*20 de oct.* · Sin cierre\.$/);
    expect(windowText(undefined, '2026-11-05T23:59:00-05:00')).toMatch(/^Abierto desde ya · Cierra el .*(5|6) de nov.*\.$/);
    expect(windowText('2026-10-20T08:00:00-05:00', '2026-11-05T23:59:00-05:00')).toMatch(/^Abre el .*20 de oct.* · Cierra el .*(5|6) de nov.*\.$/);
  });
});

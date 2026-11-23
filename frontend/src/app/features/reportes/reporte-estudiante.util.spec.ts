import { attemptTone, coverageLabel, formatDuration, formatStart } from './reporte-estudiante.util';

/**
 * Ayudas del reporte de un estudiante (plan visual F10-7†; C3): tiempos legibles, la cobertura «Mostrando X de N» y el
 * tono del estado del intento. Nada de esto inventa cifras: lo que no se sabe se dice («—», «Sin fecha»).
 */
// req: RF-26, CU-15, RF-25, CU-14
describe('reporte-estudiante.util', () => {
  describe('formatDuration', () => {
    it.each([
      [null, '—'],
      [undefined, '—'],
      [0, '0 s'],
      [45, '45 s'],
      [59.6, '1 min'],
      [60, '1 min'],
      [600, '10 min'],
      [3599, '59 min'],
      [3600, '1 h'],
      [3660, '1 h 1 min'],
      [7500, '2 h 5 min'],
    ])('%s → «%s»', (seconds, expected) => {
      expect(formatDuration(seconds as number | null | undefined)).toBe(expected);
    });

    it('un valor negativo o que no es número no se inventa: «—»', () => {
      expect(formatDuration(-5)).toBe('—');
      expect(formatDuration(Number.NaN)).toBe('—');
    });
  });

  describe('formatStart', () => {
    it('da la fecha y la hora en español', () => {
      // Sin zona, la hora se lee como local: el día y la hora salen tal cual.
      expect(formatStart('2026-10-10T10:30:00')).toMatch(/^10 de oct\.? de 2026, 10:30/);
      expect(formatStart('2026-10-10T15:45:00')).toMatch(/^10 de oct\.? de 2026, 3:45/);
    });

    it('sin fecha lo dice; un texto que no es fecha se muestra tal cual', () => {
      expect(formatStart(null)).toBe('Sin fecha');
      expect(formatStart('no es una fecha')).toBe('no es una fecha');
    });
  });

  describe('coverageLabel (Mostrando X de N)', () => {
    it.each([
      [{ shown: 3, total: 5 }, 'Mostrando 3 de 5 intentos'],
      [{ shown: 1, total: 1 }, 'Mostrando 1 de 1 intento'],
      [{ shown: 50, total: 120 }, 'Mostrando 50 de 120 intentos'],
      [{ shown: 0, total: 0 }, 'Mostrando 0 de 0 intentos'],
    ])('%j → «%s»', (coverage, expected) => {
      expect(coverageLabel(coverage)).toBe(expected);
    });
  });

  describe('attemptTone', () => {
    it.each([
      ['COMPLETED', 'success'],
      ['IN_PROGRESS', 'info'],
      ['PAUSED', 'warning'],
      ['SAFE_EXITED', 'neutral'],
      ['REPLACED', 'neutral'],
      ['LO_QUE_SEA', 'neutral'],
    ])('%s → %s', (status, tone) => {
      expect(attemptTone(status)).toBe(tone);
    });
  });
});

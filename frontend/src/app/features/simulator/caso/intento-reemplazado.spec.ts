import { HttpErrorResponse } from '@angular/common/http';

import { debeConfirmarIntento, intentoPerdido } from './intento-reemplazado';

describe('intento reemplazado (V4)', () => {
  const http = (status: number) => new HttpErrorResponse({ status });

  it('como estudiante, solo un 404 se confirma leyendo el intento', () => {
    expect(debeConfirmarIntento('student', http(404))).toBe(true);
    for (const status of [0, 400, 403, 409, 500]) expect(debeConfirmarIntento('student', http(status))).toBe(false);
    expect(debeConfirmarIntento('student', new Error('sin red'))).toBe(false);
  });

  it('en ensayo no aplica: lo confirma la lectura del bloque', () => {
    expect(debeConfirmarIntento('rehearsal', http(404))).toBe(false);
  });

  it('el intento está perdido solo si la lectura también da 404', () => {
    expect(intentoPerdido(http(404))).toBe(true);
    expect(intentoPerdido(http(0))).toBe(false);
    expect(intentoPerdido(http(500))).toBe(false);
    expect(intentoPerdido(null)).toBe(false);
  });
});

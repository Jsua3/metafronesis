import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

import { THROTTLED_FALLBACK_MESSAGE, retryAfterSeconds, throttledMessage } from './throttled';

/** El 429 del limitador (S1-2): el texto del servidor manda; si falta, los segundos de espera; si no, uno de respaldo. */
// req: DJA-2
describe('429 del limitador', () => {
  const throttled = (init: { error?: unknown; headers?: Record<string, string> } = {}) =>
    new HttpErrorResponse({ status: 429, statusText: 'Too Many Requests', error: init.error, headers: new HttpHeaders(init.headers) });

  it('muestra el texto que manda el servidor tal cual', () => {
    const error = throttled({ error: { code: 'THROTTLED', message: 'Demasiados intentos. Espera 37 s e inténtalo de nuevo.', retryAfter: 37 } });
    expect(throttledMessage(error)).toBe('Demasiados intentos. Espera 37 s e inténtalo de nuevo.');
  });

  it('sin texto del servidor usa los segundos del cuerpo y, si no, los de la cabecera Retry-After', () => {
    expect(throttledMessage(throttled({ error: { retryAfter: 12 } }))).toBe('Demasiados intentos. Espera 12 s e inténtalo de nuevo.');
    expect(throttledMessage(throttled({ headers: { 'Retry-After': '45' } }))).toBe('Demasiados intentos. Espera 45 s e inténtalo de nuevo.');
  });

  it('sin texto ni segundos usa el de respaldo, nunca vacío', () => {
    expect(throttledMessage(throttled())).toBe(THROTTLED_FALLBACK_MESSAGE);
    expect(throttledMessage(throttled({ error: { message: '   ' } }))).toBe(THROTTLED_FALLBACK_MESSAGE);
    expect(throttledMessage(throttled({ error: 'Too Many Requests' }))).toBe(THROTTLED_FALLBACK_MESSAGE);
  });

  it('los segundos se redondean hacia arriba y un valor inválido, cero o negativo no cuenta', () => {
    expect(retryAfterSeconds(throttled({ error: { retryAfter: 4.2 } }))).toBe(5);
    expect(retryAfterSeconds(throttled({ error: { retryAfter: 0 }, headers: { 'Retry-After': 'pronto' } }))).toBeNull();
    expect(retryAfterSeconds(throttled({ error: { retryAfter: -3 } }))).toBeNull();
  });

  it('el cuerpo manda sobre la cabecera cuando ambos traen segundos', () => {
    expect(retryAfterSeconds(throttled({ error: { retryAfter: 9 }, headers: { 'Retry-After': '30' } }))).toBe(9);
  });
});

import { HttpErrorResponse } from '@angular/common/http';

/** BORRADOR: texto de respaldo nuevo, pendiente de la aprobación de Psicología (VD-23). */
export const THROTTLED_FALLBACK_MESSAGE = 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';

/** Segundos que el servidor pide esperar (`retryAfter` del cuerpo o cabecera `Retry-After`); `null` si no los dice. */
export function retryAfterSeconds(error: HttpErrorResponse): number | null {
  const body = error.error as { retryAfter?: unknown } | null;
  const fromBody = typeof body?.retryAfter === 'number' ? body.retryAfter : Number.NaN;
  const fromHeader = Number(error.headers?.get('Retry-After'));
  for (const value of [fromBody, fromHeader]) {
    if (Number.isFinite(value) && value > 0) return Math.ceil(value);
  }
  return null;
}

/**
 * Texto de un 429 (S1-2): el que manda el servidor; si falta, uno con los segundos de espera; si tampoco hay
 * segundos, el de respaldo. Nunca devuelve vacío: quien lo pinta no decide qué decir.
 */
export function throttledMessage(error: HttpErrorResponse): string {
  const body = error.error as { message?: unknown } | null;
  if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  const seconds = retryAfterSeconds(error);
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología (VD-23).
  return seconds === null ? THROTTLED_FALLBACK_MESSAGE : `Demasiados intentos. Espera ${seconds} s e inténtalo de nuevo.`;
}

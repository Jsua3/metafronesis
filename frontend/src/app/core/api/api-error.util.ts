import { HttpErrorResponse } from '@angular/common/http';

/** Estados que `jwtInterceptor` ya comunica con su propio aviso. */
const HANDLED_BY_INTERCEPTOR = new Set([0, 401, 403]);

/**
 * Texto para mostrarle al usuario tras un error de la API, o `null` si el
 * interceptor ya avisó (sin conexión, sesión inválida, sin permisos, error no HTTP).
 */
export function apiErrorMessage(err: unknown, fallback: string): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  if (HANDLED_BY_INTERCEPTOR.has(err.status)) return null;
  const body = err.error as { message?: unknown; detail?: unknown } | null;
  for (const candidate of [body?.message, body?.detail]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

/**
 * Código estable del 403 con el que el servidor exige el consentimiento al aviso de contenido (S3-2a, ETH-01): el
 * consentimiento se retiró (en otra pestaña) o el aviso cambió de versión. Trae `noticeVersion` en el cuerpo.
 */
export const CONSENT_REQUIRED = 'CONSENT_REQUIRED';

/** ¿Es el 403 `CONSENT_REQUIRED`? Se decide por el `code`, nunca por el texto del mensaje. */
export function isConsentRequiredError(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse) || err.status !== 403) return false;
  const body = err.error as { code?: unknown } | null;
  return body?.code === CONSENT_REQUIRED;
}

/** Código del 404 con el que el servidor dice que el ensayo ya no existe, no es de quien pide o es de otra versión. */
export const REHEARSAL_GONE = 'REHEARSAL_GONE';

/** ¿Es el 404 `REHEARSAL_GONE`? Se decide por el `code`, nunca por el texto del mensaje. */
export function isRehearsalGoneError(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse) || err.status !== 404) return false;
  const body = err.error as { code?: unknown } | null;
  return body?.code === REHEARSAL_GONE;
}

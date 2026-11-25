import { HttpErrorResponse } from '@angular/common/http';

/** Estados que `jwtInterceptor` ya comunica con su propio aviso (sin conexión, sesión inválida, sin permisos). */
const AVISADOS_POR_EL_INTERCEPTOR = new Set([0, 401, 403]);

/** Marcas de un texto pensado para quien programa, no para quien usa la pantalla. */
const MARCAS_TECNICAS = /traceback|exception|stack|<\/?[a-z][^>]*>|[{}[\]]|\bHTTP\s*\d{3}\b|\b(?:not found|required|invalid|bad request|internal server|unauthorized|forbidden|permission denied|failed|undefined|null)\b/i;
/** Una palabra corriente del español: sin ella, el texto del servidor casi seguro viene en inglés. */
const PALABRA_EN_ESPAÑOL = /\b(?:el|la|los|las|de|del|no|que|un|una|por|para|con|se|ya|debe|tiene|puede|este|esta|solo|ese|esa)\b/i;

/** ¿Es el texto del servidor algo que se le puede leer a una persona tal cual? */
export function esTextoParaPersona(texto: unknown): texto is string {
  if (typeof texto !== 'string') return false;
  const limpio = texto.trim();
  return limpio.length > 0 && limpio.length <= 240 && PALABRA_EN_ESPAÑOL.test(limpio) && !MARCAS_TECNICAS.test(limpio);
}

/**
 * El error de la API dicho en palabras de persona (P6): QUÉ pasó (`fallback`, sin jerga) y QUÉ hacer. Si el servidor
 * mandó un mensaje en español claro, se usa tal cual (suele decir exactamente qué regla se rompió); si trae algo técnico
 * («Not found.», un volcado, un código HTTP) se cambia por el `fallback` y una acción según el tipo de fallo. Devuelve
 * `null` cuando el interceptor ya avisó (sin conexión, sesión vencida, sin permiso) para no avisar dos veces.
 */
export function mensajeDeError(err: unknown, fallback: string, accion = 'Inténtalo de nuevo.'): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  if (AVISADOS_POR_EL_INTERCEPTOR.has(err.status)) return null;
  const cuerpo = err.error as { message?: unknown; detail?: unknown } | null;
  for (const candidato of [cuerpo?.message, cuerpo?.detail]) {
    if (esTextoParaPersona(candidato)) return candidato.trim();
  }
  if (err.status >= 500) return `${fallback} Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.`;
  if (err.status === 404) return `${fallback} Puede que ya no exista o que otra persona lo haya cambiado: recarga la página.`;
  return `${fallback} ${accion}`;
}

/** Igual que `mensajeDeError` para un error que ya se guardó (la carga de una lista) y no pasó por el interceptor. */
export function mensajeDeCarga(status: number | null | undefined, fallback: string): string {
  if (status === 0) return `${fallback} Revisa tu conexión e inténtalo de nuevo.`;
  if (status === 401) return `${fallback} Tu sesión terminó: vuelve a entrar.`;
  if (status === 403) return `${fallback} Tu cuenta no tiene permiso para verlo.`;
  if (status !== null && status !== undefined && status >= 500) return `${fallback} Es un problema nuestro, no tuyo: espera un momento e inténtalo de nuevo.`;
  return `${fallback} Inténtalo de nuevo.`;
}

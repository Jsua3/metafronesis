/**
 * Primera respuesta que el juego no aplicó (regla de reintento, T11.1): eventos `*_RETRY_REQUIRED`.
 * No son decisiones registradas ni cuentan en los contadores del cierre y de la traza; se muestran aparte
 * («Reconsideradas») y, en el panel del docente, con su propia etiqueta para que fila y contador no se contradigan.
 */
export const RECONSIDERED_LABEL = 'Primera respuesta no aplicada (reintento)';

/** Texto para el docente: qué ocurrió con esa fila de la línea de tiempo (no es una contraindicación registrada). */
export const RECONSIDERED_TEACHER_HINT =
  'El juego no aplicó esta primera respuesta y le pidió al estudiante reconsiderar; no cuenta como decisión registrada. Conviene comentarla en la retroalimentación.';

export function isRetryEventType(type: string | null | undefined): boolean {
  return /RETRY_REQUIRED$/.test((type ?? '').toUpperCase());
}

/** Etiqueta del chip del estudiante («Reconsideradas: 2»); null si no reconsideró nada. */
export function reconsideredChip(retries: number | null | undefined): string | null {
  return retries && retries > 0 ? `Reconsideradas: ${retries}` : null;
}

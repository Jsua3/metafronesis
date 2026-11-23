import { StudentAttemptSummary } from '../../core/models/simulation.model';

/**
 * Duración de una fila del historial del estudiante: el tiempo activo estimado (sin pausas
 * ni esperas largas) y, si el intento no lo informa, el total de reloj. Este incluye pausas
 * y abandonos, y puede dar cifras como «134340 min».
 */
export function historyDurationSeconds(
  attempt: Pick<StudentAttemptSummary, 'activeDurationSeconds' | 'totalDurationSeconds'>
): number | null {
  return attempt.activeDurationSeconds ?? attempt.totalDurationSeconds;
}

/** Duración legible de un intento o de un escenario («12 min 34 s», «45 s»); «No disponible» sin dato. */
export function formatAttemptDuration(seconds: number | null): string {
  if (seconds == null) return 'No disponible';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

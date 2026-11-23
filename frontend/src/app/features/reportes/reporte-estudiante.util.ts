import { CoberturaReporte } from '../../core/models/reporte.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { plural, statusLabel } from '../../shared/ui/labels';

/** «45 s», «10 min», «2 h 5 min»; `—` cuando no hay dato (un intento abierto no tiene tiempo de reloj). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Fecha y hora de inicio en español de Colombia («10 oct 2026, 10:30 a. m.»); el texto crudo si no es una fecha. */
export function formatStart(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** «Mostrando 3 de 5 intentos»: cuántos trae la respuesta de cuántos hay con ese filtro (RF-25, RQ-NEG-006). */
export function coverageLabel(coverage: CoberturaReporte): string {
  return `Mostrando ${coverage.shown} de ${plural(coverage.total, 'intento')}`;
}

/** El tono de la insignia del estado de un intento; el texto sale de `statusLabel`. */
export function attemptTone(status: string): UiBadgeTone {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED': return 'success';
    case 'IN_PROGRESS': return 'info';
    case 'PAUSED': return 'warning';
    default: return 'neutral';
  }
}

/** Lo mínimo de un intento que hace falta para decir cómo va el caso. */
export interface IntentoParaEstado { ordinal: number; status: string }

/**
 * El estado del caso en palabras, a partir de sus intentos: el del intento más reciente (el de mayor número) y cuántos
 * se han terminado. «Finalizado» es el texto de `statusLabel`; no se inventa un estado que el servidor no dio.
 */
export function caseStatusText(attempts: readonly IntentoParaEstado[]): string {
  if (!attempts.length) return 'Sin intentos en este corte.';
  const latest = attempts.reduce((best, item) => (item.ordinal > best.ordinal ? item : best));
  const done = attempts.filter(item => (item.status ?? '').toUpperCase() === 'COMPLETED').length;
  const finished = done === 0 ? 'ninguno finalizado' : `${done} ${done === 1 ? 'finalizado' : 'finalizados'}`;
  return `Último intento: ${statusLabel(latest.status).toLowerCase()}. ${plural(attempts.length, 'intento')} en este corte, ${finished}.`;
}

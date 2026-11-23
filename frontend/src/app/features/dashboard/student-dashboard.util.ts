import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { plural } from '../../shared/ui/labels';
import { NO_DATA_LABEL, completedAttemptCount } from './dashboard-metrics.util';

/** Una barra de «Progreso por caso»: el título entero (lo recorta el CSS) y la cuenta real. */
export interface CaseProgress {
  title: string;
  completed: number;
  total: number;
  percent: number;
}

export interface FirstUseCopy {
  title: string;
  description: string;
  action: string | null;
}

const OPEN_STATUSES = new Set(['IN_PROGRESS', 'PAUSED']);
const MAX_CLOSINGS = 3;
const MAX_CASES = 5;

/** El intento abierto (en curso o en pausa): lo que el estudiante puede continuar. Nunca uno cerrado. */
export function openAttempt(history: readonly StudentAttemptSummary[]): StudentAttemptSummary | null {
  return history.find(attempt => OPEN_STATUSES.has(attempt.status)) ?? null;
}

/** Tono que acompaña al texto del estado (el texto sale de `statusLabel`; el tono solo lo refuerza, WCAG 1.4.1). */
export function attemptTone(status: string): UiBadgeTone {
  if (status === 'COMPLETED') return 'success';
  if (OPEN_STATUSES.has(status)) return 'info';
  return 'neutral';
}

/** Un cierre reciente: el caso y la fecha en que empezó el intento, sin cifras. */
export interface ClosingEntry {
  caseVersionId: number;
  attemptId: string;
  caseTitle: string;
  dateLabel: string;
}

/** Los tres últimos intentos COMPLETADOS, del más reciente al más antiguo (por fecha de inicio). */
export function lastClosings(history: readonly StudentAttemptSummary[]): ClosingEntry[] {
  return history
    .filter(attempt => attempt.status === 'COMPLETED')
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, MAX_CLOSINGS)
    .map(attempt => ({ attemptId: attempt.attemptId, caseVersionId: attempt.caseVersionId, caseTitle: attempt.caseTitle, dateLabel: formatDate(attempt.startedAt) }));
}

/** Completados frente al total por caso (máximo cinco); el interrumpido no cuenta como completado. */
export function caseProgress(history: readonly StudentAttemptSummary[]): CaseProgress[] {
  const byCase = new Map<string, StudentAttemptSummary[]>();
  for (const attempt of history) {
    byCase.set(attempt.caseTitle, [...(byCase.get(attempt.caseTitle) ?? []), attempt]);
  }
  return [...byCase.entries()].slice(0, MAX_CASES).map(([title, attempts]) => {
    const completed = completedAttemptCount(attempts);
    return { title, completed, total: attempts.length, percent: Math.round((completed / attempts.length) * 100) };
  });
}

/** Tiempo activo legible; «Sin datos» si ningún intento lo informa (nunca un 0 inventado). */
export function formatActiveTime(seconds: number | null): string {
  if (seconds === null) return NO_DATA_LABEL;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} s`;
}

/** Fecha en español de Colombia («2 sept 2026», con hora si se pide); el texto crudo si no es una fecha. */
export function formatDate(value: string | null, withTime = false): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO', withTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Primer uso: sin intentos. Con casos, la invitación lleva a la sala; sin casos asignados (F5-5), se dice y no hay
 * acción (no hay nada que hacer todavía); sin el catálogo (`null`) no se inventa la cifra.
 */
export function firstUseCopy(casesCount: number | null): FirstUseCopy {
  if (casesCount === 0) {
    return {
      title: 'Aún no tienes casos asignados',
      description: 'Cuando tu docente te asigne un caso, aparecerá aquí y en la sala.',
      action: null,
    };
  }
  return {
    title: 'Aún no has empezado ningún caso',
    description: casesCount === null
      ? 'Entra a la sala para ver los casos disponibles y elegir uno.'
      : `Tienes ${plural(casesCount, 'caso disponible', 'casos disponibles')}. Entra a la sala y elige una puerta para empezar.`,
    action: 'Ir a la sala',
  };
}

/**
 * Lo que Inicio propone hacer ahora (DISENO §4.1). Hay un solo paso, en este orden de prioridad:
 * continuar lo abierto, abrir la ficha del siguiente caso, esperar a que abra un caso que aún no está disponible
 * o, si todo está terminado, volver a mirar el último recorrido. `null`: no hay casos asignados.
 */
export type SiguientePaso =
  | { tipo: 'continuar'; caso: CatalogItem; intento: StudentAttemptSummary }
  | { tipo: 'ficha'; caso: CatalogItem }
  | { tipo: 'espera'; caso: CatalogItem }
  | { tipo: 'terminado'; caso: CatalogItem; intento: StudentAttemptSummary | null };

function termino(historial: readonly StudentAttemptSummary[], caso: CatalogItem): boolean {
  return historial.some(intento => intento.caseVersionId === caso.caseVersionId && intento.status === 'COMPLETED');
}

/**
 * El siguiente paso respeta el orden del catálogo (el desbloqueo es lineal) y nunca ofrece reemplazar un intento: lo
 * abierto se continúa. Si hay varios intentos abiertos, gana el más reciente.
 */
export function siguientePaso(catalogo: readonly CatalogItem[], historial: readonly StudentAttemptSummary[]): SiguientePaso | null {
  const ordenado = [...catalogo].sort((a, b) => a.order - b.order);
  if (!ordenado.length) return null;
  const abiertos = historial
    .filter(intento => (intento.status === 'IN_PROGRESS' || intento.status === 'PAUSED') && ordenado.some(caso => caso.caseVersionId === intento.caseVersionId))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  if (abiertos.length) {
    return { tipo: 'continuar', caso: ordenado.find(caso => caso.caseVersionId === abiertos[0].caseVersionId)!, intento: abiertos[0] };
  }
  const pendientes = ordenado.filter(caso => !caso.completed && !termino(historial, caso));
  const disponible = pendientes.find(caso => caso.unlocked);
  if (disponible) return { tipo: 'ficha', caso: disponible };
  if (pendientes.length) return { tipo: 'espera', caso: pendientes[0] };
  const ultimo = historial
    .filter(intento => intento.status === 'COMPLETED' && ordenado.some(caso => caso.caseVersionId === intento.caseVersionId))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] ?? null;
  const caso = ultimo ? ordenado.find(entrada => entrada.caseVersionId === ultimo.caseVersionId)! : ordenado[ordenado.length - 1];
  return { tipo: 'terminado', caso, intento: ultimo };
}

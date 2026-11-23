import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { formatDate } from '../dashboard/student-dashboard.util';

export type ClaveEstadoCaso = 'sin-empezar' | 'en-curso' | 'en-pausa' | 'terminado' | 'bloqueado' | 'aun-no-abre' | 'cerrado';

/** El estado de un caso en palabras (DISENO §4.1): lo que ve el estudiante, sin porcentajes ni puntajes. */
export interface EstadoCaso {
  clave: ClaveEstadoCaso;
  /** Texto corto de la insignia: «En curso», «Terminado», «Se abre el 3 dic 2026». */
  etiqueta: string;
  /** Solo acompaña al texto (WCAG 1.4.1): el significado nunca depende del color. */
  tono: UiBadgeTone;
  /** La razón, si la hay: por qué está bloqueado o cuándo se abre. */
  detalle: string | null;
  /** Hay un intento en curso o en pausa: se puede continuar aunque el caso haya quedado bloqueado (RN-07). */
  abierto: boolean;
}

const ABIERTOS = new Set<StudentAttemptSummary['status']>(['IN_PROGRESS', 'PAUSED']);

/** El caso que va justo antes en el orden del catálogo: el desbloqueo es lineal (SIEP-RF-12). */
function anteriorEnElOrden(catalogo: readonly CatalogItem[], caso: CatalogItem): CatalogItem | null {
  const ordenado = [...catalogo].sort((a, b) => a.order - b.order);
  const indice = ordenado.findIndex(entrada => entrada.caseVersionId === caso.caseVersionId);
  return indice > 0 ? ordenado[indice - 1] : null;
}

/**
 * Combina el catálogo (`unlocked`, `completed`, `access`) con el historial para decir en qué punto está un caso. Un
 * intento abierto manda sobre todo lo demás: continuar, pausar o terminar es siempre posible (RN-07). Después va
 * «terminado»; y solo entonces los motivos de bloqueo, que salen de la decisión del servidor (`access.reason`) y
 * nunca de una cuenta del cliente. `catalogo` sirve solo para nombrar el caso anterior.
 */
export function estadoCaso(
  caso: CatalogItem,
  historial: readonly StudentAttemptSummary[],
  catalogo: readonly CatalogItem[] = [caso],
): EstadoCaso {
  const intentos = historial.filter(intento => intento.caseVersionId === caso.caseVersionId);
  const abierto = intentos.find(intento => ABIERTOS.has(intento.status));
  if (abierto) {
    const enPausa = abierto.status === 'PAUSED';
    return { clave: enPausa ? 'en-pausa' : 'en-curso', etiqueta: enPausa ? 'En pausa' : 'En curso', tono: 'info', detalle: null, abierto: true };
  }
  if (caso.completed || intentos.some(intento => intento.status === 'COMPLETED')) {
    return { clave: 'terminado', etiqueta: 'Terminado', tono: 'success', detalle: null, abierto: false };
  }
  if (caso.unlocked) {
    return { clave: 'sin-empezar', etiqueta: 'Sin empezar', tono: 'neutral', detalle: null, abierto: false };
  }
  const motivo = caso.access?.reason;
  if (motivo === 'NOT_YET_OPEN') {
    const fecha = caso.access?.opensAt ? formatDate(caso.access.opensAt) : null;
    return { clave: 'aun-no-abre', etiqueta: fecha ? `Se abre el ${fecha}` : 'Aún no abre', tono: 'info', detalle: fecha ? null : 'Tu docente aún no define cuándo se abre.', abierto: false };
  }
  if (motivo === 'CLOSED') {
    const fecha = caso.access?.closesAt ? formatDate(caso.access.closesAt) : null;
    return { clave: 'cerrado', etiqueta: fecha ? `Cerró el ${fecha}` : 'Ya cerró', tono: 'warning', detalle: 'El plazo terminó y ya no se puede empezar.', abierto: false };
  }
  if (motivo === 'NOT_ASSIGNED') {
    return { clave: 'bloqueado', etiqueta: 'Bloqueado', tono: 'neutral', detalle: 'Tu docente aún no te lo asigna.', abierto: false };
  }
  const anterior = anteriorEnElOrden(catalogo, caso);
  return {
    clave: 'bloqueado',
    etiqueta: 'Bloqueado',
    tono: 'neutral',
    detalle: anterior ? `Se abre al terminar «${anterior.title}».` : 'Se abre al terminar el caso anterior.',
    abierto: false,
  };
}

/** El intento más reciente que se puede revisar en la página de cierre (terminado o cerrado con salida segura). */
export function ultimoRecorrido(historial: readonly StudentAttemptSummary[], caseVersionId?: number): StudentAttemptSummary | null {
  const revisables = historial
    .filter(intento => (caseVersionId === undefined || intento.caseVersionId === caseVersionId) && (intento.status === 'COMPLETED' || intento.status === 'SAFE_EXITED'))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return revisables[0] ?? null;
}

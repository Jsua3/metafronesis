import { CatalogItem } from '../../core/models/simulation.model';
import { accessNotice } from './case-access.util';

/** Caso anterior en el orden del catálogo (el desbloqueo es lineal: SIEP-RF-12). */
function previousCase(catalog: readonly CatalogItem[], caseVersionId: number): CatalogItem | null {
  const ordered = [...catalog].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex(item => item.caseVersionId === caseVersionId);
  return index > 0 ? ordered[index - 1] : null;
}

/** El caso está cerrado por la ventana de su asignación (aún no abre o ya cerró), no por la secuencia (F10-5, RN-04, RF-15). */
function windowReason(item: CatalogItem): string | null {
  const reason = item.access?.reason;
  if (!item.access || (reason !== 'NOT_YET_OPEN' && reason !== 'CLOSED')) return null;
  const notice = accessNotice(item.access);
  return notice ? `${notice.title}. ${notice.detail}` : null;
}

/** Rótulo corto del bloqueo de una tarjeta: «Aún no abre», «Ya cerró» o, por la secuencia o sin dato, «Bloqueado». */
export function lockLabel(catalog: readonly CatalogItem[], caseVersionId: number): string {
  const item = catalog.find(entry => entry.caseVersionId === caseVersionId);
  const reason = item?.access?.reason;
  return item?.access && (reason === 'NOT_YET_OPEN' || reason === 'CLOSED') ? accessNotice(item.access)?.title ?? 'Bloqueado' : 'Bloqueado';
}

/**
 * Motivo de un caso bloqueado (plan visual F5-5, F10-5): si lo cierra la ventana de su asignación, dice cuándo abre o cuándo
 * cerró; si lo cierra la secuencia, nombra el caso que hay que completar antes. Null si el caso está abierto o no está en el
 * catálogo. Solo informa: quien decide es el servidor.
 */
export function lockReason(catalog: readonly CatalogItem[], caseVersionId: number): string | null {
  const item = catalog.find(entry => entry.caseVersionId === caseVersionId);
  if (!item || item.unlocked) return null;
  const byWindow = windowReason(item);
  if (byWindow) return byWindow;
  const previous = previousCase(catalog, caseVersionId);
  return previous ? `Completa «${previous.title}» para abrirlo.` : 'Completa el caso anterior para abrirlo.';
}

/** Aviso del catálogo cuando se pidió por dirección un caso bloqueado: cuál y por qué. */
export function blockedNotice(catalog: readonly CatalogItem[], caseVersionId: number): string | null {
  const reason = lockReason(catalog, caseVersionId);
  if (!reason) return null;
  const item = catalog.find(entry => entry.caseVersionId === caseVersionId)!;
  if (windowReason(item)) return `«${item.title}»: ${reason}`;
  return `«${item.title}» todavía está bloqueado: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}

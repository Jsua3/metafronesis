/**
 * Etiquetas humanas de los valores que llegan de la API (plan visual §2.10). Ninguna pantalla muestra un
 * enum crudo (`PUBLISHED`, `ADMIN`) ni inventa su propia tabla: todas pasan por aquí.
 * Los textos de pausa del juego (`statusLabelA11y` de la simulación) están validados por Psicología y NO
 * se sustituyen con esta tabla.
 */

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  PROFESOR: 'Docente',
  ESTUDIANTE: 'Estudiante',
};

/** Estados de versión de caso y de intento, con los textos que ya muestra el catálogo. */
const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'Publicado',
  DRAFT: 'Borrador',
  IN_REVIEW: 'En revisión',
  ARCHIVED: 'Archivado',
  COMPLETED: 'Finalizado',
  PAUSED: 'En pausa (reanudable)',
  SAFE_EXITED: 'Cerrado con salida segura',
  REPLACED: 'Reemplazado por un intento nuevo',
  IN_PROGRESS: 'En curso',
  PENDING: 'Pendiente',
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  PERSON: 'Persona',
  PROP: 'Objeto',
  OBJECT: 'Objeto',
  TOOL_TARGET: 'Objetivo de herramienta',
  TOOL: 'Herramienta',
  EXIT: 'Salida',
  ROUTE: 'Ruta',
  TRIGGER: 'Disparador',
  NOTE: 'Nota',
  RESOURCE: 'Recurso',
  WARNING: 'Advertencia',
};

/** Membresía de un estudiante en un grupo (E2-10, C5), vista por el docente en el detalle del grupo. */
const MEMBERSHIP_LABELS: Record<string, string> = {
  INVITED: 'Invitación pendiente',
  ACTIVE: 'Miembro',
  DECLINED: 'Rechazó la invitación',
  REMOVED: 'Retirado del grupo',
};

/** La misma membresía vista por el estudiante en su bandeja de invitaciones. */
const INVITATION_LABELS: Record<string, string> = {
  INVITED: 'Pendiente',
  ACTIVE: 'Miembro',
  DECLINED: 'Rechazada',
  REMOVED: 'Saliste del grupo',
};

/**
 * Si un intento terminado ya tiene la valoración de su docente (BK-3, `evaluationStatus`), visto por la docente en
 * Inicio y en Revisión. «Por revisar» es trabajo pendiente, no un juicio sobre el estudiante.
 */
const EVALUATION_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Por revisar',
  APLICADA: 'Revisado',
  NO_APLICA: 'Sin valoración',
};

/** Tono de la insignia de cada estado de versión de caso e intento (una sola tabla, como las etiquetas). */
const STATUS_TONES: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  IN_REVIEW: 'info',
  ARCHIVED: 'neutral',
  COMPLETED: 'success',
  PAUSED: 'warning',
  SAFE_EXITED: 'warning',
  REPLACED: 'neutral',
  IN_PROGRESS: 'info',
  PENDING: 'neutral',
};

/** `SOME_VALUE` → `Some value`: último recurso para un código que la tabla aún no conoce. */
function humanize(code: string): string {
  const words = code.trim().toLowerCase().replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function lookup(table: Record<string, string>, code: string | null | undefined, empty: string): string {
  const key = (code ?? '').trim().toUpperCase();
  if (!key) return empty;
  return table[key] ?? humanize(key);
}

export function roleLabel(role: string | null | undefined): string {
  return lookup(ROLE_LABELS, role, 'Sin rol');
}

export function statusLabel(status: string | null | undefined): string {
  return lookup(STATUS_LABELS, status, 'Sin estado');
}

export function membershipLabel(status: string | null | undefined): string {
  return lookup(MEMBERSHIP_LABELS, status, 'Sin estado');
}

export function invitationLabel(status: string | null | undefined): string {
  return lookup(INVITATION_LABELS, status, 'Sin estado');
}

export function evaluationStatusLabel(status: string | null | undefined): string {
  return lookup(EVALUATION_STATUS_LABELS, status, 'Sin valoración');
}

/** El tono de `ui-badge` que acompaña a `statusLabel` (un estado que no está en la tabla va en neutro). */
export function statusTone(status: string | null | undefined): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  return STATUS_TONES[(status ?? '').trim().toUpperCase()] ?? 'neutral';
}

export function objectTypeLabel(type: string | null | undefined): string {
  return lookup(OBJECT_TYPE_LABELS, type, 'Objeto');
}

/** `plural(1, 'nodo')` → «1 nodo»; `plural(2, 'nodo')` → «2 nodos»; la forma irregular se pasa explícita. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

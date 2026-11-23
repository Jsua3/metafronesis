import { HttpErrorResponse } from '@angular/common/http';

import { CaseEditorView } from '../models/simulation.model';

/**
 * Lo que dice el servidor cuando otra persona editó el caso entre medias (E2-6, RNF-08, REGLA-011): la revisión
 * actual y el editor completo (`current`) para mostrar qué cambió y recargar sin otra petición. `current` es `null`
 * si el cuerpo no lo trae.
 */
export interface RevisionConflict {
  revision: number;
  current: CaseEditorView | null;
  message: string;
}

/**
 * Lee un 409 `REVISION_CONFLICT` (`{ success: false, code, message, revision, current }`): el MISMO para el editor
 * de casos y para el guardado del mundo. Cualquier otra cosa (otro estado, otro código, un cuerpo que no es un
 * objeto) no es un conflicto de revisión y devuelve `null`.
 */
export function revisionConflictOf(err: unknown): RevisionConflict | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 409) return null;
  const body = err.error;
  if (typeof body !== 'object' || body === null) return null;
  const { code, message, revision, current } = body as Record<string, unknown>;
  if (code !== 'REVISION_CONFLICT') return null;
  return {
    revision: typeof revision === 'number' ? revision : Number(revision ?? 0),
    current: typeof current === 'object' && current !== null ? (current as CaseEditorView) : null,
    message: typeof message === 'string' ? message : '',
  };
}

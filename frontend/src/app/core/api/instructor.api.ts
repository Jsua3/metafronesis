import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { map } from 'rxjs/operators';

/** Respuesta del reemplazo docente (E1-2). */
export interface ReplacedAttempt {
  attemptId: string;
  status: string;
  reason: string;
  replacedAt: string | null;
}
import {
  AttemptTrace,
  InstructorAttemptItem,
  FormativeLevel,
  InstructorAttemptsPage,
  InstructorAttemptsQuery,
  RecentAttempt,
  RubricEvaluationView,
} from '../models/revision.model';
import { ApiDataResponse } from './api-response';

/**
 * API del instructor: trazas de intentos y evaluación con rúbrica.
 * Separada de `SimulationService` (Interface Segregation) para que quien solo
 * revisa intentos no dependa de los métodos del jugador ni de los de autoría.
 */
@Injectable({ providedIn: 'root' })
export class InstructorApi {
  private readonly http = inject(HttpClient);

  recentAttempts(filter?: { groupId: number; caseVersionId: number }) {
    return this.http.get<ApiDataResponse<RecentAttempt[]>>('/api/instructor/attempts/recent', filter ? { params: { groupId: filter.groupId, caseVersionId: filter.caseVersionId } } : {})
      .pipe(map(response => response.data));
  }

  /**
   * La bandeja de revisión. El servidor no pagina ni filtra por valoración en `GET /api/instructor/attempts` y esa lista
   * no trae alias, título del caso ni estado de la valoración; el Adapter la arma con `GET /api/instructor/attempts/recent`
   * (los 20 intentos más recientes dentro del alcance del docente) y filtra y pagina en el cliente. `coverage.total` es,
   * por tanto, el total de esos recientes y no el de toda la historia.
   */
  listAttempts(query: InstructorAttemptsQuery = {}) {
    return this.recentAttempts().pipe(map(recientes => {
      const items: InstructorAttemptItem[] = recientes
        .map(intento => ({
          attemptId: intento.attemptId,
          studentAlias: intento.studentAlias,
          caseVersionId: intento.caseVersionId ?? 0,
          caseVersionStatus: '',
          caseTitle: intento.caseTitle,
          status: intento.status as InstructorAttemptItem['status'],
          activeSeconds: 0,
          startedAt: intento.startedAt,
          endedAt: intento.endedAt ?? null,
          evaluationStatus: intento.evaluationStatus,
        }))
        .filter(item => (query.caseVersionId === undefined || item.caseVersionId === query.caseVersionId)
          && (query.estado === undefined || item.status === query.estado)
          && (query.evaluacion === undefined
            || (query.evaluacion === 'pendiente' ? item.evaluationStatus === 'PENDIENTE' : item.evaluationStatus === 'APLICADA')));
      const pageSize = query.pageSize ?? 20;
      const page = query.page ?? 1;
      const pagina = items.slice((page - 1) * pageSize, page * pageSize);
      return { items: pagina, page, pageSize, coverage: { shown: pagina.length, total: items.length } } as InstructorAttemptsPage;
    }));
  }

  attemptTrace(attemptId: string) {
    return this.http.get<ApiDataResponse<AttemptTrace>>(`/api/instructor/attempts/${attemptId}/trace`)
      .pipe(map(response => response.data));
  }

  rubric(attemptId: string) {
    return this.http.get<ApiDataResponse<RubricEvaluationView>>(`/api/instructor/attempts/${attemptId}/rubric-evaluation`)
      .pipe(map(response => response.data));
  }

  /** E1-2 (RN-07): el docente reemplaza un intento ABIERTO con un motivo (queda en el intento y en la auditoría). */
  replaceAttempt(attemptId: string, reason: string) {
    return this.http.post<ApiDataResponse<ReplacedAttempt>>(`/api/instructor/attempts/${attemptId}/replace`, { reason })
      .pipe(map(response => response.data));
  }

  /**
   * Guarda la valoración del docente: un nivel formativo por criterio (la rúbrica no lleva números).
   *
   * RK-5 (bloque R0) · `opciones.deliver: false` es «Guardar sin entregar»: queda pendiente aunque esté completa y el
   * estudiante no la ve. Solo vale antes de la primera entrega: sobre una ya entregada el servidor responde 409
   * `EVALUATION_ALREADY_DELIVERED` y no cambia nada (ver `esValoracionYaEntregada`). Sin `opciones` el cuerpo es
   * exactamente el de siempre y la valoración completa se entrega, como hoy.
   */
  saveRubric(
    attemptId: string,
    rubricId: number,
    comment: string,
    scores: { criterionId: number; level: FormativeLevel; comment: string }[],
    opciones: { deliver?: boolean } = {},
  ) {
    return this.http.put<ApiDataResponse<RubricEvaluationView>>(`/api/instructor/attempts/${attemptId}/rubric-evaluation`, {
      rubricId,
      comment,
      scores,
      // Solo viaja si alguien lo pidió: un servidor anterior a R0 recibe el cuerpo de siempre.
      ...(opciones.deliver === undefined ? {} : { deliver: opciones.deliver }),
    }).pipe(map(response => response.data));
  }
}

/** RK-5 · El código con que el servidor rechaza «Guardar sin entregar» sobre una valoración que el estudiante ya ve. */
export const EVALUATION_ALREADY_DELIVERED = 'EVALUATION_ALREADY_DELIVERED';

/**
 * RK-5 · ¿Es este error el 409 de una valoración ya entregada? La pantalla lo usa para decir «ya la entregaste» y
 * esconder «Guardar sin entregar», en vez del mensaje genérico. Se decide por el `code` del sobre de error
 * (`{ success: false, code, message }`), nunca por el texto, como `isConsentRequiredError`.
 */
export function esValoracionYaEntregada(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) return false;
  const body = error.error as { code?: unknown } | null;
  return body?.code === EVALUATION_ALREADY_DELIVERED;
}

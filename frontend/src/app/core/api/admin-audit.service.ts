import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiDataResponse } from './api-response';

/** Una entrada del registro de auditoría (`GET /api/admin/audit`). */
export interface AuditLogItem {
  id: number;
  /** Quién hizo la acción; el servidor manda solo el identificador. */
  actorId: number | null;
  /** Código de la acción (`entidad.verbo` o el legado en mayúsculas). */
  action: string;
  /** ISO 8601. */
  occurredAt: string;
}

/** Una página del registro: 50 entradas, de la más reciente a la más antigua. */
export interface AuditList {
  items: AuditLogItem[];
  page: number;
  pageSize: number;
  coverage: { shown: number; total: number };
}

/** Filtros que el servidor entiende: `desde` y `hasta` son fechas (AAAA-MM-DD). */
export interface AuditFilterParams {
  readonly actorId?: number;
  readonly action?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly page?: number;
}

/** Consulta administrativa del registro de auditoría (solo el rol que la política `audit.read` permite). */
@Injectable({ providedIn: 'root' })
export class AdminAuditService {
  private readonly http = inject(HttpClient);

  list(filters: AuditFilterParams = {}): Observable<AuditList> {
    let params = new HttpParams();
    if (filters.actorId !== undefined) params = params.set('actorId', filters.actorId);
    if (filters.action) params = params.set('action', filters.action);
    if (filters.desde) params = params.set('desde', filters.desde);
    if (filters.hasta) params = params.set('hasta', filters.hasta);
    if (filters.page !== undefined) params = params.set('page', filters.page);
    return this.http.get<ApiDataResponse<AuditList>>('/api/admin/audit', { params }).pipe(map(response => response.data));
  }
}

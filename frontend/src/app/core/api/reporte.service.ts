import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import { Dashboard, ReporteEstudiante, ReporteGrupo } from '../models/reporte.model';
import { ApiDataResponse } from './api-response';

/**
 * Adaptador de reportes sobre el prefijo de reportes (SIEP-242): tablero, reporte de un grupo por caso, reporte de un
 * estudiante y exportación del grupo. La exportación usa los nombres de parámetro del servidor (`case_version_id`,
 * `formato`), distintos de los de las lecturas (`caseVersionId`).
 */
@Injectable({ providedIn: 'root' })
export class ReporteService {
  private http = inject(HttpClient);
  private readonly API = '/api/reportes';

  getDashboard(): Observable<Dashboard> {
    return this.http.get<ApiDataResponse<Dashboard>>(`${this.API}/dashboard`).pipe(map(r => r.data));
  }

  getReporteGrupo(grupoId: number, caseVersionId?: number | null): Observable<ReporteGrupo> {
    let params = new HttpParams();
    if (caseVersionId != null) params = params.set('caseVersionId', caseVersionId);
    return this.http.get<ApiDataResponse<ReporteGrupo>>(`${this.API}/grupo/${grupoId}`, { params })
      .pipe(map(r => r.data));
  }

  /** Los intentos de un estudiante con su tiempo y la cobertura «X de N»; solo viajan los filtros pedidos. */
  getReporteEstudiante(estudianteId: number, options: { caseVersionId?: number | null; limit?: number } = {}): Observable<ReporteEstudiante> {
    let params = new HttpParams();
    if (options.caseVersionId != null) params = params.set('caseVersionId', options.caseVersionId);
    if (options.limit != null) params = params.set('limit', options.limit);
    // Un estudiante que no es de sus grupos da 403: la pantalla lo explica con su propio estado, así que el interceptor
    // no avisa además con su «No tienes permisos…» genérico.
    const context = new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true);
    return this.http.get<ApiDataResponse<ReporteEstudiante>>(`${this.API}/estudiante/${estudianteId}`, { params, context })
      .pipe(map(r => r.data));
  }

  /** Exporta el grupo en CSV. El servidor exige el caso (`case_version_id`); sin él responde 400. */
  exportarCsv(grupoId: number, caseVersionId: number) {
    const params = new HttpParams().set('case_version_id', caseVersionId).set('formato', 'csv');
    return this.http.get(`${this.API}/grupo/${grupoId}/export`, { params, responseType: 'blob' });
  }
}

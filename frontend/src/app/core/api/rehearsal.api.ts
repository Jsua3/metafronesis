import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { RehearsalAdjustBody, RehearsalBlock, RehearsalStart } from '../models/simulation.model';
import { ApiDataResponse } from './api-response';

/**
 * Ensayo del borrador (contrato 2.1, 7): la docente dueña juega su borrador en el juego real. `start` abre el ensayo
 * (y cierra el anterior); el juego sigue por las rutas normales con el `attemptToken` que devuelve. `adjust` y `read`
 * hablan del bloque `rehearsal`. Un 404 `REHEARSAL_GONE` (ver `isRehearsalGoneError`) pide abrir uno nuevo.
 */
@Injectable({ providedIn: 'root' })
export class RehearsalApi {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/authoring/cases';

  start(caseVersionId: number, desde: number | null): Observable<RehearsalStart> {
    const body = desde === null ? {} : { desde };
    return this.http.post<ApiDataResponse<RehearsalStart>>(`${this.API}/${caseVersionId}/rehearsal`, body).pipe(map(r => r.data));
  }

  adjust(caseVersionId: number, attemptId: string, body: RehearsalAdjustBody): Observable<RehearsalBlock> {
    return this.http
      .patch<ApiDataResponse<{ rehearsal: RehearsalBlock }>>(`${this.API}/${caseVersionId}/rehearsal/${attemptId}`, body)
      .pipe(map(r => r.data.rehearsal));
  }

  read(caseVersionId: number, attemptId: string): Observable<RehearsalBlock> {
    return this.http
      .get<ApiDataResponse<{ rehearsal: RehearsalBlock }>>(`${this.API}/${caseVersionId}/rehearsal/${attemptId}`)
      .pipe(map(r => r.data.rehearsal));
  }
}

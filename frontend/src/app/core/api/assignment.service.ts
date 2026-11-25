import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs/operators';

import { Assignment, AssignmentChanges, AssignmentCreate } from '../models/assignment.model';
import { ApiDataResponse } from './api-response';

/**
 * Asignaciones de casos con ventana de apertura y cierre (C7; RF-14, RF-15, RN-04), de la docente: lista las de un grupo,
 * asigna una versión publicada, cambia su ventana o la pausa, y la retira. Las del estudiante (qué puede iniciar) salen del
 * catálogo, que trae la decisión de acceso ya resuelta.
 */
@Injectable({ providedIn: 'root' })
export class AssignmentService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/assignments';

  list(groupId: number) {
    return this.http.get<ApiDataResponse<Assignment[]>>(this.API, { params: new HttpParams().set('groupId', groupId) })
      .pipe(map(response => response.data));
  }

  /**
   * Todas las asignaciones de los grupos de la docente (sin `groupId`; el servidor devuelve solo las de SUS grupos, y a la
   * administración, todas). Sirven para saber qué casos publicados todavía no están asignados a nadie.
   */
  listAll() {
    return this.http.get<ApiDataResponse<Assignment[]>>(this.API).pipe(map(response => response.data));
  }

  create(body: AssignmentCreate) {
    return this.http.post<ApiDataResponse<Assignment>>(this.API, body).pipe(map(response => response.data));
  }

  update(assignmentId: number, changes: AssignmentChanges) {
    return this.http.patch<ApiDataResponse<Assignment>>(`${this.API}/${assignmentId}`, changes).pipe(map(response => response.data));
  }

  remove(assignmentId: number) {
    return this.http.delete<ApiDataResponse<{ id: number }>>(`${this.API}/${assignmentId}`).pipe(map(response => response.data));
  }
}

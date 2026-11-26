import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { SimulationCaseSummary } from '../models/revision.model';
import { ApiDataResponse } from './api-response';

/** Una fila de `GET /api/authoring/cases`: la versión del caso con su ficha. */
interface AuthoringCaseRow {
  versionId: number;
  status: string;
  revision: number;
  brief: { code: string; title: string; description?: string | null; portada?: string | null; portadaPixelArt?: boolean };
}

/**
 * Casos que ve quien autora o administra, para nombrarlos y elegirlos fuera del editor: asignar un caso a un grupo, usar
 * una rúbrica en un caso y los inicios del docente y de la administración. Es una lectura mínima de
 * `GET /api/authoring/cases`; el editor de casos tiene su propio Adapter para trabajar sobre ellos.
 *
 * El servidor no manda la versión semántica ni el conteo de escenas en esa lista: `semanticVersion` lleva el número de
 * revisión y `nodeCount` va en 0.
 */
@Injectable({ providedIn: 'root' })
export class CaseCatalogApi {
  private readonly http = inject(HttpClient);

  /** Todas las versiones que el usuario puede ver, de cualquier estado. */
  listAll(): Observable<SimulationCaseSummary[]> {
    return this.http.get<ApiDataResponse<AuthoringCaseRow[]>>('/api/authoring/cases').pipe(
      map(response => response.data.map(row => ({
        caseVersionId: row.versionId,
        code: row.brief.code,
        title: row.brief.title,
        description: row.brief.description ?? '',
        semanticVersion: String(row.revision),
        nodeCount: 0,
        status: row.status,
        ...(row.brief.portada !== undefined ? { portada: row.brief.portada, portadaPixelArt: row.brief.portadaPixelArt } : {}),
      }))),
    );
  }

  /** Solo las versiones en borrador: el servidor solo deja asociar una rúbrica a una versión que aún se edita. */
  listDrafts(): Observable<SimulationCaseSummary[]> {
    return this.listAll().pipe(map(cases => cases.filter(item => item.status === 'DRAFT')));
  }

  /** Solo las versiones publicadas: las únicas que se pueden asignar a un grupo. */
  listPublished(): Observable<SimulationCaseSummary[]> {
    return this.listAll().pipe(map(cases => cases.filter(item => item.status === 'PUBLISHED')));
  }
}

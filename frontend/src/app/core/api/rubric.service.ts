import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import type { LevelDescriptors } from '../models/simulation.model';
import { ApiDataResponse as ApiResponse } from './api-response';

export interface RubricCriterionAdmin {
  id?: number;
  competency?: string;
  title: string;
  description?: string | null;
  weight: number;
  displayOrder: number;
  active: boolean;
  /**
   * RK-2 (bloque R0) · Qué significa cada nivel en este criterio (las celdas de la matriz). Al leer trae solo los niveles
   * con texto propio; el que falta se aplica con el descriptor general. Al guardar: ausente = no se toca (lo que hace la
   * pantalla de hoy); presente, REEMPLAZA los cuatro (un nivel vacío o ausente vuelve al general). Texto plano, hasta
   * 600 caracteres por nivel.
   */
  levelDescriptors?: LevelDescriptors;
}

/** RK-3 · De qué caso y versión es una rúbrica propia de una versión («Violencia familiar · v2.1.0 · Publicado»). */
export interface RubricCaseVersionRef {
  id: number;
  title: string;
  semanticVersion: string;
  /** El estado de la versión: `DRAFT`, `IN_REVIEW`, `PUBLISHED` o `ARCHIVED`. */
  status: string;
}

/**
 * RK-3 · Cuánto se usó una rúbrica. `caseVersions`: versiones que se valoran con ella por elección (asignada o propia;
 * la predeterminada «por descarte» no cuenta). `evaluations`: valoraciones de docentes hechas con ella (las del sistema
 * no cuentan). Sirve para avisar antes de cambiar una rúbrica ya usada.
 */
export interface RubricUsage {
  caseVersions: number;
  evaluations: number;
}

/** Una competencia del catálogo del programa (el catálogo de competencias de la API): la fija Psicología, no quien hace la rúbrica. */
export interface CompetencyCatalogItem {
  id: number;
  code: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
}

export interface RubricAdmin {
  id: number;
  /** Quién la creó (ya viajaba; se declara para agrupar «Mis rúbricas»). */
  ownerId?: number | null;
  /** Si quien mira puede modificarla (ya viajaba cuando hay sesión). */
  editable?: boolean;
  /**
   * RK-3 · El caso al que pertenece si es la rúbrica propia de una versión; `null` si es una plantilla de la biblioteca.
   * Ausente con un servidor anterior: la biblioteca no agrupa.
   */
  caseVersion?: RubricCaseVersionRef | null;
  /** RK-3 · Cuánto se usó. Ausente con un servidor anterior: la pantalla no avisa. */
  usage?: RubricUsage;
  name: string;
  description: string | null;
  active: boolean;
  version: string;
  isDefault: boolean;
  totalWeight: number;
  criteriaCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  criteria?: RubricCriterionAdmin[];
}

/**
 * Rúbricas: lo que el editor de casos lee y asigna. ADAPTADOR del servidor de metafronesis, que hoy tiene `POST /api/rubrics`,
 * `GET /api/rubrics/{id}` y `GET|PUT /api/rubrics/case-versions/{id}`. Faltan en ese servidor la lista de rúbricas y el
 * catálogo de competencias: se piden igual donde existe ruta y, donde no, fallan con un 404 explicado
 * para que la pantalla diga que no pudo comprobarlo en lugar de quedarse a medias.
 */
@Injectable({ providedIn: 'root' })
export class RubricService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/rubrics';

  /** La lista de rúbricas que quien edita ve (ruta pendiente en el servidor: hoy responde 405). */
  list() {
    return this.http.get<ApiResponse<RubricAdmin[]>>(this.API).pipe(map(r => r.data));
  }

  detail(id: number) {
    return this.http.get<ApiResponse<RubricAdmin>>(`${this.API}/${id}`).pipe(map(r => r.data));
  }

  create(payload: Partial<RubricAdmin>) {
    return this.http.post<ApiResponse<RubricAdmin>>(this.API, payload).pipe(map(r => r.data));
  }

  /**
   * La rúbrica con que se valora una versión del caso (la asignada, la propia o la predeterminada), si quien pide puede
   * verla. 404 cuando no hay ninguna o no es visible: la pantalla «Rúbrica» del caso lo muestra como «este caso todavía
   * no tiene rúbrica». Para que el caso tenga una propia se usa `AuthoringApi.adoptRubric` (RK-1).
   */
  caseVersionRubric(caseVersionId: number) {
    return this.http.get<ApiResponse<RubricAdmin>>(`${this.API}/case-versions/${caseVersionId}`).pipe(map(r => r.data));
  }

  /** El catálogo de competencias del programa: el servidor de metafronesis aún no tiene la ruta (404 explicado). */
  competencies(): Observable<CompetencyCatalogItem[]> {
    return throwError(() => new HttpErrorResponse({
      status: 404, statusText: 'Not Found',
      error: { success: false, code: 'NOT_AVAILABLE', message: 'El catálogo de competencias aún no está disponible en este servidor.' },
    }));
  }

  assignToCaseVersion(caseVersionId: number, rubricId: number) {
    return this.http.put<ApiResponse<{ caseVersionId: number; rubric: RubricAdmin }>>(
      `${this.API}/case-versions/${caseVersionId}`, { rubricId },
    ).pipe(map(r => r.data));
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, catchError, of, throwError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import type { LevelDescriptors } from '../models/revision.model';
import { ApiDataResponse } from './api-response';

/**
 * E2-2: una rúbrica ajena (la global o la de otra persona) es de solo lectura y el servidor responde 403 al
 * modificarla; la pantalla lo explica con su propio texto. Las órdenes marcan la petición para que el interceptor no
 * avise además «No tienes permisos…».
 */
const SCREEN_EXPLAINS_403 = () => ({ context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true) });

export interface RubricCriterionAdmin {
  id?: number;
  competency?: string;
  /** Id del catálogo de competencias (`GET /api/competencies`); nulo si la competencia es texto libre. */
  competencyId?: number | null;
  title: string;
  description?: string | null;
  weight: number;
  displayOrder: number;
  active: boolean;
  /**
   * Qué significa cada nivel en este criterio (las celdas de la matriz). Al leer trae solo los niveles con texto propio;
   * el que falta se aplica con el descriptor general. Al guardar: ausente = no se toca; presente, REEMPLAZA los cuatro
   * (un nivel vacío o ausente vuelve al general). Texto plano, hasta 600 caracteres por nivel.
   */
  levelDescriptors?: LevelDescriptors;
}

/** De qué caso y versión es una rúbrica propia de una versión («Violencia familiar · v2.1.0 · Publicado»). */
export interface RubricCaseVersionRef {
  id: number;
  title: string;
  semanticVersion: string;
  /** El estado de la versión: `DRAFT`, `IN_REVIEW`, `PUBLISHED` o `ARCHIVED`. */
  status: string;
}

/**
 * Cuánto se usó una rúbrica. `caseVersions`: versiones que se valoran con ella por elección (asignada o propia; la
 * predeterminada «por descarte» no cuenta). `evaluations`: valoraciones de docentes hechas con ella (las del sistema no
 * cuentan). Sirve para avisar antes de cambiar una rúbrica ya usada.
 */
export interface RubricUsage {
  caseVersions: number;
  evaluations: number;
}

/** Una competencia del catálogo del programa (`GET /api/competencies`): la fija Psicología, no quien hace la rúbrica. */
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
  /** Quién la creó (para agrupar «Mis rúbricas»). */
  ownerId?: number | null;
  /** Si quien mira puede modificarla. */
  editable?: boolean;
  /** El caso al que pertenece si es la rúbrica propia de una versión; `null` si es una plantilla de la biblioteca. */
  caseVersion?: RubricCaseVersionRef | null;
  /** Cuánto se usó. */
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

/** Lo que devuelven `GET /api/rubrics/{id}` y `POST /api/rubrics`: los criterios, sin orden ni estado propios. */
interface RubricaMinima {
  id: number;
  name: string;
  criteria: {
    id: number;
    competency: string;
    description: string | null;
    weight: string | number;
    levelDescriptors?: LevelDescriptors | null;
    title?: string;
    displayOrder?: number;
    active?: boolean;
  }[];
}

/** La ficha del listado con los criterios de la lectura por id, en la forma que espera la pantalla. */
function fusionar(ficha: RubricAdmin | undefined, minima: RubricaMinima): RubricAdmin {
  const base: RubricAdmin = ficha ?? {
    id: minima.id, name: minima.name, description: null, active: false, version: '1.0', isDefault: false,
    totalWeight: 0, criteriaCount: minima.criteria.length,
  };
  return {
    ...base,
    criteria: minima.criteria.map((criterio, indice) => ({
      id: criterio.id,
      competency: criterio.competency,
      title: criterio.title ?? criterio.competency,
      description: criterio.description,
      weight: Number(criterio.weight),
      displayOrder: criterio.displayOrder ?? indice + 1,
      active: criterio.active ?? true,
      levelDescriptors: criterio.levelDescriptors ?? {},
    })),
  };
}

/**
 * Adaptador de rúbricas sobre las rutas de metafronesis (`/api/rubrics`, SIEP-236).
 *
 * - `GET /api/rubrics/{id}` solo trae `id`, `name` y los criterios mínimos; la ficha completa (versión, estado, uso, si
 *   es editable) está en el listado. `detail` junta las dos lecturas.
 * - `POST /api/rubrics` solo recibe `name` y los criterios (competencia, descripción, peso, descriptores): `create`
 *   crea y después guarda con `PUT` lo que el alta no lleva (descripción, versión, título de cada criterio).
 */
@Injectable({ providedIn: 'root' })
export class RubricService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/rubrics';

  list(): Observable<RubricAdmin[]> {
    return this.http.get<ApiDataResponse<RubricAdmin[]>>(this.API).pipe(map(r => r.data));
  }

  /**
   * La rúbrica con su ficha y sus criterios. El servidor aún no marca qué criterios están retirados ni manda el título
   * propio de cada uno en esta lectura: mientras no lo haga, el título es la competencia, el orden la posición y todo
   * criterio cuenta como activo (el `PUT` sí devuelve la forma completa, y esa es la que usa la pantalla tras guardar).
   */
  detail(id: number): Observable<RubricAdmin> {
    return this.http.get<ApiDataResponse<RubricaMinima>>(`${this.API}/${id}`).pipe(
      switchMap(response => this.list().pipe(
        map(fichas => fusionar(fichas.find(ficha => ficha.id === id), response.data)),
      )),
    );
  }

  create(payload: Partial<RubricAdmin>): Observable<RubricAdmin> {
    const criterios = payload.criteria ?? [];
    const cuerpo = {
      name: payload.name,
      criteria: criterios.map(criterio => ({
        competency: criterio.competency || criterio.title,
        description: criterio.description ?? '',
        weight: criterio.weight,
        levelDescriptors: criterio.levelDescriptors ?? {},
      })),
    };
    return this.http.post<ApiDataResponse<RubricaMinima>>(this.API, cuerpo).pipe(
      // El alta no lleva descripción, versión ni el título de cada criterio: se completan con el PUT (ya con ids).
      switchMap(response => this.update(response.data.id, {
        ...payload,
        criteria: criterios.map((criterio, indice) => ({ ...criterio, id: response.data.criteria[indice]?.id })),
      })),
    );
  }

  update(id: number, payload: Partial<RubricAdmin>): Observable<RubricAdmin> {
    return this.http.put<ApiDataResponse<RubricAdmin>>(`${this.API}/${id}`, payload, SCREEN_EXPLAINS_403()).pipe(map(r => r.data));
  }

  activate(id: number): Observable<RubricAdmin> {
    return this.http.post<ApiDataResponse<RubricAdmin>>(`${this.API}/${id}/activate`, {}, SCREEN_EXPLAINS_403()).pipe(map(r => r.data));
  }

  deactivate(id: number): Observable<RubricAdmin> {
    return this.http.post<ApiDataResponse<RubricAdmin>>(`${this.API}/${id}/deactivate`, {}, SCREEN_EXPLAINS_403()).pipe(map(r => r.data));
  }

  duplicate(id: number): Observable<RubricAdmin> {
    return this.http.post<ApiDataResponse<RubricAdmin>>(`${this.API}/${id}/duplicate`, {}).pipe(map(r => r.data));
  }

  setDefault(id: number): Observable<RubricAdmin> {
    return this.http.post<ApiDataResponse<RubricAdmin>>(`${this.API}/${id}/default`, {}, SCREEN_EXPLAINS_403()).pipe(map(r => r.data));
  }

  /**
   * La rúbrica con que se valora una versión del caso (la asignada, la propia o la predeterminada), si quien pide puede
   * verla. 404 cuando no hay ninguna o no es visible: la pantalla «Rúbrica» del caso lo muestra como «este caso todavía
   * no tiene rúbrica». Para que el caso tenga una propia se usa `AuthoringApi.adoptRubric`.
   */
  caseVersionRubric(caseVersionId: number): Observable<RubricAdmin | null> {
    return this.http.get<ApiDataResponse<RubricAdmin>>(`${this.API}/case-versions/${caseVersionId}`).pipe(
      map(r => r.data), catchError(error => error.status === 404 ? of(null) : throwError(() => error)),
    );
  }

  /**
   * El catálogo de competencias del programa: la lista «Competencia del programa» del editor de una rúbrica y el origen
   * de «Con las competencias del programa». Trae también las inactivas; quien lo pinta ofrece solo las activas. Sin
   * datos semilla en el servidor, el catálogo sale vacío.
   */
  competencies(): Observable<CompetencyCatalogItem[]> {
    return this.http.get<ApiDataResponse<CompetencyCatalogItem[]>>('/api/competencies').pipe(map(r => r.data));
  }

  /**
   * Usa la rúbrica para valorar una versión del caso (`PUT /api/rubrics/case-versions/{id}`). El servidor responde solo
   * `{ caseVersionId, rubricId }`; el cliente completa la ficha con `detail`. No hay lectura de «la rúbrica de este
   * caso» con forma propia en esta respuesta: la da `caseVersionRubric`.
   */
  assignToCaseVersion(caseVersionId: number, rubricId: number): Observable<{ caseVersionId: number; rubric: RubricAdmin }> {
    return this.http.put<ApiDataResponse<{ caseVersionId: number; rubricId: number }>>(
      `${this.API}/case-versions/${caseVersionId}`,
      { rubricId },
      SCREEN_EXPLAINS_403(),
    ).pipe(
      switchMap(response => this.detail(response.data.rubricId).pipe(
        map(rubric => ({ caseVersionId: response.data.caseVersionId, rubric })),
      )),
    );
  }
}

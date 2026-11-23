import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { SCREEN_HANDLES_FORBIDDEN } from '../auth/http-error-chain';
import type { LevelDescriptors } from '../models/simulation.model';

/**
 * E2-2: una rúbrica ajena (la global o la de otra persona) es de solo lectura y el servidor responde 403 al
 * modificarla; la pantalla lo explica con su propio texto. Las órdenes marcan la petición para que el interceptor no
 * avise además «No tienes permisos…».
 */
const SCREEN_EXPLAINS_403 = () => ({ context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true) });

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

interface ApiResponse<T> {
  data: T;
  message?: string | null;
}

@Injectable({ providedIn: 'root' })
export class RubricService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/rubrics';

  list() {
    return this.http.get<ApiResponse<RubricAdmin[]>>(`${this.API}/`).pipe(map(r => r.data));
  }

  detail(id: number) {
    return this.http.get<ApiResponse<RubricAdmin>>(`${this.API}/${id}`).pipe(map(r => r.data));
  }

  create(payload: Partial<RubricAdmin>) {
    return this.http.post<ApiResponse<RubricAdmin>>(`${this.API}/`, payload).pipe(map(r => r.data));
  }

  update(id: number, payload: Partial<RubricAdmin>) {
    return this.http.put<ApiResponse<RubricAdmin>>(`${this.API}/${id}`, payload, SCREEN_EXPLAINS_403()).pipe(map(r => r.data));
  }

  activate(id: number) {
    return this.http.post<ApiResponse<RubricAdmin>>(`${this.API}/${id}/activate`, {}, SCREEN_EXPLAINS_403()).pipe(map(r => r.data));
  }

  deactivate(id: number) {
    return this.http.post<ApiResponse<RubricAdmin>>(`${this.API}/${id}/deactivate`, {}, SCREEN_EXPLAINS_403()).pipe(map(r => r.data));
  }

  duplicate(id: number) {
    return this.http.post<ApiResponse<RubricAdmin>>(`${this.API}/${id}/duplicate`, {}).pipe(map(r => r.data));
  }

  setDefault(id: number) {
    return this.http.post<ApiResponse<RubricAdmin>>(`${this.API}/${id}/default`, {}, SCREEN_EXPLAINS_403()).pipe(map(r => r.data));
  }

  /**
   * La rúbrica con que se valora una versión del caso (la asignada, la propia o la predeterminada), si quien pide puede
   * verla. 404 cuando no hay ninguna o no es visible: la pantalla «Rúbrica» del caso lo muestra como «este caso todavía
   * no tiene rúbrica». Para que el caso tenga una propia se usa `AuthoringApi.adoptRubric` (RK-1).
   */
  caseVersionRubric(caseVersionId: number) {
    return this.http.get<ApiResponse<RubricAdmin>>(`${this.API}/case-versions/${caseVersionId}`).pipe(map(r => r.data));
  }

  /**
   * El catálogo de competencias del programa: la lista «Competencia del programa» del editor de una rúbrica y el origen
   * de «Con las competencias del programa». Trae también las inactivas (`active: false`); quien lo pinta ofrece solo
   * las activas.
   */
  competencies() {
    return this.http.get<ApiResponse<CompetencyCatalogItem[]>>('/api/competencies').pipe(map(r => r.data));
  }

  assignToCaseVersion(caseVersionId: number, rubricId: number) {
    return this.http.put<ApiResponse<{ caseVersionId: number; rubric: RubricAdmin }>>(
      `${this.API}/case-versions/${caseVersionId}`,
      { rubricId },
      SCREEN_EXPLAINS_403(),
    ).pipe(map(r => r.data));
  }
}

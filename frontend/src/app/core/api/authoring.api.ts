import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { Escenario, LugarResumen } from '../models/biblioteca.model';
import {
  BriefUpdateRequest,
  CaseEditorView,
  CaseLifecycle,
  CaseTransitionRequest,
  CaseValidation,
  CharacterUpsertRequest,
  ChecklistUpdateRequest,
  DecisionOptionUpsertRequest,
  DialogueUpsertRequest,
  EndingRule,
  HintUpsertRequest,
  MapObjectUpsertRequest,
  MapUpsertRequest,
  Milestone,
  NodeUpsertRequest,
  RiskLevel,
  RubricAdoptRequest,
  SimulationCaseSummary,
  ToolUpsertRequest,
  ValidationIssue,
  WorldDefinition,
  WorldDialoguesSaveRequest,
  WorldRoomSaveRequest
} from '../models/simulation.model';
import type {
  Generation,
  GenerationStartRequest,
  GenerationStatus,
} from '../models/generacion.model';
import { ApiDataResponse as ApiResponse } from './api-response';
import type { AssistantGuide, AssistantGuideBody, AssistantProposeBody, AssistantResult, AssistantStatus } from './generated/openapi-contracts';
import { CaseListCache } from './case-list-cache';
import { revisionConflictOf } from './revision-conflict.util';

export interface CaseCreateRequest {
  title: string;
  code?: string | null;
  description?: string | null;
  /** Un lugar de la biblioteca: el caso nace con una copia de las salas elegidas (sin lugar, nace vacío como siempre). */
  lugarId?: string | null;
  /** Ids de las salas del lugar, en el orden pedido (la primera es el inicio); obligatoria con `lugarId`. */
  salas?: string[];
  /** Copiar las salas por piezas si el lugar tiene plantilla por piezas (si no, de imagen fija). El servidor asume `false`. */
  porPiezas?: boolean;
}

/** Cabecera con la revisión que el editor tiene del caso (E2-6): el servidor responde 409 si está vencida. */
export const CASE_REVISION_HEADER = 'X-Case-Revision';

/** Un 409 que dice que el caso ya no es el que se veía: otra sesión lo editó (`REVISION_CONFLICT`) o cambió su estado. */
function isStaleCase(err: unknown): boolean {
  if (revisionConflictOf(err)) return true;
  return err instanceof HttpErrorResponse && err.status === 409
    && (err.error as { code?: unknown } | null)?.code === 'INVALID_TRANSITION';
}

/** Opciones de petición con la revisión vigente; sin revisión no hay cabecera y el servidor no compara. */
const withRevision = (revision?: number | null) =>
  revision == null ? {} : { headers: { [CASE_REVISION_HEADER]: String(revision) } };

/**
 * El cuerpo con la revisión dentro. El servidor la lee del cuerpo en TODAS las rutas del editor y, en las de escenas,
 * decisiones y ficha, SOLO del cuerpo; en las demás también acepta `?revision=` y la cabecera. Por eso viaja en los dos
 * lugares (la cabecera la lleva `withRevision`).
 */
const conRevision = <T extends object>(body: T, revision?: number | null): T & { revision?: number } =>
  revision == null ? body : { ...body, revision };

/** DELETE: el servidor lee la revisión del cuerpo, así que se manda uno. */
const borrando = (revision?: number | null) =>
  revision == null ? {} : { ...withRevision(revision), body: { revision } };

/** Una ruta que el servidor de metafronesis todavía no tiene: falla como un 404 que el interceptor ya sabe explicar. */
const sinRuta = (que: string): Observable<never> => throwError(() => new HttpErrorResponse({
  status: 404, statusText: 'Not Found',
  error: { success: false, code: 'NOT_AVAILABLE', message: `${que} aún no está disponible en este servidor.` },
}));

/** Un código de caso a partir del título, para el servidor que lo exige (la pantalla de crear no lo pide). */
function codigoDe(titulo: string): string {
  const base = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'CASO';
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/** Lo que el servidor dice de una versión al listarla, crearla o clonarla (`servicios.resumen`). */
interface ResumenServidor {
  versionId: number;
  status: string;
  revision: number;
  brief: { code: string; title: string; description: string | null };
}

/**
 * API de autoría: editor de casos (nodos, decisiones, mapas, objetos, herramientas, checklist), publicación y editor de
 * mundo. Separada de `SimulationService` (Interface Segregation): el jugador no necesita ninguno de estos métodos.
 *
 * ADAPTADOR del servidor de metafronesis (`apps/autoria`, `apps/publicacion`, `apps/biblioteca`): las pantallas siguen
 * hablando con los tipos del editor (`CaseEditorView`, …) y esta clase traduce. Lo que el servidor devuelve distinto:
 *  - escenas, decisiones y ficha responden lo suyo (no el editor): se vuelve a leer el editor para devolver la vista
 *    nueva con la revisión siguiente;
 *  - escenas y decisiones aceptan los campos del editor tal cual (solo `goal` aún no se guarda y no se envía);
 *  - el ciclo de vida y la validación salen de `apps/publicacion` (`validate`, `lifecycle`, `publish`, `clone-version`).
 * Rutas sin backend todavía (generación con IA, ensayo, asistente con la forma de v3): fallan con un 404 explicado o
 * responden «apagado».
 */
@Injectable({ providedIn: 'root' })
export class AuthoringApi {
  private readonly http = inject(HttpClient);
  private readonly caseList = inject(CaseListCache);
  private readonly caseChanged = new Subject<number>();
  /**
   * El id de una versión cuyo caso cambió bajo quien lo muestra: una transición aplicada (enviar, aprobar, archivar) o un
   * 409 que dice que su estado o su revisión ya no son los que se veían. Quien tiene abierto ese caso lo relee.
   */
  readonly caseChanges = this.caseChanged.asObservable();
  /** Espacio canónico de la autoría. */
  private readonly API = '/api/authoring/cases';
  /** La biblioteca de lugares: de ahí sale lo que el editor ofrece al crear un caso y al agregar piezas. */
  private readonly API_LUGARES = '/api/biblioteca/lugares';

  caseEditor(caseVersionId: number): Observable<CaseEditorView> {
    return this.http.get<ApiResponse<CaseEditorView>>(`${this.API}/${caseVersionId}/editor`)
      .pipe(map(response => response.data));
  }

  /** Clona la versión (de una publicada o archivada sale un borrador) y devuelve el editor de la copia. */
  cloneCaseVersion(caseVersionId: number) {
    return this.http.post<ApiResponse<{ versionId: number }>>(`${this.API}/${caseVersionId}/clone-version`, {})
      .pipe(switchMap(response => this.caseEditor(response.data.versionId)));
  }

  /** La lista de casos del autor. El servidor trae versión, estado y ficha; el resto del resumen se completa con vacíos. */
  listAuthoringCases() {
    return this.http.get<ApiResponse<ResumenServidor[]>>(this.API).pipe(map(response => response.data.map((v): SimulationCaseSummary => ({
      caseVersionId: v.versionId,
      code: v.brief.code,
      title: v.brief.title,
      description: v.brief.description ?? '',
      // El servidor no manda la versión semántica, el número de escenas ni la fecha de edición en la lista.
      semanticVersion: '',
      nodeCount: 0,
      status: v.status,
    }))));
  }

  /**
   * Crea el borrador. El servidor exige `code` (se genera del título); con `lugarId` y `salas` copia las salas de la
   * biblioteca (por piezas si `porPiezas`). Responde con el resumen, así que se lee el editor para devolver la vista.
   */
  createCase(body: CaseCreateRequest) {
    const cuerpo: Record<string, unknown> = { code: body.code || codigoDe(body.title), title: body.title, description: body.description ?? '' };
    if (body.lugarId) { cuerpo['lugarId'] = body.lugarId; cuerpo['salas'] = body.salas ?? []; }
    if (body.lugarId && body.porPiezas !== undefined) cuerpo['porPiezas'] = body.porPiezas;
    return this.http.post<ApiResponse<ResumenServidor>>(this.API, cuerpo)
      .pipe(switchMap(response => this.caseEditor(response.data.versionId)));
  }

  // ─── Node CRUD ──────────────────────────────────────────────────────────

  /** Cuerpo de una escena: el servidor acepta los nombres del editor (`nodeKey`, `startNode`, `decisionPrompt`). `goal` aún no se guarda. */
  private cuerpoNodo(body: NodeUpsertRequest, revision?: number) {
    const { goal: _goal, ...resto } = body;
    return conRevision(resto, revision);
  }

  createNode(caseVersionId: number, body: NodeUpsertRequest, revision?: number) {
    return this.http.post<unknown>(`${this.API}/${caseVersionId}/nodes`, this.cuerpoNodo(body, revision), withRevision(revision))
      .pipe(switchMap(() => this.caseEditor(caseVersionId)));
  }

  updateNode(caseVersionId: number, nodeId: number, body: NodeUpsertRequest, revision?: number) {
    return this.http.put<unknown>(`${this.API}/${caseVersionId}/nodes/${nodeId}`, this.cuerpoNodo(body, revision), withRevision(revision))
      .pipe(switchMap(() => this.caseEditor(caseVersionId)));
  }

  deleteNode(caseVersionId: number, nodeId: number, revision?: number) {
    return this.http.delete<unknown>(`${this.API}/${caseVersionId}/nodes/${nodeId}`, borrando(revision))
      .pipe(switchMap(() => this.caseEditor(caseVersionId)));
  }

  // ─── Decision CRUD ─────────────────────────────────────────────────────────

  /** Cuerpo de una decisión: el servidor acepta `feedbackText` como sinónimo de `feedback` y guarda todos los campos del editor. */
  private cuerpoDecision(body: DecisionOptionUpsertRequest, revision?: number) {
    return conRevision({ ...body }, revision);
  }

  createDecision(caseVersionId: number, body: DecisionOptionUpsertRequest, revision?: number) {
    return this.http.post<unknown>(`${this.API}/${caseVersionId}/decisions`, this.cuerpoDecision(body, revision), withRevision(revision))
      .pipe(switchMap(() => this.caseEditor(caseVersionId)));
  }

  updateDecision(caseVersionId: number, decisionId: number, body: DecisionOptionUpsertRequest, revision?: number) {
    return this.http.put<unknown>(`${this.API}/${caseVersionId}/decisions/${decisionId}`, this.cuerpoDecision(body, revision), withRevision(revision))
      .pipe(switchMap(() => this.caseEditor(caseVersionId)));
  }

  deleteDecision(caseVersionId: number, decisionId: number, revision?: number) {
    return this.http.delete<unknown>(`${this.API}/${caseVersionId}/decisions/${decisionId}`, borrando(revision))
      .pipe(switchMap(() => this.caseEditor(caseVersionId)));
  }

  // ─── Rutas que responden con el editor completo ───────────────────────────────

  private enviar(metodo: 'POST' | 'PUT' | 'PATCH', url: string, body: object, revision?: number) {
    return this.http.request<ApiResponse<CaseEditorView>>(metodo, url, { body: conRevision(body, revision), ...withRevision(revision) })
      .pipe(map(r => r.data));
  }

  private borrar(url: string, revision?: number) {
    return this.http.delete<ApiResponse<CaseEditorView>>(url, borrando(revision)).pipe(map(r => r.data));
  }

  // ─── Diálogos: uno por sala, con sus líneas ──────────────────────────────

  createDialogue(caseVersionId: number, mapId: number, body: DialogueUpsertRequest, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/maps/${mapId}/dialogues`, body, revision);
  }

  /** Las líneas que lleguen reemplazan a las que había; una línea sin `aiSuggested` conserva la marca de su lugar. */
  updateDialogue(caseVersionId: number, treeId: number, body: DialogueUpsertRequest, revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/dialogues/${treeId}`, body, revision);
  }

  deleteDialogue(caseVersionId: number, treeId: number, revision?: number) {
    return this.borrar(`${this.API}/${caseVersionId}/dialogues/${treeId}`, revision);
  }

  // ─── Lo que propuso la IA: «Revisar» baja la marca de la parte (P5) ───────────

  acceptAiNode(caseVersionId: number, nodeId: number, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/nodes/${nodeId}/accept-ai`, {}, revision);
  }

  acceptAiDecision(caseVersionId: number, decisionId: number, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/decisions/${decisionId}/accept-ai`, {}, revision);
  }

  /** Baja la marca de TODAS las líneas del diálogo. */
  acceptAiDialogue(caseVersionId: number, treeId: number, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/dialogues/${treeId}/accept-ai`, {}, revision);
  }

  acceptAiObject(caseVersionId: number, objectId: number, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/objects/${objectId}/accept-ai`, {}, revision);
  }

  // ─── Map CRUD ──────────────────────────────────────────────────────────

  createMap(caseVersionId: number, body: MapUpsertRequest, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/maps`, body, revision);
  }

  updateMap(caseVersionId: number, mapId: number, body: MapUpsertRequest, revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/maps/${mapId}`, body, revision);
  }

  deleteMap(caseVersionId: number, mapId: number, revision?: number) {
    return this.borrar(`${this.API}/${caseVersionId}/maps/${mapId}`, revision);
  }

  // ─── Map Object CRUD ────────────────────────────────────────────────────────

  createObject(caseVersionId: number, mapId: number, body: MapObjectUpsertRequest, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/maps/${mapId}/objects`, body, revision);
  }

  updateObject(caseVersionId: number, objectId: number, body: MapObjectUpsertRequest, revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/objects/${objectId}`, body, revision);
  }

  deleteObject(caseVersionId: number, objectId: number, revision?: number) {
    return this.borrar(`${this.API}/${caseVersionId}/objects/${objectId}`, revision);
  }

  // ─── Tool CRUD ──────────────────────────────────────────────────────────

  createTool(caseVersionId: number, body: ToolUpsertRequest, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/tools`, body, revision);
  }

  updateTool(caseVersionId: number, toolId: number, body: ToolUpsertRequest, revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/tools/${toolId}`, body, revision);
  }

  deleteTool(caseVersionId: number, toolId: number, revision?: number) {
    return this.borrar(`${this.API}/${caseVersionId}/tools/${toolId}`, revision);
  }

  // ─── Reglas del modelo: hitos, nivel de riesgo y finales (modelo de métricas) ─────────

  /** Reemplaza la lista completa de hitos del caso; el servidor valida cada uno y nombra el campo que falla. */
  updateMilestones(caseVersionId: number, milestones: Milestone[], revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/rules/milestones`, { milestones }, revision);
  }

  /** Fija el nivel de riesgo del caso; `null` lo borra. */
  updateRisk(caseVersionId: number, riskLevel: RiskLevel | null, revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/rules/risk`, { riskLevel }, revision);
  }

  /** Reemplaza la lista completa de finales, en el orden en que se evalúan. */
  updateEndings(caseVersionId: number, endings: EndingRule[], revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/rules/endings`, { endings }, revision);
  }

  // ─── Ayudas, personajes, ficha y orden de las escenas (E3-3 a E3-6) ─────────

  createHint(caseVersionId: number, mapId: number, body: HintUpsertRequest, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/maps/${mapId}/hints`, body, revision);
  }

  updateHint(caseVersionId: number, hintId: number, body: HintUpsertRequest, revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/hints/${hintId}`, body, revision);
  }

  deleteHint(caseVersionId: number, hintId: number, revision?: number) {
    return this.borrar(`${this.API}/${caseVersionId}/hints/${hintId}`, revision);
  }

  createCharacter(caseVersionId: number, body: CharacterUpsertRequest, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/characters`, body, revision);
  }

  updateCharacter(caseVersionId: number, characterId: number, body: CharacterUpsertRequest, revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/characters/${characterId}`, body, revision);
  }

  deleteCharacter(caseVersionId: number, characterId: number, revision?: number) {
    return this.borrar(`${this.API}/${caseVersionId}/characters/${characterId}`, revision);
  }

  /**
   * La ficha del caso: `context` viaja como `narrativeContext`; objetivos, título y temas sensibles (hasta 8) se guardan. Responde con el resumen, así que se vuelve a leer el editor.
   */
  updateBrief(caseVersionId: number, body: BriefUpdateRequest, revision?: number) {
    const cuerpo: Record<string, unknown> = {};
    if (body.context !== undefined) cuerpo['narrativeContext'] = body.context;
    if (body.learningObjectives !== undefined) cuerpo['learningObjectives'] = body.learningObjectives;
    if (body.title !== undefined) cuerpo['title'] = body.title;
    if (body.contentWarnings !== undefined) cuerpo['contentWarnings'] = body.contentWarnings;
    return this.http.put<unknown>(`${this.API}/${caseVersionId}/brief`, conRevision(cuerpo, revision), withRevision(revision))
      .pipe(switchMap(() => this.caseEditor(caseVersionId)));
  }

  /**
   * RK-1 · El caso adopta una rúbrica: el servidor guarda una COPIA propia de la versión. Devuelve la vista del editor con
   * la rúbrica nueva en `rubrics`. Solo en borrador y solo quien autora el caso.
   */
  adoptRubric(caseVersionId: number, body: RubricAdoptRequest, revision?: number) {
    return this.enviar('POST', `${this.API}/${caseVersionId}/rubric`, body, revision);
  }

  /** El orden de las escenas: los ids de TODAS, en el orden pedido (el servidor lo guarda como su posición). */
  reorderNodes(caseVersionId: number, order: number[], revision?: number) {
    return this.enviar('PATCH', `${this.API}/${caseVersionId}/nodes/reorder`, { order }, revision);
  }

  // ─── Asistente de IA de autoría (P5) ────────────────────────────────────────
  // `apps/ia` del servidor: responde con el sobre `{data}`. Errores: 429 `AI_LIMIT_EXCEEDED`, 502 `AI_PROVIDER_ERROR`,
  // 422 `AI_REFUSED` o `AI_PROPOSAL_INVALID`; el panel (`features/autoria/ia`) los traduce.

  /** Si el asistente está listo y cuánto cupo le queda hoy a quien lo usa. */
  assistantStatus(caseVersionId: number): Observable<AssistantStatus> {
    return this.http.get<ApiResponse<AssistantStatus>>(`${this.API}/${caseVersionId}/assistant/status`).pipe(map(r => r.data));
  }

  /** Una propuesta de cambios para la pantalla del editor: el servidor la valida y NO escribe nada (el cliente la aplica). */
  assistantPropose(caseVersionId: number, body: AssistantProposeBody): Observable<AssistantResult> {
    return this.http.post<ApiResponse<AssistantResult>>(`${this.API}/${caseVersionId}/assistant/propose`, body).pipe(map(r => r.data));
  }

  /** La guía («¿cómo hago X?»): la acción del catálogo que responde, o ninguna. */
  assistantGuide(caseVersionId: number, body: AssistantGuideBody): Observable<AssistantGuide> {
    return this.http.post<ApiResponse<AssistantGuide>>(`${this.API}/${caseVersionId}/assistant/guide`, body).pipe(map(r => r.data));
  }

  // ─── Generación de casos con IA, por etapas (C1) ─────────────────────────────
  // Su backend llega en un PR siguiente: las pantallas que la ofrecen están ocultas y estas llamadas fallan con un 404.

  /** Siempre «apagada» (así «Describe tu caso» no se ofrece): no hay nada que preguntarle al servidor todavía. */
  generationStatus(): Observable<GenerationStatus> {
    return of({ enabled: false, remainingToday: 0, inProgress: null } satisfies GenerationStatus);
  }

  startGeneration(_body: GenerationStartRequest): Observable<Generation> {
    return sinRuta('La generación de casos con IA');
  }

  generation(_id: string): Observable<Generation> {
    return sinRuta('La generación de casos con IA');
  }

  generationSkeleton(_id: string): Observable<Generation> {
    return sinRuta('La generación de casos con IA');
  }

  generationScene(_id: string, _clave: string, _repair = false): Observable<Generation> {
    return sinRuta('La generación de casos con IA');
  }

  generationAssemble(_id: string): Observable<Generation> {
    return sinRuta('La generación de casos con IA');
  }

  cancelGeneration(_id: string): Observable<Generation> {
    return sinRuta('La generación de casos con IA');
  }

  // ─── Biblioteca de lugares ───────────────────────────────────────────────────

  /** Los lugares que ofrece la biblioteca, en el orden de su índice. */
  libraryPlaces() {
    return this.http.get<ApiResponse<LugarResumen[]>>(this.API_LUGARES)
      .pipe(map(r => r.data));
  }

  /** Un lugar completo (salas, catálogo, personajes, hitos); las imágenes ya vienen con su dirección pública. */
  libraryPlace(placeId: string) {
    return this.http.get<ApiResponse<Escenario>>(`${this.API_LUGARES}/${encodeURIComponent(placeId)}`)
      .pipe(map(r => r.data));
  }

  /** Un JSON estático que sirve el propio frontend (el manifiesto de piezas de la biblioteca). */
  staticJson(url: string) {
    return this.http.get<unknown>(url);
  }

  // ─── Checklist ──────────────────────────────────────────────────────────

  updateChecklist(caseVersionId: number, body: ChecklistUpdateRequest, revision?: number) {
    return this.enviar('PUT', `${this.API}/${caseVersionId}/checklist`, body, revision);
  }

  // ─── Mundo de cada sala ──────────────────────────────────────────────────

  /** Carga el mundo completo de un nodo/mapa para el editor Konva (`GET …/world`). */
  worldEditor(caseVersionId: number, nodeId?: number) {
    let params = new HttpParams();
    if (nodeId != null) params = params.set('nodeId', nodeId);
    return this.http.get<ApiResponse<WorldDefinition>>(`${this.API}/${caseVersionId}/world`, { params })
      .pipe(map(r => r.data));
  }

  /** Guarda el borrador del mundo (con bloqueo optimista por `revision`, que viaja en el cuerpo). */
  saveWorld(caseVersionId: number, body: WorldRoomSaveRequest | WorldDialoguesSaveRequest, nodeId?: number) {
    let params = new HttpParams();
    if (nodeId != null) params = params.set('nodeId', nodeId);
    return this.http.put<ApiResponse<WorldDefinition>>(`${this.API}/${caseVersionId}/world`, body, { params })
      .pipe(map(r => r.data));
  }

  /** La validación del mundo: el servidor la entrega dentro del mundo que lee (no hay ruta aparte que ejecutar). */
  validateWorld(caseVersionId: number) {
    return this.worldEditor(caseVersionId).pipe(map(mundo => mundo.validation));
  }

  /** El plano de las salas por piezas del caso para el editor (`layout` del contrato 2.2, §5.2, sin sala actual); null si no tiene. */
  casePlan(caseVersionId: number) {
    return this.http.get<ApiResponse<{ plan: unknown }>>(`${this.API}/${caseVersionId}/plan`)
      .pipe(map(response => response.data.plan));
  }

  /** C6: la validación del caso con hallazgos y a qué escena llevar al autor (`where` = `nodes/<id>`). */
  validateCase(caseVersionId: number) {
    return this.http.post<ApiResponse<{ valid: boolean; problems: { code: string; where: string; message: string }[] }>>(
      `${this.API}/${caseVersionId}/validate`, {})
      .pipe(map((response): CaseValidation => {
        const issues = response.data.problems.map((p): ValidationIssue => {
          const nodo = /^nodes\/(\d+)$/.exec(p.where);
          return { code: p.code, severity: 'error', message: p.message, path: p.where, ...(nodo ? { nodeId: Number(nodo[1]) } : {}) };
        });
        return { issues, canPublish: response.data.valid };
      }));
  }

  /** C4: el estado de la versión, las transiciones que quien llama puede hacer, el motivo de bloqueo y la última revisión. */
  lifecycle(caseVersionId: number): Observable<CaseLifecycle> {
    return this.http.get<ApiResponse<CaseLifecycle>>(`${this.API}/${caseVersionId}/lifecycle`).pipe(map(r => r.data));
  }

  /**
   * C4: enviar a revisión, devolver a borrador (`reject`, solo administrador, con `reason` y `note`) y archivar responden con
   * el ciclo resultante; aprobar (`publish`) y clonar (`clone-version`) responden con la versión y se lee su ciclo.
   */
  transitionCase(caseVersionId: number, request: CaseTransitionRequest, revision?: number): Observable<CaseLifecycle> {
    type Version = ApiResponse<{ versionId: number; status: string }>;
    let llamada: Observable<CaseLifecycle>;
    switch (request.action) {
      case 'submit':
      case 'archive':
      case 'reject': {
        const cuerpo: Record<string, unknown> = { action: request.action };
        if (request.reason) cuerpo['reason'] = request.reason;
        if (request.note) cuerpo['note'] = request.note;
        llamada = this.http.post<ApiResponse<CaseLifecycle>>(`${this.API}/${caseVersionId}/lifecycle`, cuerpo, withRevision(revision))
          .pipe(map(r => r.data));
        break;
      }
      case 'approve':
        llamada = this.http.post<Version>(`${this.API}/${caseVersionId}/publish`, {}, withRevision(revision))
          .pipe(switchMap(r => this.lifecycle(r.data.versionId)));
        break;
      case 'clone':
        llamada = this.http.post<Version>(`${this.API}/${caseVersionId}/clone-version`, {})
          .pipe(switchMap(r => this.lifecycle(r.data.versionId)));
        break;
      default:
        return sinRuta('Esa transición');
    }
    return llamada.pipe(
      tap({
        next: () => {
          // Aprobar o archivar cambia qué casos ven los estudiantes: la lista guardada ya no sirve.
          this.caseList.invalidate();
          this.caseChanged.next(caseVersionId);
        },
        error: (err: unknown) => { if (isStaleCase(err)) this.caseChanged.next(caseVersionId); },
      }),
    );
  }

  /** La vista previa del mundo DRAFT: el servidor no tiene una ruta aparte, es el mundo que ya lee el editor. */
  worldPreview(caseVersionId: number, nodeId?: number) {
    return this.worldEditor(caseVersionId, nodeId);
  }
}

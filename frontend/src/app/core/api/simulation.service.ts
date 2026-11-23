import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ApiDataResponse } from './api-response';
import { SCREEN_HANDLES_FORBIDDEN, SCREEN_HANDLES_OFFLINE } from '../auth/http-error-chain';
import { resolveScenarioConfigAssetKey } from '../../features/simulator/scenario-config-assets.util';
import type { ConsentRecordEnvelope, ConsentStateEnvelope, ConsentWithdrawalEnvelope } from './generated/openapi-contracts';
import {
  AttemptCompletionReport,
  CaseAccessReason,
  CaseBrief,
  CatalogItem,
  DecisionConsequence,
  DecisionReaction,
  DecisionRetry,
  HintState,
  InteractionResult,
  OwnerEvaluation,
  ProgressMapState,
  ScenarioConfig,
  SimulationAttemptState,
  SimulationCaseSummary,
  SimulationDecisionResult,
  SimulationWorldState,
  StudentAttemptSummary,
  ToolUseResult,
} from '../models/simulation.model';

// ───────────────────────── Formas de la API de metafronesis (lo que el servidor manda de verdad) ─────────────────────────

/** El intento tal como lo serializan `POST /attempts`, `GET /attempts/{id}`, `resume`, `pause` y `replace` (sin sobre). */
interface AttemptWire {
  id: string;
  case_version: number;
  current_node: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  active_seconds: number;
}

/** El intento abierto y el historial (`GET …/active-attempt`, `GET /attempts/history`): con sobre `{ success, data }`. */
interface AttemptDigestWire {
  attemptId: string | null;
  caseVersionId?: number;
  status?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  currentNodeId?: number | null;
}

/** Una fila del catálogo del estudiante (`GET /catalog`, sin sobre). */
interface CatalogWire {
  case_version_id: number;
  case_id: number;
  title: string;
  completed: boolean;
  allowed: boolean;
  reason: CaseAccessReason | null;
}

/** Un caso de la lista (`GET /cases`, sin sobre). */
interface CaseWire {
  id: number;
  code: string;
  title: string;
  description: string;
  active: boolean;
}

/** La ficha de una versión (`GET …/brief`, con sobre). */
interface BriefWire {
  caseVersionId: number;
  code: string;
  title: string;
  description: string;
  narrativeContext: string;
  learningObjectives: string[];
  estimatedMinutes: number | null;
}

/** La respuesta de una decisión (`POST …/decisions`, sin sobre): solo el resultado de la jugada, no el estado del intento. */
interface DecisionWire {
  attempt: SimulationAttemptState;
  consequence?: DecisionConsequence | null;
  retry?: DecisionRetry | null;
  reaction?: DecisionReaction | null;
}

interface PositionAck {
  attemptId: string;
  status: SimulationAttemptState['status'];
  map: { key: string };
  player: { x: number; y: number };
}

function segundosEntre(desde: string | null | undefined, hasta: string | null | undefined): number | null {
  if (!desde || !hasta) return null;
  const inicio = Date.parse(desde);
  const fin = Date.parse(hasta);
  return Number.isFinite(inicio) && Number.isFinite(fin) && fin >= inicio ? Math.round((fin - inicio) / 1000) : null;
}

/**
 * API del jugador: catálogo, intentos, mundo, interacciones, decisiones, pausa segura y reportes del estudiante, contra
 * el servidor de metafronesis. La sesión es el JWT: no existe `attemptToken`. Las operaciones de autoría y las del
 * docente están en sus propios adaptadores (Interface Segregation).
 *
 * El estado del intento lo entrega el servidor completo (`GET …/state`) y la respuesta de una decisión lo trae en `attempt`.
 */
@Injectable({ providedIn: 'root' })
export class SimulationService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/simulation';
  /** Título de cada versión, para no pedir la ficha en cada jugada. */
  private readonly titulos = new Map<number, string>();

  // ───────────────────────────── Estado del intento ─────────────────────────────

  /** El estado completo del intento (`GET …/state`): escena con narrativa y opciones, persona, informe y recursos de apoyo. */
  private estadoDe(attemptId: string): Observable<SimulationAttemptState> {
    return this.http.get<ApiDataResponse<SimulationAttemptState>>(`${this.API}/attempts/${attemptId}/state`).pipe(map(response => response.data));
  }

  // ───────────────────────────── Catálogo, casos y ficha ─────────────────────────────

  /** El intento tal como está ahora; lo usa el juego para retomar el estado. */
  getAttempt(attemptId: string): Observable<SimulationAttemptState> {
    return this.estadoDe(attemptId);
  }

  /**
   * Los casos del estudiante (los del catálogo, con el código y la descripción del caso). El servidor lista por caso y el
   * catálogo por versión: se unen por el id del caso. No hay conteo de escenas ni versión semántica en la API del
   * jugador: `nodeCount` y `semanticVersion` quedan en `0` y `''`.
   */
  listCases(): Observable<SimulationCaseSummary[]> {
    return forkJoin({
      catalogo: this.http.get<CatalogWire[]>(`${this.API}/catalog`),
      casos: this.http.get<CaseWire[]>(`${this.API}/cases`).pipe(catchError(() => of([] as CaseWire[]))),
    }).pipe(map(({ catalogo, casos }) => catalogo.map(item => {
      const caso = casos.find(candidato => candidato.id === item.case_id);
      return {
        caseVersionId: item.case_version_id,
        caseId: item.case_id,
        code: caso?.code ?? '',
        title: item.title,
        description: caso?.description ?? '',
        semanticVersion: '',
        nodeCount: 0,
        status: 'PUBLISHED',
      };
    })));
  }

  getCatalog(): Observable<CatalogItem[]> {
    return this.http.get<CatalogWire[]>(`${this.API}/catalog`).pipe(map(filas => filas.map((fila, indice) => ({
      caseVersionId: fila.case_version_id,
      code: '',
      title: fila.title,
      description: '',
      order: indice + 1,
      unlocked: fila.allowed,
      completed: fila.completed,
      locked: !fila.allowed,
      access: { allowed: fila.allowed, ...(fila.reason ? { reason: fila.reason } : {}) },
    }))));
  }

  /**
   * La ficha del caso (RF-16): contexto y objetivos, sin crear intento. El servidor no manda personajes, escenas, lugar
   * de inicio ni temas sensibles: salen vacíos. Que el caso tenga aviso de contenido sale del estado del consentimiento.
   */
  getCaseBrief(caseVersionId: number): Observable<CaseBrief> {
    return forkJoin({
      ficha: this.http.get<ApiDataResponse<BriefWire>>(`${this.API}/cases/${caseVersionId}/brief`, {
        context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true),
      }).pipe(map(response => response.data)),
      consentimiento: this.getConsent(caseVersionId).pipe(catchError(() => of(null))),
    }).pipe(map(({ ficha, consentimiento }) => {
      this.titulos.set(ficha.caseVersionId, ficha.title);
      return {
        caseVersionId: ficha.caseVersionId,
        title: ficha.title,
        context: ficha.narrativeContext || ficha.description,
        characters: [],
        learningObjectives: ficha.learningObjectives,
        hasSensitiveContent: consentimiento?.required ?? false,
        access: { allowed: true },
      };
    }));
  }

  // ───────────────────────────── Intentos ─────────────────────────────

  /**
   * Inicia el intento o devuelve el abierto. `forceNew` reemplaza el abierto y empieza otro: `expectedAttemptId` es el
   * intento que la persona aceptó perder; si el abierto ya es otro, el servidor responde 409 `ATTEMPT_CHANGED` y nada se
   * reemplaza. El 403 `ACCESS_*` lo explica la pantalla de juego con el aviso del caso.
   */
  startAttempt(caseVersionId: number, forceNew = false, expectedAttemptId?: string): Observable<SimulationAttemptState> {
    const abrir = () => this.http.post<AttemptWire>(`${this.API}/attempts`,
      { case_version_id: caseVersionId, ...(forceNew && expectedAttemptId ? { expectedAttemptId } : {}) },
      { observe: 'response', context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true) });
    return abrir().pipe(
      switchMap(respuesta => {
        const wire = respuesta.body as AttemptWire;
        // 201 = intento nuevo; 200 = ya había uno abierto, que solo se reemplaza si la persona lo pidió.
        if (!forceNew || respuesta.status === 201) return this.estadoDe(wire.id);
        return this.http.post<AttemptWire>(`${this.API}/attempts/${wire.id}/replace`, {}).pipe(
          switchMap(() => abrir()),
          switchMap(nuevo => this.estadoDe((nuevo.body as AttemptWire).id)),
        );
      }),
    );
  }

  getActiveAttempt(caseVersionId: number): Observable<SimulationAttemptState | null> {
    return this.http.get<ApiDataResponse<AttemptDigestWire>>(`${this.API}/cases/${caseVersionId}/active-attempt`).pipe(
      switchMap(response => {
        const abierto = response.data;
        if (!abierto.attemptId) return of(null);
        return this.estadoDe(abierto.attemptId);
      }),
    );
  }

  /** Reanuda un intento en pausa segura (mismo attemptId, estado intacto). */
  resumeAttempt(attemptId: string): Observable<SimulationAttemptState> {
    return this.http.post<AttemptWire>(`${this.API}/attempts/${attemptId}/resume`, {})
      .pipe(switchMap(wire => this.estadoDe(wire.id)));
  }

  /** Los intentos de la persona, con el título del caso (la API del historial no lo trae: sale del catálogo y de la ficha). */
  attemptHistory(): Observable<StudentAttemptSummary[]> {
    return forkJoin({
      historial: this.http.get<ApiDataResponse<AttemptDigestWire[]>>(`${this.API}/attempts/history`).pipe(map(response => response.data)),
      catalogo: this.http.get<CatalogWire[]>(`${this.API}/catalog`).pipe(catchError(() => of([] as CatalogWire[]))),
    }).pipe(map(({ historial, catalogo }) => historial.filter(fila => fila.attemptId).map(fila => {
      const duracion = segundosEntre(fila.startedAt, fila.endedAt);
      return {
        attemptId: fila.attemptId as string,
        caseVersionId: fila.caseVersionId ?? 0,
        caseTitle: catalogo.find(item => item.case_version_id === fila.caseVersionId)?.title ?? this.titulos.get(fila.caseVersionId ?? 0) ?? '',
        status: (fila.status ?? 'IN_PROGRESS') as SimulationAttemptState['status'],
        totalDurationSeconds: duracion,
        activeDurationSeconds: duracion,
        startedAt: fila.startedAt ?? '',
        endedAt: fila.endedAt ?? null,
      };
    })));
  }

  // ───────────────────────────── Consentimiento ─────────────────────────────

  /**
   * El consentimiento de la persona al aviso de contenido de esta versión del caso (ETH-01): la versión VIGENTE del
   * aviso, si el servidor exige el consentimiento y si ya lo aceptó. Los tipos salen del esquema OpenAPI generado.
   */
  getConsent(caseVersionId: number) {
    return this.http.get<ConsentStateEnvelope>(`${this.API}/cases/${caseVersionId}/consent`).pipe(map(response => response.data));
  }

  /** Registra la aceptación del aviso (201 si es nueva, 200 si ya existía); si no es la versión vigente, 409 `NOTICE_VERSION_STALE`. */
  acceptConsent(caseVersionId: number, noticeVersion: string) {
    return this.http.post<ConsentRecordEnvelope>(`${this.API}/cases/${caseVersionId}/consent`, { noticeVersion }).pipe(map(response => response.data));
  }

  /** Retira el consentimiento (idempotente): impide seguir jugando ese caso y no borra lo hecho. */
  withdrawConsent(caseVersionId: number) {
    return this.http.delete<ConsentWithdrawalEnvelope>(`${this.API}/cases/${caseVersionId}/consent`).pipe(map(response => response.data));
  }

  // ───────────────────────────── Mundo ─────────────────────────────

  /** Las pistas de la escena actual: lo que el intento ya pidió y cuántas quedan. */
  getHints(attemptId: string): Observable<HintState> {
    return this.http.get<ApiDataResponse<HintState>>(`${this.API}/attempts/${attemptId}/hints`).pipe(map(response => response.data));
  }

  /** Pide la siguiente pista (sin costo). `requestId` la hace idempotente: un doble clic revela una sola. */
  revealNextHint(attemptId: string, requestId: string): Observable<HintState> {
    return this.http.post<ApiDataResponse<HintState>>(`${this.API}/attempts/${attemptId}/hints/next`, { requestId }).pipe(map(response => response.data));
  }

  getProgressMap(attemptId: string): Observable<ProgressMapState> {
    return this.http.get<ApiDataResponse<ProgressMapState>>(`${this.API}/attempts/${attemptId}/progress-map`).pipe(map(response => response.data));
  }

  getWorld(attemptId: string): Observable<SimulationWorldState> {
    return this.http.get<ApiDataResponse<SimulationWorldState>>(`${this.API}/attempts/${attemptId}/world`).pipe(map(response => response.data));
  }

  getScenarioConfig(mapOrScenarioKey: string): Observable<ScenarioConfig> {
    const assetKey = resolveScenarioConfigAssetKey(mapOrScenarioKey);
    return this.http.get<ScenarioConfig>(`/assets/game/scenarios/${assetKey}.json`);
  }

  /** Pasar por una puerta a otra sala (sin puntaje). `doorKey` es obligatorio: el servidor deriva la entrada de sus metadatos. */
  enterRoom(attemptId: string, targetNodeKey: string, doorKey: string): Observable<SimulationWorldState> {
    return this.http.post<ApiDataResponse<SimulationWorldState>>(`${this.API}/attempts/${attemptId}/enter-room`, { targetNodeKey, doorKey })
      .pipe(map(response => response.data));
  }

  /** `screenHandlesOffline`: la posición que viaja con la pausa; sin red la explica la pantalla de pausa, no el aviso global. */
  updateWorldState(attemptId: string, playerX: number, playerY: number, currentMapKey: string, screenHandlesOffline = false): Observable<PositionAck> {
    return this.http.patch<ApiDataResponse<PositionAck>>(`${this.API}/attempts/${attemptId}/world-state`, {
      playerX,
      playerY,
      currentMapKey,
    }, screenHandlesOffline ? { context: new HttpContext().set(SCREEN_HANDLES_OFFLINE, true) } : {}).pipe(map(response => response.data));
  }

  openInteraction(attemptId: string, interactionKey: string): Observable<InteractionResult> {
    return this.http.post<ApiDataResponse<InteractionResult>>(`${this.API}/attempts/${attemptId}/interactions/${encodeURIComponent(interactionKey)}`, {})
      .pipe(map(response => response.data));
  }

  useTool(attemptId: string, toolCode: string, targetInteractionKey: string | null): Observable<ToolUseResult> {
    return this.http.post<ApiDataResponse<ToolUseResult>>(`${this.API}/attempts/${attemptId}/tools/use`, { toolCode, targetInteractionKey })
      .pipe(map(response => response.data));
  }

  recordNpcInteraction(attemptId: string, npcKey: string): Observable<SimulationWorldState> {
    return this.http.post<ApiDataResponse<SimulationWorldState>>(`${this.API}/attempts/${attemptId}/npcs/${encodeURIComponent(npcKey)}`, {})
      .pipe(map(response => response.data));
  }

  // ───────────────────────────── Decisiones, bitácora, pausa y reportes ─────────────────────────────

  /**
   * Registra una decisión. `requestId` identifica la INTENCIÓN de elegir la opción: quien llama lo reutiliza si reenvía la
   * misma elección tras un fallo de red, y el servidor responde la repetición sin decidir dos veces (el servidor lo exige:
   * sin él se genera uno). La respuesta del servidor solo dice si hay reintento y trae la reacción; el estado nuevo del
   * intento se lee después. La consecuencia en texto no la manda el servidor: `consequence` es `null`.
   */
  chooseDecision(attemptId: string, decisionOptionId: number, requestId?: string): Observable<SimulationDecisionResult> {
    const solicitud = requestId ?? (globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    return this.http.post<DecisionWire>(`${this.API}/attempts/${attemptId}/decisions`, {
      decision_option_id: decisionOptionId,
      request_id: solicitud,
    }).pipe(map(({ attempt, consequence, retry, reaction }) => ({
      ...attempt,
      consequence: consequence ?? null,
      retry: retry ?? null,
      reaction: reaction ?? null,
    })));
  }

  saveReflection(attemptId: string, nodeId: number, text: string): Observable<{ nodeId: number; locked: boolean }> {
    return this.http.post<ApiDataResponse<{ nodeId: number; locked: boolean }>>(`${this.API}/attempts/${attemptId}/reflections`, { nodeId, text })
      .pipe(map(response => response.data));
  }

  safeExit(attemptId: string, reason: string): Observable<SimulationAttemptState> {
    // Sin red, la pantalla de pausa ya lo dice (REGLA-004): el aviso global de conexión no le tapa el título.
    return this.http.post<ApiDataResponse<SimulationAttemptState>>(`${this.API}/attempts/${attemptId}/safe-exit`, { reason },
      { context: new HttpContext().set(SCREEN_HANDLES_OFFLINE, true) }).pipe(map(response => response.data));
  }

  /**
   * La retroalimentación del docente tal como la lee el dueño del intento. El servidor la manda como un solo comentario
   * en `GET …/result` (sin niveles por criterio): se presenta como una valoración sin niveles. Mientras el intento no
   * termina, el servidor responde 409 y no hay retroalimentación.
   */
  getOwnerEvaluation(attemptId: string): Observable<OwnerEvaluation> {
    return this.http.get<ApiDataResponse<{ teacherFeedback: string | null }>>(`${this.API}/attempts/${attemptId}/result`, {
      context: new HttpContext().set(SCREEN_HANDLES_FORBIDDEN, true),
    }).pipe(map(response => response.data.teacherFeedback), catchError(error => (error?.status === 409 ? of(null) : throwError(() => error))), map(comentario => ({
      attemptId,
      evaluations: comentario
        ? [{ rubricName: '', origin: 'DOCENTE' as const, evaluatedAt: null, comment: comentario, overallLevel: null, criteria: [] }]
        : [],
    })));
  }

  studentReport(attemptId: string): Observable<AttemptCompletionReport> {
    return this.http.get<ApiDataResponse<AttemptCompletionReport>>(`${this.API}/attempts/${attemptId}/student-report`)
      .pipe(map(response => ({ ...response.data, phaseDurations: response.data.phaseDurations ?? [] })));
  }
}

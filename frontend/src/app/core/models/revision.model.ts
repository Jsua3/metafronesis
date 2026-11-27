export interface SimulationCaseSummary {
  caseVersionId: number;
  code: string;
  title: string;
  description: string;
  semanticVersion: string;
  nodeCount: number;
  status: string;
  // BK-4: solo los trae la lista de autoría (`AuthoringApi.listAuthoringCases`); la del jugador no. Por eso opcionales.
  /** El caso al que pertenece la versión: agrupa las versiones de un mismo caso (lista del ADMIN). */
  caseId?: number;
  /** La última edición (hora de Bogotá, sin zona); en lo editado antes de registrarla, la publicación o la creación. */
  updatedAt?: string | null;
  /** Escenas con narración y, si no son un final, al menos una respuesta: «3 de 5 escenas con guion». */
  escenasConGuion?: number;
  /** Portada de la versión (ver `CatalogItem.portada`). */
  portada?: string | null;
  portadaPixelArt?: boolean;
}

/** La clase de una respuesta (modelo de métricas): la única etiqueta que el docente y el reporte congelado comparten. */
export type ResponseClass = 'RECOMMENDED' | 'ACCEPTABLE' | 'RISKY' | 'CONTRAINDICATED';

/** Vínculo de la persona consultante con quien la atiende: retraída, cautelosa o abierta. */
export type Bond = 'WITHDRAWN' | 'GUARDED' | 'OPEN';

/** Activación de la persona consultante: serena, tensa o en crisis. */
export type Activation = 'CALM' | 'TENSE' | 'CRISIS';

/**
 * La persona consultante en palabras (Tarea 9): vínculo y activación sin cifras. `label` es la frase para el
 * estudiante («se muestra cautelosa y tensa»).
 */
export interface Persona {
  bond: Bond;
  activation: Activation;
  label: string;
}

/** La persona después de decidir en una escena (traza docente, `personaPorEscena`). */
export interface PersonaPorEscena extends Persona {
  nodeId: number;
  nodeTitle: string;
}

/** Un hito del caso en un reporte: `decisive` marca los que deciden el final. */
export interface MilestoneEntry {
  key: string;
  label: string;
  decisive: boolean;
}

/** Los hitos de un intento: los cumplidos (en el orden en que se cumplieron) y los que faltaron. */
export interface MilestoneReport {
  done: MilestoneEntry[];
  missing: MilestoneEntry[];
}

/** Cuántas decisiones registradas hubo de cada clase (traza docente y reporte v3). */
export interface ClassCounts {
  recommended: number;
  acceptable: number;
  risky: number;
  contraindicated: number;
}

export interface AttemptTimelineEntry {
  atSeconds: number | null;
  time: string;
  type: string;
  class: ResponseClass | null;
  prohibited: boolean;
  label: string;
}

/** El nivel de una competencia en el reporte congelado; `level` es nulo si no hubo evidencia suficiente. */
export interface CompetencyLevelEntry {
  code: string;
  name: string;
  level: FormativeLevel | null;
  /** Con qué se calculó el nivel, en palabras; nulo si ninguna decisión tocó la competencia. */
  basis: string | null;
  evidence: CompetencyEvidenceDecision[];
}

/**
 * El final del intento (Tarea 8): sale de los hitos y las clases de respuesta. `key` es el del final de la plantilla
 * (`critica`, `protectora`, `riesgo_persistente`, `con_brechas`) o uno propio del caso; `reason` lo explica en palabras.
 */
export interface EndingReport {
  key: string;
  title: string;
  message: string;
  tone: 'positive' | 'neutral' | 'warning' | 'critical';
  reason: string[];
}

export interface PhaseDuration {
  nodeId: number;
  nodeTitle: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export interface AttemptTrace {
  attemptId: string;
  /** V5: la versión del caso (el enlace al editor) y si alguna de sus respuestas declara competencias. */
  caseVersionId?: number;
  competenciesDeclared?: boolean;
  studentAlias: string;
  caseTitle: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalDurationSeconds: number | null;
  /** El servidor no la manda en la traza. */
  phaseDurations?: PhaseDuration[];
  /** Tiempo con la persona jugando, en segundos. */
  activeSeconds: number;
  /** Decisiones registradas por clase de respuesta. */
  counts: ClassCounts;
  /** Los hitos cumplidos y los que faltaron. */
  milestones: MilestoneReport;
  /** La persona después de decidir en cada escena. */
  personaPorEscena: PersonaPorEscena[];
  /** El final del intento; nulo si no se completó. */
  ending: EndingReport | null;
  /** Primeras respuestas que el juego no aplicó (reintento): no entran en los contadores de decisiones (T11.1, L-02). */
  retries?: number;
  prohibitedRetries?: number;
  safeExitUsed: boolean;
  timeline: AttemptTimelineEntry[];
  visitedNodeTitles: string[];
  events: TraceEvent[];
  /** El backend aún no lo calcula en la traza (devuelve `null`). */
  world: unknown | null;
  reflections: ReflectionTrace[];
  rubricEvaluations: RubricSummary[];
  /** La valoración automática; plegada (nula) hasta que el docente guarda la suya. */
  systemEvaluation: SystemEvaluation | null;
  /** Hay una valoración automática que mostrar cuando el docente registre la suya. */
  systemEvaluationAvailable: boolean;
  /**
   * RK-4 (bloque R0) · Por cada competencia de la rúbrica con que se valora el intento, las decisiones registradas que la
   * tocan: las fichas de «Evidencia» junto a cada criterio. A propósito no trae ningún nivel (ni el de cada decisión ni
   * el que calculó el sistema): la valoración automática sigue plegada hasta que el docente guarda la suya. Opcional:
   * sin ella el panel de valoración no pinta las fichas. Vacía si el caso no tiene rúbrica.
   */
  evidenceByCompetency?: CompetencyEvidence[];
}

/** RK-4 · Las decisiones del intento que tocan una competencia de la rúbrica, en el orden en que se tomaron. */
export interface CompetencyEvidence {
  /** El mismo código que `RubricCriterionView.competency` y `competencyLevels[].code`: así se emparejan con el criterio. */
  code: string;
  /** El nombre de la competencia en el catálogo, para mostrar en vez del código. */
  name: string;
  items: CompetencyEvidenceItem[];
}

/** RK-4 · Una decisión que sirve de evidencia: dónde, qué eligió y su clase. Sin nivel ni puntaje. */
export interface CompetencyEvidenceItem {
  /** Su posición entre las decisiones registradas (desde 1): la misma que usa la columna de evidencia para resaltarla. */
  order: number;
  nodeTitle: string;
  optionText: string;
  class: ResponseClass | null;
  /** Segundos desde que empezó el intento; nulo si falta alguna de las dos marcas de tiempo. */
  atSeconds: number | null;
}

/** La valoración automática del sistema que ve el docente tras registrar la suya: resumen y perfil por competencia. */
export interface SystemEvaluation extends RubricSummary {
  competencyLevels: CompetencyLevelEntry[];
}

export interface TraceEvent {
  type: string;
  class: ResponseClass | null;
  nodeTitle: string | null;
  decisionText: string | null;
  detail: string | null;
  occurredAt: string;
}

export interface ReflectionTrace {
  nodeId: number;
  nodeTitle: string;
  text: string;
  locked: boolean;
}

/** Niveles cualitativos de la valoración formativa (RN-09, ED-2): no son una nota. */
export type FormativeLevel = 'EN_INICIO' | 'EN_PROCESO' | 'LOGRADO' | 'DESTACADO';

export interface RubricSummary {
  id: number;
  rubricName: string;
  /** Quién la hizo: el docente o el sistema. */
  origin?: 'DOCENTE' | 'SISTEMA';
  /** Nivel global de la evaluación; null mientras falte calificar algún criterio. */
  overallLevel?: FormativeLevel | null;
  comment: string | null;
  evaluatedAt: string;
}

/**
 * BK-3 · El estado de la valoración del docente sobre un intento. `APLICADA`: ya hay una valoración concluida (la que el
 * estudiante ve). `PENDIENTE`: el intento terminó, el caso se valora con una rúbrica y no hay valoración concluida (una
 * guardada a medias sigue pendiente). `NO_APLICA`: el intento no terminó o el caso no tiene rúbrica.
 */
export type EvaluationStatus = 'PENDIENTE' | 'APLICADA' | 'NO_APLICA';

export interface RecentAttempt {
  attemptId: string;
  studentAlias: string;
  caseTitle: string;
  status: string;
  startedAt: string;
  // BK-3 (opcionales: el Inicio docente funciona sin ellos, con menos detalle).
  caseVersionId?: number;
  /** Cuándo terminó: «terminó hace 2 días». `null` mientras el intento sigue abierto. */
  endedAt?: string | null;
  evaluationStatus?: EvaluationStatus;
}

/** Un intento en la revisión docente (`GET /api/instructor/attempts`). El estudiante va solo por su alias. */
export interface InstructorAttemptItem {
  attemptId: string;
  studentAlias: string;
  caseVersionId: number;
  caseVersionStatus: string;
  caseTitle: string;
  status: AttemptStatus;
  activeSeconds: number;
  startedAt: string;
  endedAt: string | null;
  /** BK-3. Opcional: sin él la bandeja filtra en el cliente por `status === 'COMPLETED'` (con una nota). */
  evaluationStatus?: EvaluationStatus;
}

/** Una página de la revisión docente: los intentos, del más reciente al más antiguo, y cuántos hay en total. */
export interface InstructorAttemptsPage {
  items: InstructorAttemptItem[];
  page: number;
  pageSize: number;
  coverage: { shown: number; total: number };
}

/** Los filtros de `InstructorApi.listAttempts`. Todos opcionales; un filtro ausente no se manda. */
export interface InstructorAttemptsQuery {
  caseVersionId?: number;
  estado?: AttemptStatus;
  /** BK-3: `pendiente` = por revisar (terminados sin valoración concluida); `aplicada` = ya valorados. */
  evaluacion?: 'pendiente' | 'aplicada';
  page?: number;
  pageSize?: number;
}

export interface RubricEvaluationView {
  attemptId?: string;
  rubricId: number;
  rubricName: string;
  description: string | null;
  status?: string;
  criteria: RubricCriterionView[];
  scores: CriterionScoreView[];
  /** Los cuatro niveles que el docente elige, con su descriptor (Tarea 12); la rúbrica se califica solo por niveles. */
  levels?: RubricLevelOption[];
  /** Nivel global de la valoración formativa (RN-09); null mientras falte calificar algún criterio. */
  overallLevel?: FormativeLevel | null;
  comment: string | null;
}

export interface RubricCriterionView {
  id: number;
  competency: string;
  title: string;
  description: string | null;
  weight?: number;
  displayOrder: number;
  /** Si el criterio cuenta. Lo trae la vista del editor (RK-2); la de valorar solo lista los activos. */
  active?: boolean;
  /**
   * RK-2 (bloque R0) · Qué significa cada nivel EN ESTE criterio. Solo trae los niveles con texto propio: el que falta
   * se lee con el descriptor general (`RubricLevelOption.descriptor`, ver `descriptorDelNivel`). Ausente con un servidor
   * anterior, que equivale a `{}`.
   */
  levelDescriptors?: LevelDescriptors;
}

/** RK-2 · Los descriptores propios de un criterio, por nivel. Un nivel ausente usa el descriptor general. */
export type LevelDescriptors = Partial<Record<FormativeLevel, string>>;

/**
 * RK-2 · Qué significa `level` en `criterion`: el descriptor propio si lo tiene; si no, el general de `levels`. Es la
 * misma regla que el servidor aplica al estudiante (RK-6), en un solo sitio para la matriz, el panel de valoración y la
 * vista «Así la lee el estudiante». `null` sin nivel o si no hay con qué explicarlo.
 */
export function descriptorDelNivel(
  criterion: Pick<RubricCriterionView, 'levelDescriptors'>,
  level: FormativeLevel | null | undefined,
  levels: readonly RubricLevelOption[] = [],
): string | null {
  if (!level) return null;
  const propio = criterion.levelDescriptors?.[level]?.trim();
  if (propio) return propio;
  return levels.find(option => option.value === level)?.descriptor ?? null;
}

/** Un nivel que el docente puede elegir en un criterio: valor, nombre y descriptor. */
export interface RubricLevelOption {
  value: FormativeLevel;
  label: string;
  descriptor: string;
}

export interface CriterionScoreView {
  criterionId: number;
  /** Nivel formativo de este criterio; nulo mientras no se califica. */
  level?: FormativeLevel | null;
  comment: string | null;
  evidence: Record<string, unknown>;
}

/** Estado de un intento tal como lo manda el servidor (`IN_PROGRESS`, `PAUSED`, `COMPLETED`, `REPLACED`, ...). */
export type AttemptStatus = 'IN_PROGRESS' | 'PAUSED' | 'SAFE_EXITED' | 'COMPLETED' | 'INCOMPLETE' | 'REPLACED';


// ── Tipos que comparten la valoración y el cierre del estudiante ──

/** Una decisión que sostiene el nivel de una competencia (reporte v3, `competencyLevels[].evidence[]`). */
export interface CompetencyEvidenceDecision {
  order: number;
  nodeTitle: string;
  optionText: string;
  class: ResponseClass;
  level: FormativeLevel | null;
}

/** Qué hizo falta explorar antes de una opción: hablar, inspeccionar, tener o usar algo (contrato 2.1, §4.5). */
export type ExploredFactKind = 'talked' | 'inspected' | 'has' | 'used';

export interface MissedFact {
  kind: ExploredFactKind;
  key: string;
  label: string;
}

/** BK-5 · Un criterio de la valoración que lee el dueño del intento: el nivel en palabras, nunca un número (RN-09). */
export interface OwnerEvaluationCriterion {
  criterionId: number;
  title: string;
  /** Nulo si el criterio quedó sin nivel. */
  level: FormativeLevel | null;
  /** La observación del docente para este criterio; vacía si no escribió ninguna. */
  comment: string;
  /**
   * RK-6 (bloque R0) · Qué significa ese nivel en ese criterio, en palabras: el descriptor propio del criterio (RK-2) o,
   * si no lo tiene, el general del nivel. Nunca un número. Ausente si el criterio no tiene nivel o con un servidor
   * anterior: la pieza muestra entonces solo el nivel y la observación.
   */
  descriptor?: string;
}

/** BK-5 · Una valoración concluida del docente tal como la lee el estudiante dueño del intento. */
export interface OwnerEvaluationEntry {
  rubricName: string;
  /** Siempre `DOCENTE`: la del sistema le llega al estudiante en su reporte, no aquí. */
  origin: 'DOCENTE' | 'SISTEMA';
  evaluatedAt: string | null;
  /** El comentario general; vacío si no escribió ninguno. */
  comment: string;
  /** El nivel global en palabras; nulo si no se puede resumir. */
  overallLevel: FormativeLevel | null;
  criteria: OwnerEvaluationCriterion[];
}

/**
 * BK-5 · `GET /api/simulation/attempts/{id}/evaluation`: solo el dueño del intento la lee (otro estudiante, 403) y solo
 * trae las valoraciones CONCLUIDAS del docente, sin ningún número. Lista vacía: aún no hay retroalimentación.
 */
export interface OwnerEvaluation {
  attemptId: string;
  evaluations: OwnerEvaluationEntry[];
}


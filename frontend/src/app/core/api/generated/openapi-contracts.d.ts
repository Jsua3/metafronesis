// ARCHIVO GENERADO AUTOMÁTICAMENTE DESDE EL CONTRATO OPENAPI (E5-9 · DJG-6).
// No editar a mano: regenerar con `node scripts/openapi/generate-types.mjs`.

/** La decisión de acceso del estudiante a una versión de caso: si puede empezar y, si no, por qué. */
export interface AccessDecision {
  readonly allowed: boolean;
  /** Cierre de la ventana. ISO 8601 con el desfase de Bogotá (-05:00). */
  readonly closesAt?: string;
  /** Apertura de la ventana. ISO 8601 con el desfase de Bogotá (-05:00). */
  readonly opensAt?: string;
  /** Solo si `allowed` es falso. */
  readonly reason?: AccessReasonEnum;
}

export type AccessReasonEnum = 'NOT_ASSIGNED' | 'NOT_YET_OPEN' | 'CLOSED' | 'LOCKED_BY_SEQUENCE';

export type ActivationEnum = 'CALM' | 'TENSE' | 'CRISIS';

/** RQ-NEG-002 · estudiantes con algún intento cuyas competencias con nivel están todas en el nivel aceptable o más. */
export interface AnalyticsAcceptable {
  readonly achieved: number;
  /** El nivel aceptable con el que se calculó. */
  readonly levelThreshold: FormativeLevelEnum;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly pct: number;
  /** Estudiantes con al menos un intento con alguna competencia con nivel. */
  readonly students: number;
}

/** Quién aporta datos. Con `suppressed` verdadero solo viajan este bloque y `definitions`. */
export interface AnalyticsCohort {
  /** Intentos completados en el alcance. */
  readonly attempts: number;
  /** Estudiantes distintos con al menos un intento completado en el alcance. */
  readonly students: number;
  /** Verdadero si hay menos estudiantes que la celda mínima. */
  readonly suppressed: boolean;
}

/** Con qué reglas se calculó. Mientras `status` sea `BORRADOR` ninguna cifra es oficial. */
export interface AnalyticsDefinitions {
  readonly acceptableLevel: FormativeLevelEnum;
  /** Celda mínima: estudiantes distintos que hacen falta para publicar un bloque. */
  readonly minCell: number;
  /** Versión de la regla que convierte decisiones en niveles; solo se cuentan los intentos calculados con ella. */
  readonly profileRules: string;
  readonly reflectionDefinition: ReflectionDefinitionEnum;
  readonly status: AnalyticsDefinitionsStatusEnum;
}

export type AnalyticsDefinitionsStatusEnum = 'BORRADOR';

/** RQ-NEG-005 · intentos con evaluación automática completa y con evaluación del docente comentada. */
export interface AnalyticsEvaluated {
  readonly attempts: number;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly commentedPct: number;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly systemPct: number;
}

/** RQ-NEG-003 · decisiones no recomendadas del primer frente al segundo intento (se omite si el primero no tuvo). */
export interface AnalyticsFirstVsSecond {
  /** Media de no recomendadas del primer intento, con dos decimales. */
  readonly firstMean: number;
  /** Cambio de la media. Cambio en porcentaje (puede ser negativo), con un decimal. */
  readonly nonRecommendedDeltaPct: number;
  /** Media de no recomendadas del segundo intento, con dos decimales. */
  readonly secondMean: number;
  readonly series: number;
  readonly students: number;
}

/** RQ-NEG-001 · primer frente al último intento de cada serie (estudiante, caso) con al menos dos intentos. */
export interface AnalyticsImprovement {
  /** Mejora como porcentaje del recorrido posible (3 puntos). Cambio en porcentaje (puede ser negativo), con un decimal. */
  readonly deltaPct: number;
  /** Media del índice del último intento. Índice interno de 1 a 4 (no es una nota), con dos decimales. */
  readonly post: number;
  /** Media del índice del primer intento. Índice interno de 1 a 4 (no es una nota), con dos decimales. */
  readonly pre: number;
  readonly series: number;
  readonly students: number;
}

/** RQ-NEG-005 · mejora entre intentos consecutivos cuando se vio la retroalimentación antes del siguiente. */
export interface AnalyticsImprovementAfterFeedback {
  /** Mejora como porcentaje del recorrido posible (3 puntos). Cambio en porcentaje (puede ser negativo), con un decimal. */
  readonly deltaPct: number;
  readonly pairs: number;
  readonly students: number;
}

/** RQ-NEG-004 · intentos que son evidencia clave de aprendizaje (completados, con reflexión y con perfil). */
export interface AnalyticsKeyEvidence {
  readonly attempts: number;
  readonly keyEvidence: number;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly pct: number;
}

/** Cobertura de un hito del caso entre los intentos cerrados que traen hitos (reporte v3): ¿lo cumplió la mayoría? */
export interface AnalyticsMilestone {
  /** `MAYORIA` si al menos la mitad de los intentos lo cumplió. */
  readonly category: CategoryEnum;
  /** Verdadero si el hito decide el final del caso. */
  readonly decisive: boolean;
  readonly key: string;
  /** La del caso; si la consulta abarca varias versiones, la propia clave. */
  readonly label: string;
  /** Solo con 20 estudiantes distintos o más; antes, nulo (un porcentaje identifica a personas). Porcentaje de 0 a 100, con un decimal. */
  readonly share: number | null;
}

/** RQ-NEG-003 · intentos con reflexión, según la definición vigente (los cerrados con otra no se mezclan). */
export interface AnalyticsReflection {
  readonly attempts: number;
  readonly covered: number;
  readonly definition: ReflectionDefinitionEnum;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly pct: number;
}

/** RQ-NEG-004 · respuestas de la encuesta con 4 o 5 de 5. Solo existe con la encuesta encendida. */
export interface AnalyticsSatisfaction {
  readonly responses: number;
  /** Porcentaje de 0 a 100, con un decimal. */
  readonly satisfiedPct: number;
}

/** Sobre de éxito de la API: `{success, message?, data?}` (`shared.response.envelope`). `message` y `data` solo viajan cuando tienen valor. Los endpoints que aún no se tipan llevan este sobre con `data` sin forma. */
export interface ApiEnvelope {
  readonly data?: unknown;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Una versión de caso asignada, con su ventana de apertura y cierre (C7). */
export interface Assignment {
  /** Una asignación en pausa no habilita nada. */
  readonly active: boolean;
  readonly caseTitle: string | null;
  readonly caseVersionId: number;
  /** Si no hay fecha, no viaja. ISO 8601 con el desfase de Bogotá (-05:00). */
  readonly closesAt?: string;
  readonly id: number;
  /** Si no hay fecha, no viaja. ISO 8601 con el desfase de Bogotá (-05:00). */
  readonly opensAt?: string;
  /** Su lugar en la secuencia de casos. */
  readonly sortOrder: number;
  /** Dónde está la ventana hoy. */
  readonly state: AssignmentStateEnum;
  readonly target: AssignmentTarget;
}

/** Sobre de éxito: `data` es `Assignment`. */
export interface AssignmentEnvelope {
  readonly data: Assignment;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Sobre de éxito: `data` es una lista de `Assignment`. */
export interface AssignmentListEnvelope {
  readonly data: ReadonlyArray<Assignment>;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type AssignmentStateEnum = 'SCHEDULED' | 'OPEN' | 'CLOSED';

/** A quién se asignó el caso: a un grupo o, directamente, a un estudiante. */
export interface AssignmentTarget {
  /** Solo si `type` es `GROUP`. */
  readonly groupId?: number;
  /** Solo si `type` es `STUDENT`. */
  readonly studentId?: number;
  readonly type: AssignmentTargetTypeEnum;
}

export type AssignmentTargetTypeEnum = 'GROUP' | 'STUDENT';

/** La respuesta del asistente de IA: un objeto con el texto, SIN el sobre `{success, data}` de las demás rutas. */
export interface AssistantAnswer {
  readonly response: string;
}

/** El resultado de ``guide``: la acción elegida del catálogo (o ``null``), cómo mostrarla y el mensaje. */
export interface AssistantGuide {
  readonly accionId: string | null;
  /** Siempre 0: la guía no propone cambios. */
  readonly changes: number;
  readonly mensaje: string;
  /** El modelo que respondió. */
  readonly model: string;
  readonly modo: AssistantGuideModeEnum;
}

/** Una acción del catálogo del editor: ``id`` es un identificador seguro (sin espacios ni comillas). */
export interface AssistantGuideAction {
  readonly id: string;
  readonly nombre: string;
  readonly pantalla: string;
}

export interface AssistantGuideBody {
  readonly acciones: ReadonlyArray<AssistantGuideAction>;
  readonly pregunta: string;
}

/** Sobre de éxito: `data` es `AssistantGuide`. */
export interface AssistantGuideEnvelope {
  readonly data: AssistantGuide;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type AssistantGuideModeEnum = 'resaltar' | 'foco' | 'recorrido';

export interface AssistantProposeBody {
  readonly pantalla: string;
  readonly peticion: string;
  readonly seleccion?: unknown | null;
}

/** El resultado de ``propose``: el mensaje, la lista de cambios propuestos y con qué modelo se hizo. Cada cambio es un objeto con su ``op`` (una de las diez operaciones del asistente) y los campos de esa operación; el servidor ya los validó contra el caso. Proponer NO escribe nada: el cliente los aplica. */
export interface AssistantResult {
  /** Cambios validados, cada uno con su `op`. */
  readonly cambios: ReadonlyArray<Readonly<Record<string, unknown>>>;
  /** Cuántos cambios trae `cambios`. */
  readonly changes: number;
  readonly mensaje: string;
  /** El modelo que respondió. */
  readonly model: string;
  /** Siempre `connected` en un resultado. */
  readonly modo: string;
}

/** Sobre de éxito: `data` es `AssistantResult`. */
export interface AssistantResultEnvelope {
  readonly data: AssistantResult;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Si el asistente de autoría está listo y cuánto cupo le queda hoy a quien lo usa. */
export interface AssistantStatus {
  readonly enabled: boolean;
  readonly mode: AssistantStatusModeEnum;
  readonly remainingToday: number;
}

/** Sobre de éxito: `data` es `AssistantStatus`. */
export interface AssistantStatusEnvelope {
  readonly data: AssistantStatus;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type AssistantStatusModeEnum = 'connected' | 'disabled';

/** El estado del intento (inicio, lectura, reanudación): la escena, la persona y, al completar, el informe congelado. Ninguna cifra llega al estudiante: ni puntaje, ni estrés, ni métricas, ni estado clínico (`test_no_numbers_to_student`). La respuesta lleva además `attemptToken` (la credencial del intento, que el cliente reenvía en la cabecera): este contrato NO la declara a propósito, porque el documento no publica ninguna propiedad con nombre de credencial (`test_openapi_schema_never_exposes_prohibited_fields`). Su prueba la admite como la única clave de más. */
export interface AttemptState {
  /** UUID del intento. */
  readonly attemptId: string;
  readonly caseTitle: string;
  readonly caseVersionId: number;
  /** El informe congelado (schemaVersion 4) de un intento completado; nulo mientras no lo está. Su forma (hitos, persona, final con su razón, revisión de decisiones, niveles con su evidencia) la fija `attempt_report`; tiparla campo a campo queda fuera de este contrato. */
  readonly completionReport: Readonly<Record<string, unknown>> | null;
  readonly currentNode: CurrentNode;
  readonly persona: PersonaState;
  readonly status: AttemptStatusEnum;
  /** Recursos de apoyo: solo si el intento está en pausa o salió de forma segura. */
  readonly supportResources: ReadonlyArray<string>;
}

/** Sobre de éxito: `data` es `AttemptState`. */
export interface AttemptStateEnvelope {
  readonly data: AttemptState;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type AttemptStatusEnum = 'IN_PROGRESS' | 'PAUSED' | 'SAFE_EXITED' | 'COMPLETED' | 'REPLACED';

/** Página de auditoría, de la más reciente a la más antigua, con el resumen de calidad de las revisiones. */
export interface AuditList {
  readonly coverage: PageCoverage;
  readonly items: ReadonlyArray<AuditLogItem>;
  readonly page: number;
  readonly pageSize: number;
  /** Días que se conserva la auditoría (nunca menos de 360). */
  readonly retentionDays: number;
  readonly reviewQuality: ReviewQuality;
}

/** Sobre de éxito: `data` es `AuditList`. */
export interface AuditListEnvelope {
  readonly data: AuditList;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Una fila de la auditoría. Los campos opcionales son nulos en los eventos de sistema (sin actor ni recurso). */
export interface AuditLogItem {
  /** Código tal como se guardó (`entidad.verbo` o el legado). */
  readonly action: string;
  readonly actorId: number | null;
  readonly actorRole: string | null;
  /** Contexto libre de la acción (método, clase, taxonomía…). */
  readonly context: Readonly<Record<string, unknown>>;
  readonly id: number;
  readonly ipAddress: string | null;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly occurredAt: string;
  readonly resourceId: string | null;
  readonly resourceType: string | null;
  /** Hasta cuándo se conserva la fila. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly retentionUntil: string;
  /** El código canónico `entidad.verbo` de la acción. */
  readonly taxonomy: string;
  readonly userAgent: string | null;
}

/** Una versión de caso en la lista de autoría: las propias del docente o todas para el ADMIN. */
export interface AuthoringCaseSummary {
  /** El caso al que pertenece la versión: agrupa las versiones de un caso. */
  readonly caseId: number;
  readonly caseVersionId: number;
  readonly code: string;
  /** Puede venir vacío o nulo. */
  readonly description: string | null;
  /** Escenas con narración y, si no son un final, al menos una respuesta. */
  readonly escenasConGuion: number;
  /** Cuántas escenas tiene la versión. */
  readonly nodeCount: number;
  /** URL del fondo de la sala donde empieza el caso, si es de imagen fija; nulo si la sala se arma por piezas, no tiene fondo o el fondo no es una ruta permitida (la interfaz pinta su composición de respaldo). */
  readonly portada: string | null;
  readonly semanticVersion: string;
  readonly status: CaseVersionStatusEnum;
  readonly title: string;
  /** La última edición; en lo editado antes de registrarla, la publicación o la creación. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly updatedAt: string | null;
}

/** Sobre de éxito: `data` es una lista de `AuthoringCaseSummary`. */
export interface AuthoringCaseSummaryListEnvelope {
  readonly data: ReadonlyArray<AuthoringCaseSummary>;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type BackingEnum = 'system' | 'constancia' | 'author';

export type BondEnum = 'WITHDRAWN' | 'GUARDED' | 'OPEN';

/** Un personaje que Psicología marcó para la ficha del caso. */
export interface BriefCharacter {
  readonly displayName: string;
  readonly id: number;
  /** Puede venir vacío. */
  readonly portraitKey: string;
  /** Puede venir vacío. */
  readonly roleLabel: string;
}

/** Dónde empieza el caso: el título de la escena de inicio y el de su sala. */
export interface BriefStart {
  readonly escena: string;
  /** Vacío si la escena de inicio no tiene sala. */
  readonly lugar: string;
}

/** Un bloqueo de publicación: la lista incompleta o los errores de validación (con sus hallazgos). */
export interface CaseBlocker {
  readonly code: string;
  /** Solo en `VALIDATION_ERRORS`. */
  readonly issues?: ReadonlyArray<ValidationIssue>;
  readonly message: string;
}

/** La ficha del caso: lo que el estudiante lee antes de jugar. No crea intento. */
export interface CaseBrief {
  readonly access: AccessDecision;
  readonly caseVersionId: number;
  readonly characters: ReadonlyArray<BriefCharacter>;
  /** Si el recorrido se valora con una rúbrica (asignada, propia de la versión o la predeterminada). */
  readonly conRubrica: boolean;
  /** Puede venir vacío. */
  readonly context: string;
  /** Cuántas escenas tiene el caso. */
  readonly escenas: number;
  readonly hasSensitiveContent: boolean;
  /** Nulo si el caso no tiene escena de inicio. */
  readonly inicio: BriefStart | null;
  readonly learningObjectives: ReadonlyArray<string>;
  /** URL del fondo de la sala donde empieza el caso, si es de imagen fija; nulo si la sala se arma por piezas, no tiene fondo o el fondo no es una ruta permitida (la interfaz pinta su composición de respaldo). */
  readonly portada: string | null;
  /** Los temas sensibles que declara el caso; vacía si no declara ninguno. */
  readonly temasSensibles: ReadonlyArray<string>;
  readonly title: string;
}

/** Sobre de éxito: `data` es `CaseBrief`. */
export interface CaseBriefEnvelope {
  readonly data: CaseBrief;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** La lista de publicación del caso con quién respalda cada casilla (S3-3): la misma que trae el editor. */
export interface CaseChecklist {
  readonly contentReview: ChecklistContentReview;
  readonly items: ReadonlyArray<ChecklistItem>;
  /** Si rige la revisión de contenido de Psicología (`SIEP_REVIEW_WORKFLOW_STRICT`): publicar exige la constancia. */
  readonly strict: boolean;
}

/** El 409 de una transición del caso. Cada motivo suma sus campos en la raíz: `INVALID_TRANSITION` → `state` y `action`; `CASE_NOT_PUBLISHABLE` → `blockers`; `REVISION_CONFLICT` → `revision` y `current` (el editor tal como está ahora). */
export interface CaseConflictEnvelope {
  readonly action?: LifecycleActionEnum;
  readonly blockers?: ReadonlyArray<CaseBlocker>;
  readonly code: string;
  /** El editor del caso con los cambios de la otra sesión. */
  readonly current?: Readonly<Record<string, unknown>>;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly message: string;
  /** El motivo corto (fijo) de un 422 `AI_PROPOSAL_INVALID`. */
  readonly motivo?: string;
  /** La revisión vigente del caso. */
  readonly revision?: number;
  readonly state?: CaseVersionStatusEnum;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

/** El documento de una versión (borrador o publicada) con su hash, su sello y su reutilización. */
export interface CaseDefinition {
  /** El documento del caso: el mismo formato que se exporta y se importa. */
  readonly definition: Readonly<Record<string, unknown>>;
  /** Hash del documento tal como está ahora (`sha256:<hex>`). */
  readonly definitionHash: string;
  /** Qué parte del caso reutiliza de su versión anterior (0 a 1); solo un clon publicado. */
  readonly reuseRatio: number | null;
  /** El hash que se selló al publicar; nulo en lo que no tiene sello. */
  readonly sealedHash: string | null;
  /** Solo lo sellado la tiene. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly validatedAt: string | null;
}

/** Sobre de éxito: `data` es `CaseDefinition`. */
export interface CaseDefinitionEnvelope {
  readonly data: CaseDefinition;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El borrador que creó la importación y los avisos del documento (lo que no se guarda). */
export interface CaseImported {
  readonly caseId: number;
  readonly caseVersionId: number;
  /** Solo avisos: con algún error no se crea nada. */
  readonly issues: ReadonlyArray<ValidationIssue>;
}

/** Sobre de éxito: `data` es `CaseImported`. */
export interface CaseImportedEnvelope {
  readonly data: CaseImported;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El ciclo de vida de una versión: su estado, lo que esta persona puede hacer, su lista de publicación y la última revisión (C4). */
export interface CaseLifecycle {
  /** Las acciones que esta persona puede hacer hoy. */
  readonly allowedTransitions: ReadonlyArray<LifecycleActionEnum>;
  /** Solo si puede enviar o aprobar y algo lo impide. */
  readonly blockedReason?: LifecycleBlockedReason;
  /** En `clone`, la versión NUEVA que se creó. */
  readonly caseVersionId: number;
  /** La lista de publicación con el respaldo de cada casilla: quien revisa la ve sin pedir el caso entero (S3-3). */
  readonly checklist: CaseChecklist;
  /** Solo si la versión ya tuvo una revisión. */
  readonly review?: CaseReview;
  readonly state: CaseVersionStatusEnum;
}

/** Sobre de éxito: `data` es `CaseLifecycle`. */
export interface CaseLifecycleEnvelope {
  readonly data: CaseLifecycle;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** La última revisión de la versión. Mientras nadie la decide solo trae quién la pidió y cuándo. */
export interface CaseReview {
  /** Solo si la aprobación trae constancia. */
  readonly contentReview?: ContentReview;
  /** Solo si ya se decidió. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly decidedAt?: string | null;
  readonly decidedBy?: string | null;
  /** Solo si ya se decidió. */
  readonly decision?: ReviewDecisionEnum;
  /** Solo si ya se decidió; puede venir vacía. */
  readonly note?: string;
  /** Solo si se devolvió a borrador. */
  readonly reason?: ReviewReasonEnum;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly requestedAt: string;
  readonly requestedBy: string | null;
}

/** El resultado de validar una versión: sus hallazgos y si puede publicarse. */
export interface CaseValidation {
  /** Falso mientras haya algún error; los avisos no impiden publicar. */
  readonly canPublish: boolean;
  readonly issues: ReadonlyArray<ValidationIssue>;
}

/** Sobre de éxito: `data` es `CaseValidation`. */
export interface CaseValidationEnvelope {
  readonly data: CaseValidation;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type CaseVersionStatusEnum = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';

/** Un caso del catálogo del actor, en el orden de su secuencia, con su decisión de acceso. */
export interface CatalogItem {
  readonly access: AccessDecision;
  readonly caseVersionId: number;
  readonly code: string;
  readonly completed: boolean;
  /** Puede venir vacío o nulo. */
  readonly description: string | null;
  /** Cuántas escenas tiene el caso. */
  readonly escenas: number;
  readonly locked: boolean;
  readonly order: number;
  /** URL del fondo de la sala donde empieza el caso, si es de imagen fija; nulo si la sala se arma por piezas, no tiene fondo o el fondo no es una ruta permitida (la interfaz pinta su composición de respaldo). */
  readonly portada: string | null;
  readonly title: string;
  readonly unlocked: boolean;
}

/** Sobre de éxito: `data` es una lista de `CatalogItem`. */
export interface CatalogItemListEnvelope {
  readonly data: ReadonlyArray<CatalogItem>;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type CategoryEnum = 'MAYORIA' | 'MENOS_DE_LA_MITAD';

/** La constancia de Psicología vista desde la lista: si existe y, cuando existe, sus datos. */
export interface ChecklistContentReview {
  readonly fulfilled: boolean;
  /** El acta o la referencia de la revisión. Solo si ya hay constancia. */
  readonly reference?: string;
  /** Solo si ya hay constancia. */
  readonly reviewedOn?: string | null;
  /** Solo si ya hay constancia. */
  readonly reviewer?: string;
}

/** Un ítem de la lista de publicación y quién lo respalda (S3-3). */
export interface ChecklistItem {
  /** Si el dato que lo respalda existe ahora; `null` si es solo una declaración. */
  readonly backed: boolean | null;
  /** Quién lo respalda: el sistema, la constancia de Psicología o solo la declaración de quien autora. */
  readonly backing: BackingEnum;
  /** El respaldo en lenguaje llano, para mostrarlo tal cual. */
  readonly backingLabel: string;
  /** Estable: `contentOriginal`, `ethicsReviewed`, `safetyProtocols`… */
  readonly code: string;
  /** Su texto es un borrador pendiente de la validación de Psicología. */
  readonly draft: boolean;
  /** Si la última lista guardada lo tiene marcado. */
  readonly fulfilled: boolean;
  readonly label: string;
  /** Si la publicación lo exige hoy: seis ítems, o siete con la revisión de contenido. */
  readonly required: boolean;
}

/** Cuerpo de `POST …/consent`: la versión del aviso que la persona vio. */
export interface ConsentAcceptRequest {
  /** La versión del aviso que el cliente mostró. Si no es la vigente en el servidor, 409 `NOTICE_VERSION_STALE`. */
  readonly noticeVersion: string;
}

/** El error de un aviso de otra versión (409 `NOTICE_VERSION_STALE`): el sobre de error con la versión vigente en la raíz. Es la forma real del 409 (sin `field`, que es de la validación de campos): por eso no extiende a `ErrorEnvelope`. */
export interface ConsentNoticeError {
  /** Estable: `NOTICE_VERSION_STALE`. */
  readonly code: string;
  readonly message: string;
  /** La versión VIGENTE del aviso en el servidor. */
  readonly noticeVersion: string;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

/** La aceptación registrada (`POST …/consent`): 201 si es nueva y 200 si ya existía, con la misma forma. */
export interface ConsentRecord {
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly acceptedAt: string;
  readonly caseVersionId: number;
  /** La versión del aviso que quedó aceptada. */
  readonly noticeVersion: string;
}

/** Sobre de éxito: `data` es `ConsentRecord`. */
export interface ConsentRecordEnvelope {
  readonly data: ConsentRecord;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El consentimiento de la persona al aviso de contenido de una versión del caso (`GET …/consent`). */
export interface ConsentState {
  /** Si la persona tiene una aceptación vigente de esa versión del aviso. */
  readonly accepted: boolean;
  /** Nulo si no ha aceptado. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly acceptedAt: string | null;
  /** La versión VIGENTE del aviso en el servidor. */
  readonly noticeVersion: string;
  /** Si el servidor exige el consentimiento para jugar (`SIEP_CONSENT_REQUIRED`). */
  readonly required: boolean;
}

/** Sobre de éxito: `data` es `ConsentState`. */
export interface ConsentStateEnvelope {
  readonly data: ConsentState;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El retiro del consentimiento (`DELETE …/consent`). Idempotente: sin nada vigente responde 200 con `withdrawnAt` nulo. */
export interface ConsentWithdrawal {
  readonly caseVersionId: number;
  /** Nulo si no había nada vigente que retirar. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly withdrawnAt: string | null;
}

/** Sobre de éxito: `data` es `ConsentWithdrawal`. */
export interface ConsentWithdrawalEnvelope {
  readonly data: ConsentWithdrawal;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** La constancia de la revisión de contenido de Psicología. */
export interface ContentReview {
  /** El acta o la referencia de la revisión. */
  readonly reference: string;
  readonly reviewedOn: string | null;
  readonly reviewer: string;
}

/** La escena actual del intento. ``options`` va vacía si el intento no está en juego o la escena es terminal. */
export interface CurrentNode {
  readonly decisionPrompt: string;
  readonly displayOrder: number;
  /** El objetivo de la escena en una frase; vacío si la escena no lo declara. */
  readonly goal: string;
  readonly id: number;
  /** Cuánta carga emocional trae la escena. */
  readonly intensity: IntensityEnum;
  readonly key: string;
  readonly narrative: string;
  readonly options: ReadonlyArray<DecisionOptionState>;
  readonly requiredTools: ReadonlyArray<string>;
  readonly safeExitRequired: boolean;
  readonly sensitiveContent: boolean;
  readonly supportResources: ReadonlyArray<string>;
  readonly terminal: boolean;
  readonly title: string;
  readonly warningMessage: string | null;
}

/** Una opción de decisión tal como la ve quien juega: solo su id y su texto (ni clase ni efectos, antes de decidir). */
export interface DecisionOptionState {
  readonly id: number;
  readonly text: string;
}

/** Sobre de error de la API: `{success: false, code, message, field?}` (`shared.exceptions`). `code` es estable: el cliente decide por él, nunca por el texto. Algunos errores de dominio suman campos propios en la raíz (`existingAttemptId`, `nodeId`…). */
export interface ErrorEnvelope {
  readonly code: string;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly message: string;
  /** El motivo corto (fijo) de un 422 `AI_PROPOSAL_INVALID`. */
  readonly motivo?: string;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

export type EvaluationStatusEnum = 'PENDIENTE' | 'APLICADA' | 'NO_APLICA';

export type FormativeLevelEnum = 'EN_INICIO' | 'EN_PROCESO' | 'LOGRADO' | 'DESTACADO';

/** Una generación por etapas. No trae el documento guardado ni texto del modelo salvo los títulos del esqueleto. */
export interface Generation {
  readonly callsLimit: number;
  readonly callsUsed: number;
  /** El borrador creado, solo con `imported`. */
  readonly caseVersionId: number | null;
  /** UTC, ISO 8601 con `Z`. */
  readonly createdAt: string;
  readonly descripcion: string;
  readonly id: string;
  /** Con `imported`: lo que queda por resolver; con `failed`: lo que impidió importar. Solo faltas de severidad `error`: los avisos no se incluyen. */
  readonly issues: ReadonlyArray<ValidationIssue>;
  readonly lastError: GenerationError | null;
  readonly lugarId: string;
  readonly repair: GenerationRepair | null;
  /** Las rondas ya abiertas. */
  readonly repairRounds: number;
  readonly scenes: ReadonlyArray<GenerationSceneState>;
  /** Nulo hasta que el esqueleto esté listo. */
  readonly skeleton: GenerationSkeleton | null;
  readonly status: GenerationStatusEnum;
  /** UTC, ISO 8601 con `Z`. */
  readonly updatedAt: string;
}

/** Sobre de éxito: `data` es `Generation`. */
export interface GenerationEnvelope {
  readonly data: Generation;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El último fallo de una etapa; se borra cuando esa misma etapa sale bien. */
export interface GenerationError {
  readonly clave: string | null;
  readonly kind: GenerationErrorKindEnum;
  /** Texto fijo del servidor; nunca cita lo que dijo el modelo. */
  readonly message: string;
  readonly stage: StageEnum;
}

/** El 409, 429 y 502 de la generación. Cada motivo suma su campo en la raíz: `GENERATION_IN_PROGRESS` → `generationId` (la que sigue abierta); `AI_LIMIT_EXCEEDED` → `scope` (`daily`); `AI_PROVIDER_ERROR` → `kind` (`timeout`, `http` o `malformed`). */
export interface GenerationErrorEnvelope {
  readonly code: string;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  /** Solo en `GENERATION_IN_PROGRESS`. */
  readonly generationId?: string;
  /** Solo en `AI_PROVIDER_ERROR`: `timeout`, `http` o `malformed`. */
  readonly kind?: string;
  readonly message: string;
  /** El motivo corto (fijo) de un 422 `AI_PROPOSAL_INVALID`. */
  readonly motivo?: string;
  /** Solo en `AI_LIMIT_EXCEEDED`: `daily`. */
  readonly scope?: string;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

export type GenerationErrorKindEnum = 'timeout' | 'http' | 'malformed' | 'refusal';

/** La ronda de reparación abierta: qué escenas se rehacen y las faltas de cada una (solo con `needs_repair`). */
export interface GenerationRepair {
  readonly issues: Readonly<Record<string, ReadonlyArray<ValidationIssue>>>;
  readonly round: number;
  readonly scenes: ReadonlyArray<string>;
}

export interface GenerationSceneError {
  readonly kind: GenerationErrorKindEnum;
  /** Texto fijo del servidor; nunca cita lo que dijo el modelo. */
  readonly message: string;
}

/** Una escena del esqueleto con su avance. */
export interface GenerationSceneState {
  readonly clave: string;
  readonly error: GenerationSceneError | null;
  readonly state: GenerationSceneStateStateEnum;
  readonly titulo: string;
}

export type GenerationSceneStateStateEnum = 'pending' | 'running' | 'done' | 'error';

/** El esqueleto del caso: su título y las escenas en orden (la primera es la de inicio). */
export interface GenerationSkeleton {
  readonly escenas: ReadonlyArray<GenerationSkeletonScene>;
  readonly titulo: string;
}

export interface GenerationSkeletonScene {
  /** El id de la sala donde pasa la escena. */
  readonly clave: string;
  readonly final: boolean;
  readonly titulo: string;
}

/** Solo describe el cuerpo para el esquema: el servicio valida ``lugarId`` y ``descripcion`` con mensajes fijos. */
export interface GenerationStartBody {
  /** Entre 40 y 2000 caracteres, texto plano y sin datos personales. */
  readonly descripcion: string;
  /** El lugar donde pasa el caso. */
  readonly lugarId: string;
}

/** Si la generación con IA está disponible, cuántas le quedan hoy a la docente y la generación en curso. */
export interface GenerationStatus {
  readonly enabled: boolean;
  readonly inProgress: Generation | null;
  readonly remainingToday: number;
}

export type GenerationStatusEnum = 'created' | 'skeleton_ready' | 'scenes_ready' | 'needs_repair' | 'imported' | 'failed' | 'cancelled';

/** Sobre de éxito: `data` es `GenerationStatus`. */
export interface GenerationStatusEnvelope {
  readonly data: GenerationStatus;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El estado mínimo del servicio. No devuelve nada interno: ni versiones ni el texto del error de la base. */
export interface Health {
  readonly db: HealthDbEnum;
  readonly status: HealthStatusEnum;
}

export type HealthDbEnum = 'ok' | 'error';

/** Sobre de éxito: `data` es `Health`. */
export interface HealthEnvelope {
  readonly data: Health;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type HealthStatusEnum = 'ok' | 'degraded';

export type HintReasonEnum = 'NONE_FOR_SCENE' | 'ALL_SHOWN';

/** Las pistas de la escena actual: las que el intento ya pidió y cuántas quedan. Es también lo que responde `POST …/hints/next`: el estado DESPUÉS de pedir (o, si la orden se repitió o cayó dentro de la ventana de duplicado, el mismo estado sin revelar otra). */
export interface HintState {
  /** Cuántas quedan por pedir en esta escena. */
  readonly available: number;
  /** Solo si no quedan: la escena no tiene o ya se pidieron todas. */
  readonly reason?: HintReasonEnum;
  readonly shown: ReadonlyArray<ShownHint>;
}

/** Sobre de éxito: `data` es `HintState`. */
export interface HintStateEnvelope {
  readonly data: HintState;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El sobre de error de una importación rechazada (`DSL_INVALID`): lleva los hallazgos en la raíz. */
export interface ImportRejectedEnvelope {
  readonly code: string;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly issues: ReadonlyArray<ValidationIssue>;
  readonly message: string;
  /** El motivo corto (fijo) de un 422 `AI_PROPOSAL_INVALID`. */
  readonly motivo?: string;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

/** Un intento en la revisión docente. El estudiante se identifica solo por su alias (nunca por su id). */
export interface InstructorAttemptItem {
  readonly activeSeconds: number;
  readonly attemptId: string;
  readonly caseTitle: string;
  readonly caseVersionId: number;
  readonly caseVersionStatus: CaseVersionStatusEnum;
  /** Nulo mientras el intento está abierto. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly endedAt: string | null;
  /** `APLICADA`: ya hay una valoración del docente concluida. `PENDIENTE`: el intento terminó, el caso se valora con una rúbrica y no hay valoración concluida (una guardada a medias sigue pendiente). `NO_APLICA`: el intento no terminó o el caso no tiene ninguna rúbrica. */
  readonly evaluationStatus: EvaluationStatusEnum;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly startedAt: string;
  readonly status: AttemptStatusEnum;
  /** `Estudiante-<hash>`: el mismo en todas las vistas del docente. */
  readonly studentAlias: string;
}

/** Página de intentos dentro del alcance del docente, del más reciente al más antiguo. */
export interface InstructorAttemptsList {
  readonly coverage: PageCoverage;
  readonly items: ReadonlyArray<InstructorAttemptItem>;
  readonly page: number;
  readonly pageSize: number;
}

/** Sobre de éxito: `data` es `InstructorAttemptsList`. */
export interface InstructorAttemptsListEnvelope {
  readonly data: InstructorAttemptsList;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type IntensityEnum = 'LOW' | 'MEDIUM' | 'HIGH';

/** La membresía del estudiante en un grupo: pendiente de respuesta, aceptada o rechazada. El listado no trae las retiradas (`REMOVED`), pero la respuesta de `leave` (y la de aceptar o rechazar) sí devuelve la membresía tal como quedó, también con ese estado. */
export interface Invitation {
  readonly groupId: number;
  readonly groupName: string;
  /** Igual a `groupId`: la membresía es `(grupo, estudiante)`. */
  readonly id: number;
  /** Hora local del servidor (America/Bogota), sin zona. Nula en las membresías anteriores a las invitaciones. */
  readonly invitedAt: string | null;
  readonly status: MembershipStatusEnum;
  /** Nombre completo del docente del grupo, quien invita. */
  readonly teacherName: string;
}

/** Sobre de éxito: `data` es `Invitation`. */
export interface InvitationEnvelope {
  readonly data: Invitation;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Sobre de éxito: `data` es una lista de `Invitation`. */
export interface InvitationListEnvelope {
  readonly data: ReadonlyArray<Invitation>;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type IssueSeverityEnum = 'error' | 'warning';

/** Los agregados de aprendizaje del alcance pedido. Cada bloque falta si no alcanza la celda mínima. */
export interface LearningAnalytics {
  readonly acceptable?: AnalyticsAcceptable;
  readonly cohort: AnalyticsCohort;
  readonly definitions: AnalyticsDefinitions;
  readonly evaluated?: AnalyticsEvaluated;
  readonly firstVsSecond?: AnalyticsFirstVsSecond;
  readonly improvement?: AnalyticsImprovement;
  readonly improvementAfterFeedback?: AnalyticsImprovementAfterFeedback;
  readonly keyEvidence?: AnalyticsKeyEvidence;
  readonly milestones?: ReadonlyArray<AnalyticsMilestone>;
  readonly reflectionCoverage?: AnalyticsReflection;
  readonly satisfaction?: AnalyticsSatisfaction;
}

/** Sobre de éxito: `data` es `LearningAnalytics`. */
export interface LearningAnalyticsEnvelope {
  readonly data: LearningAnalytics;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type LifecycleActionEnum = 'submit' | 'approve' | 'reject' | 'archive' | 'clone';

/** Por qué hoy no se puede enviar a revisión ni aprobar: el primer bloqueo. */
export interface LifecycleBlockedReason {
  /** Estable: `CHECKLIST_INCOMPLETE`, `VALIDATION_ERRORS`… */
  readonly code: string;
  readonly message: string;
}

/** El 409 de responder una invitación (`MEMBERSHIP_NOT_INVITED`, `MEMBERSHIP_NOT_ACTIVE`): trae el estado de hoy. */
export interface MembershipConflictEnvelope {
  readonly code: string;
  /** El primer campo que falló la validación. */
  readonly field?: string;
  readonly message: string;
  /** El motivo corto (fijo) de un 422 `AI_PROPOSAL_INVALID`. */
  readonly motivo?: string;
  /** El estado en que está la membresía hoy. */
  readonly status: MembershipStatusEnum;
  /** Siempre `false` en un error. */
  readonly success: boolean;
}

export type MembershipStatusEnum = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'REMOVED';

/** Cuántos resultados trae la página (`shown`) y cuántos hay en total (`total`). */
export interface PageCoverage {
  readonly shown: number;
  readonly total: number;
}

/** ``PATCH …/rehearsal/{attemptId}``: lo que se quiere cambiar del ensayo; el servicio valida cada parte y nombra el campo. */
export interface PatchedRehearsalAdjustRequest {
  readonly explorado?: unknown | null;
  readonly hitos?: unknown | null;
  readonly irA?: number | null;
  readonly persona?: unknown | null;
}

/** La persona consultante en palabras: su vínculo y su activación en la ficción, sin cifras. */
export interface PersonaState {
  readonly activation: ActivationEnum;
  readonly bond: BondEnum;
  /** La frase para el estudiante: «se muestra cautelosa y tensa». */
  readonly label: string;
}

/** Posición del jugador en el mapa, en píxeles. */
export interface PlayerPosition {
  readonly x: number;
  readonly y: number;
}

/** Uno de los 20 intentos más recientes del alcance del docente (Inicio docente). Solo el alias del estudiante. */
export interface RecentAttempt {
  readonly attemptId: string;
  readonly caseTitle: string;
  readonly caseVersionId: number;
  /** Nulo mientras el intento está abierto. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly endedAt: string | null;
  /** `APLICADA`: ya hay una valoración del docente concluida. `PENDIENTE`: el intento terminó, el caso se valora con una rúbrica y no hay valoración concluida (una guardada a medias sigue pendiente). `NO_APLICA`: el intento no terminó o el caso no tiene ninguna rúbrica. */
  readonly evaluationStatus: EvaluationStatusEnum;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly startedAt: string;
  readonly status: AttemptStatusEnum;
  /** `Estudiante-<hash>`: el mismo en todas las vistas del docente. */
  readonly studentAlias: string;
}

/** Sobre de éxito: `data` es una lista de `RecentAttempt`. */
export interface RecentAttemptListEnvelope {
  readonly data: ReadonlyArray<RecentAttempt>;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

export type ReflectionDefinitionEnum = 'ANY' | 'PER_DECISION_SCENE';

export interface RehearsalAdjusted {
  readonly rehearsal: RehearsalBlock;
}

/** Sobre de éxito: `data` es `RehearsalAdjusted`. */
export interface RehearsalAdjustedEnvelope {
  readonly data: RehearsalAdjusted;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** El bloque del panel de la autora: solo viaja por las rutas del ensayo, nunca por las del juego. */
export interface RehearsalBlock {
  readonly comments: ReadonlyArray<RehearsalComment>;
  /** Lo que `PATCH … explorado` admite en la escena actual. */
  readonly explorable: ReadonlyArray<RehearsalMissing>;
  /** Lo que cuenta hoy para la escena actual. */
  readonly explored: RehearsalExplored;
  readonly milestones: ReadonlyArray<string>;
  readonly options: ReadonlyArray<RehearsalOption>;
  readonly path: ReadonlyArray<RehearsalPathStep>;
  readonly persona: PersonaState;
  readonly sceneId: number;
  readonly scenes: ReadonlyArray<RehearsalScene>;
  readonly warnings: ReadonlyArray<string>;
}

export interface RehearsalComment {
  /** Si el comentario se diría ahora. */
  readonly due: boolean;
  readonly index: number;
  readonly line: string;
  readonly missing: ReadonlyArray<RehearsalMissing>;
  readonly personaje: string;
  /** Por qué no se dice: `absent` (su personaje no es una PERSON visible de la sala), `broken` (su `cuando` está mal formado) o `condition` (su `cuando` sigue sin cumplirse; `missing` dice qué falta); nulo si se dice ahora. */
  readonly retainedBy: string | null;
}

export interface RehearsalExplored {
  readonly has: ReadonlyArray<string>;
  readonly inspected: ReadonlyArray<string>;
  readonly talked: ReadonlyArray<string>;
  readonly used: ReadonlyArray<string>;
}

/** Lo que falta explorar, en la forma de ``decisionReview[].missed``: el tipo de hecho, su clave y su etiqueta. */
export interface RehearsalMissing {
  readonly key: string;
  readonly kind: RehearsalMissingKindEnum;
  readonly label: string;
}

export type RehearsalMissingKindEnum = 'talked' | 'inspected' | 'has' | 'used';

export interface RehearsalOption {
  readonly id: number;
  readonly missing: ReadonlyArray<RehearsalMissing>;
  readonly offered: boolean;
  /** Por qué no se ofrece: `facts` (hechos sin explorar), `condition` (otra condición sin cumplir) o `broken` (requisito roto); nulo si se ofrece. */
  readonly retainedBy: string | null;
  readonly text: string;
}

export interface RehearsalPathStep {
  readonly nodeId: number;
  readonly title: string;
}

export interface RehearsalScene {
  readonly id: number;
  readonly key: string;
  readonly start: boolean;
  readonly terminal: boolean;
  readonly title: string;
}

/** ``POST …/rehearsal``: la escena de la que se quiere empezar (la de inicio si falta). */
export interface RehearsalStartRequest {
  readonly desde?: number | null;
}

/** El estado del juego del ensayo (con su `attemptToken`, que este contrato no declara a propósito: una credencial no se publica en el esquema, ``test_openapi_schema_never_exposes_prohibited_fields``) más el bloque del panel. */
export interface RehearsalStarted {
  /** UUID del intento. */
  readonly attemptId: string;
  readonly caseTitle: string;
  readonly caseVersionId: number;
  /** El informe congelado (schemaVersion 4) de un intento completado; nulo mientras no lo está. Su forma (hitos, persona, final con su razón, revisión de decisiones, niveles con su evidencia) la fija `attempt_report`; tiparla campo a campo queda fuera de este contrato. */
  readonly completionReport: Readonly<Record<string, unknown>> | null;
  readonly currentNode: CurrentNode;
  readonly persona: PersonaState;
  readonly rehearsal: RehearsalBlock;
  readonly status: AttemptStatusEnum;
  /** Recursos de apoyo: solo si el intento está en pausa o salió de forma segura. */
  readonly supportResources: ReadonlyArray<string>;
}

/** Sobre de éxito: `data` es `RehearsalStarted`. */
export interface RehearsalStartedEnvelope {
  readonly data: RehearsalStarted;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Un intento del estudiante con sus tiempos y su n.º de intento en el caso. */
export interface ReportAttempt {
  /** Tiempo de juego real: lo que el estudiante estuvo en el caso. */
  readonly activeSeconds: number;
  readonly attemptId: string;
  readonly caseTitle: string;
  readonly caseVersionId: number;
  /** De reloj, entre el inicio y el cierre; nulo mientras el intento está abierto. */
  readonly clockSeconds: number | null;
  /** El n.º de intento del estudiante en el CASO (todas sus versiones). */
  readonly ordinal: number;
  /** Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly startedAt: string;
  readonly status: AttemptStatusEnum;
}

/** El estudiante del reporte. `ref` es `Estudiante-<id>` (su id numérico) y NO el alias `Estudiante-<hash>` que la revisión docente muestra en `studentAlias`: los dos no se pueden cruzar. */
export interface ReportStudent {
  readonly displayName: string;
  readonly ref: string;
}

export type ReviewDecisionEnum = 'APPROVED' | 'REJECTED';

/** Devoluciones por CONTENIDO frente a FORMA entre las revisiones decididas (alarma de sello de goma). */
export interface ReviewQuality {
  readonly approved: number;
  /** Devueltas por contenido / decididas (0 a 1). */
  readonly contentRejectionRate: number;
  readonly decidedReviews: number;
  /** Devueltas por forma / decididas (0 a 1). */
  readonly formRejectionRate: number;
  readonly rejectedByContent: number;
  readonly rejectedByForm: number;
  readonly rejectedTotal: number;
  readonly rubberStampAlarm: boolean;
}

export type ReviewReasonEnum = 'FORMA' | 'CONTENIDO';

/** Una pista que el intento ya pidió. El texto de las que no pidió nunca sale. */
export interface ShownHint {
  readonly id: number;
  readonly order: number;
  readonly text: string;
}

export type StageEnum = 'skeleton' | 'scene' | 'assemble';

/** El reporte de un estudiante para su docente (C3): los intentos más recientes y cuántos hay en total. */
export interface StudentReport {
  readonly attempts: ReadonlyArray<ReportAttempt>;
  /** «Mostrando `shown` de `total`»: los intentos que trae y los que hay. */
  readonly coverage: PageCoverage;
  readonly student: ReportStudent;
}

/** Sobre de éxito: `data` es `StudentReport`. */
export interface StudentReportEnvelope {
  readonly data: StudentReport;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Lo que el estudiante envía: la calificación y, si quiere, un comentario (la validación es del servicio). */
export interface SurveyRequest {
  /** Texto plano, sin marcado ni enlaces. */
  readonly comment?: string;
  /** Entero de 1 a 5. */
  readonly rating: number;
}

/** La encuesta breve de un intento: si ya se respondió y, en ese caso, qué respondió. */
export interface SurveyState {
  /** Solo si ya respondió; puede ser vacío. */
  readonly comment?: string;
  /** Solo si ya respondió. */
  readonly rating?: number;
  readonly submitted: boolean;
  /** Solo si ya respondió. Hora local del servidor (America/Bogota), sin zona horaria. */
  readonly submittedAt?: string;
}

/** Sobre de éxito: `data` es `SurveyState`. */
export interface SurveyStateEnvelope {
  readonly data: SurveyState;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** Un hallazgo del validador. El mensaje está en lenguaje llano: nombra los elementos por su título, sin ids. */
export interface ValidationIssue {
  /** Estable: `DSL.OCL-02`, `WORLD.OPTION_WITHOUT_TRIGGER`… */
  readonly code: string;
  /** El mapa al que el editor lleva el foco. */
  readonly mapId?: number;
  readonly message: string;
  /** La escena a la que el editor lleva el foco. */
  readonly nodeId?: number;
  /** Dónde está en el documento (`DSL.*`); no viaja si el hallazgo es del documento entero. */
  readonly path?: string;
  readonly severity: IssueSeverityEnum;
}

/** Acuse de la posición guardada (E5-1): sin releer objetos, diálogos ni herramientas. Si la sala del cliente ya no es la actual, la respuesta es el mundo completo: estas mismas claves y además `objects`, `collisions`, `tools`, `inventory`… El cliente solo debe leer de aquí `map.key` y `player`. */
export interface WorldPatchAck {
  readonly attemptId: string;
  readonly map: WorldPatchAckMap;
  readonly player: PlayerPosition;
  readonly status: AttemptStatusEnum;
}

/** Sobre de éxito: `data` es `WorldPatchAck`. */
export interface WorldPatchAckEnvelope {
  readonly data: WorldPatchAck;
  readonly message?: string;
  /** Siempre `true` en una respuesta de éxito. */
  readonly success: boolean;
}

/** La sala en la que quedó guardado el jugador. */
export interface WorldPatchAckMap {
  readonly key: string;
}

export interface OpenApiPaths {
  readonly '/api/admin/access-requests': 'GET';
  readonly '/api/admin/access-requests/{request_id}/status': 'PATCH';
  readonly '/api/admin/audit': 'GET';
  readonly '/api/admin/cases': 'GET' | 'POST';
  readonly '/api/admin/cases/import': 'POST';
  readonly '/api/admin/cases/{case_version_id}/assistant/guide': 'POST';
  readonly '/api/admin/cases/{case_version_id}/assistant/propose': 'POST';
  readonly '/api/admin/cases/{case_version_id}/assistant/status': 'GET';
  readonly '/api/admin/cases/{case_version_id}/brief': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/characters': 'POST';
  readonly '/api/admin/cases/{case_version_id}/characters/{character_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/checklist': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/clone-version': 'POST';
  readonly '/api/admin/cases/{case_version_id}/decisions': 'POST';
  readonly '/api/admin/cases/{case_version_id}/decisions/{decision_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/decisions/{decision_id}/accept-ai': 'POST';
  readonly '/api/admin/cases/{case_version_id}/definition': 'GET';
  readonly '/api/admin/cases/{case_version_id}/dialogues/{tree_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/dialogues/{tree_id}/accept-ai': 'POST';
  readonly '/api/admin/cases/{case_version_id}/editor': 'GET';
  readonly '/api/admin/cases/{case_version_id}/hints/{hint_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/lifecycle': 'GET' | 'POST';
  readonly '/api/admin/cases/{case_version_id}/maps': 'POST';
  readonly '/api/admin/cases/{case_version_id}/maps/{map_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/maps/{map_id}/dialogues': 'POST';
  readonly '/api/admin/cases/{case_version_id}/maps/{map_id}/hints': 'POST';
  readonly '/api/admin/cases/{case_version_id}/maps/{map_id}/objects': 'POST';
  readonly '/api/admin/cases/{case_version_id}/nodes': 'POST';
  readonly '/api/admin/cases/{case_version_id}/nodes/reorder': 'PATCH';
  readonly '/api/admin/cases/{case_version_id}/nodes/{node_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/nodes/{node_id}/accept-ai': 'POST';
  readonly '/api/admin/cases/{case_version_id}/objects/{object_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/objects/{object_id}/accept-ai': 'POST';
  readonly '/api/admin/cases/{case_version_id}/plan': 'GET';
  readonly '/api/admin/cases/{case_version_id}/publish': 'POST';
  readonly '/api/admin/cases/{case_version_id}/rehearsal': 'POST';
  readonly '/api/admin/cases/{case_version_id}/rehearsal/{attempt_id}': 'GET' | 'PATCH';
  readonly '/api/admin/cases/{case_version_id}/rubric': 'POST';
  readonly '/api/admin/cases/{case_version_id}/rules/endings': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/rules/milestones': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/rules/risk': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/tools': 'POST';
  readonly '/api/admin/cases/{case_version_id}/tools/{tool_id}': 'DELETE' | 'PUT';
  readonly '/api/admin/cases/{case_version_id}/validate': 'POST';
  readonly '/api/admin/cases/{case_version_id}/world': 'PUT';
  readonly '/api/admin/cases/{case_version_id}/world-editor': 'GET';
  readonly '/api/admin/cases/{case_version_id}/world-preview': 'GET';
  readonly '/api/admin/cases/{case_version_id}/world/validate': 'POST';
  readonly '/api/admin/users': 'GET' | 'POST';
  readonly '/api/admin/users/approve': 'POST';
  readonly '/api/admin/users/{user_id}': 'PUT';
  readonly '/api/admin/users/{user_id}/revoke-sessions': 'POST';
  readonly '/api/admin/users/{user_id}/status': 'PATCH';
  readonly '/api/assignments': 'GET' | 'POST';
  readonly '/api/assignments/{assignment_id}': 'DELETE' | 'PATCH';
  readonly '/api/auth/access-request': 'POST';
  readonly '/api/auth/change-password': 'POST';
  readonly '/api/auth/google': 'POST';
  readonly '/api/auth/google/config': 'GET';
  readonly '/api/auth/login': 'POST';
  readonly '/api/auth/logout': 'POST';
  readonly '/api/auth/me': 'GET';
  readonly '/api/authoring/cases': 'GET' | 'POST';
  readonly '/api/authoring/cases/import': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/assistant/guide': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/assistant/propose': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/assistant/status': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/brief': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/characters': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/characters/{character_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/checklist': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/clone-version': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/decisions': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/decisions/{decision_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/decisions/{decision_id}/accept-ai': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/definition': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/dialogues/{tree_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/dialogues/{tree_id}/accept-ai': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/editor': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/hints/{hint_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/lifecycle': 'GET' | 'POST';
  readonly '/api/authoring/cases/{case_version_id}/maps': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/maps/{map_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/maps/{map_id}/dialogues': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/maps/{map_id}/hints': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/maps/{map_id}/objects': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/nodes': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/nodes/reorder': 'PATCH';
  readonly '/api/authoring/cases/{case_version_id}/nodes/{node_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/nodes/{node_id}/accept-ai': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/objects/{object_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/objects/{object_id}/accept-ai': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/plan': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/publish': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/rehearsal': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/rehearsal/{attempt_id}': 'GET' | 'PATCH';
  readonly '/api/authoring/cases/{case_version_id}/rubric': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/rules/endings': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/rules/milestones': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/rules/risk': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/tools': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/tools/{tool_id}': 'DELETE' | 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/validate': 'POST';
  readonly '/api/authoring/cases/{case_version_id}/world': 'PUT';
  readonly '/api/authoring/cases/{case_version_id}/world-editor': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/world-preview': 'GET';
  readonly '/api/authoring/cases/{case_version_id}/world/validate': 'POST';
  readonly '/api/authoring/generations': 'POST';
  readonly '/api/authoring/generations/status': 'GET';
  readonly '/api/authoring/generations/{gen_id}': 'DELETE' | 'GET';
  readonly '/api/authoring/generations/{gen_id}/assemble': 'POST';
  readonly '/api/authoring/generations/{gen_id}/scenes/{clave}': 'POST';
  readonly '/api/authoring/generations/{gen_id}/skeleton': 'POST';
  readonly '/api/biblioteca/lugares': 'GET';
  readonly '/api/biblioteca/lugares/{lugar_id}': 'GET';
  readonly '/api/competencies': 'GET' | 'POST';
  readonly '/api/grupos': 'GET' | 'POST';
  readonly '/api/grupos/estudiantes/import/spec': 'GET';
  readonly '/api/grupos/estudiantes/import/template': 'GET';
  readonly '/api/grupos/{id}': 'DELETE' | 'PATCH' | 'PUT';
  readonly '/api/grupos/{id}/casos': 'GET' | 'POST';
  readonly '/api/grupos/{id}/casos/{case_version_id}': 'DELETE';
  readonly '/api/grupos/{id}/estudiantes': 'GET' | 'POST';
  readonly '/api/grupos/{id}/estudiantes/import': 'POST';
  readonly '/api/grupos/{id}/estudiantes/{estudiante_id}': 'DELETE';
  readonly '/api/grupos/{id}/estudiantes/{estudiante_id}/activar': 'POST';
  readonly '/api/health': 'GET';
  readonly '/api/instructor/attempts': 'GET';
  readonly '/api/instructor/attempts/recent': 'GET';
  readonly '/api/instructor/attempts/{attempt_id}/replace': 'POST';
  readonly '/api/instructor/attempts/{attempt_id}/rubric-evaluation': 'GET' | 'PATCH' | 'POST' | 'PUT';
  readonly '/api/instructor/attempts/{attempt_id}/trace': 'GET';
  readonly '/api/me/invitations': 'GET';
  readonly '/api/me/invitations/{group_id}/accept': 'POST';
  readonly '/api/me/invitations/{group_id}/decline': 'POST';
  readonly '/api/me/invitations/{group_id}/leave': 'POST';
  readonly '/api/reportes/analiticas': 'GET';
  readonly '/api/reportes/dashboard': 'GET';
  readonly '/api/reportes/estudiante/{estudiante_id}': 'GET';
  readonly '/api/reportes/grupo/{grupo_id}': 'GET';
  readonly '/api/reportes/grupo/{grupo_id}/export': 'GET';
  readonly '/api/rubrics': 'GET' | 'POST';
  readonly '/api/rubrics/case-versions/{case_version_id}': 'GET' | 'POST' | 'PUT';
  readonly '/api/rubrics/{rubric_id}': 'GET' | 'PATCH' | 'PUT';
  readonly '/api/rubrics/{rubric_id}/activate': 'POST';
  readonly '/api/rubrics/{rubric_id}/deactivate': 'POST';
  readonly '/api/rubrics/{rubric_id}/default': 'POST';
  readonly '/api/rubrics/{rubric_id}/duplicate': 'POST';
  readonly '/api/security/csp-report': 'POST';
  readonly '/api/simulation/ai-assistant': 'POST';
  readonly '/api/simulation/attempts': 'POST';
  readonly '/api/simulation/attempts/history': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/completion-report': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/decisions': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/enter-room': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/evaluation': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/feedback': 'GET' | 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/hints': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/hints/next': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/interactions/{interaction_key}': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/npcs/{npc_key}': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/progress-map': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/reflections': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/report': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/resume': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/safe-exit': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/student-report': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/tools/use': 'POST';
  readonly '/api/simulation/attempts/{attempt_id}/world': 'GET';
  readonly '/api/simulation/attempts/{attempt_id}/world-state': 'PATCH';
  readonly '/api/simulation/cases': 'GET';
  readonly '/api/simulation/cases/{case_version_id}/active-attempt': 'GET';
  readonly '/api/simulation/cases/{case_version_id}/brief': 'GET';
  readonly '/api/simulation/cases/{case_version_id}/consent': 'DELETE' | 'GET' | 'POST';
  readonly '/api/simulation/catalog': 'GET';
}

export type OpenApiEndpointPath = keyof OpenApiPaths;

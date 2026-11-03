"""Formas documentadas de las respuestas de simulación (E5-9, reparación).

Estas clases solo DESCRIBEN lo que el servidor responde: ningún código serializa ni valida con ellas. Cada una la
prueba ``tests/test_openapi_matches_responses.py`` contra la respuesta real del endpoint; si un servicio cambia una
clave, esa prueba falla hasta que se corrige aquí, y ``test_openapi_contract`` exige regenerar los tipos de
``frontend/`` (``node scripts/openapi/generate-types.mjs``).

Los nombres de los campos son los del servicio (camelCase), no los de las columnas.
"""
from rest_framework import serializers

from apps.grupos.contracts import AccessDecisionSerializer
from apps.simulation.casedef.vocabulary import Activation, Bond, Intensity
from apps.simulation.models import AttemptStatus, CaseVersionStatus
from apps.simulation.models.case import ReviewDecision, ReviewReason
from shared.openapi import ErrorEnvelopeSerializer

ISSUE_SEVERITIES = ("error", "warning")
ASSISTANT_STATUS_MODES = ("connected", "disabled")
ASSISTANT_GUIDE_MODES = ("resaltar", "foco", "recorrido")
HINT_REASONS = ("NONE_FOR_SCENE", "ALL_SHOWN")
LIFECYCLE_ACTIONS = ("submit", "approve", "reject", "archive", "clone")
#: Quién respalda una casilla de la lista de publicación (``authoring/checklist.py``: ``SYSTEM``, ``CONSTANCIA``, ``AUTHOR``).
CHECKLIST_BACKINGS = ("system", "constancia", "author")

#: Las fechas de la API son la hora local del servidor, sin desfase (``USE_TZ = False``): un cliente que las
#: reciba debe leerlas como hora de Bogotá, no como UTC.
LOCAL_TIME = "Hora local del servidor (America/Bogota), sin zona horaria."


class PageCoverageSerializer(serializers.Serializer):
    """Cuántos resultados trae la página (`shown`) y cuántos hay en total (`total`)."""

    shown = serializers.IntegerField()
    total = serializers.IntegerField()


# ─── GET /api/admin/audit ─────────────────────────────────────────────────────
class AuditLogItemSerializer(serializers.Serializer):
    """Una fila de la auditoría. Los campos opcionales son nulos en los eventos de sistema (sin actor ni recurso)."""

    id = serializers.IntegerField()
    actorId = serializers.IntegerField(allow_null=True)
    actorRole = serializers.CharField(allow_null=True)
    action = serializers.CharField(help_text="Código tal como se guardó (`entidad.verbo` o el legado).")
    taxonomy = serializers.CharField(help_text="El código canónico `entidad.verbo` de la acción.")
    resourceType = serializers.CharField(allow_null=True)
    resourceId = serializers.CharField(allow_null=True)
    context = serializers.DictField(help_text="Contexto libre de la acción (método, clase, taxonomía…).")
    ipAddress = serializers.CharField(allow_null=True)
    userAgent = serializers.CharField(allow_null=True)
    occurredAt = serializers.DateTimeField(help_text=LOCAL_TIME)
    retentionUntil = serializers.DateTimeField(help_text=f"Hasta cuándo se conserva la fila. {LOCAL_TIME}")


class ReviewQualitySerializer(serializers.Serializer):
    """Devoluciones por CONTENIDO frente a FORMA entre las revisiones decididas (alarma de sello de goma)."""

    decidedReviews = serializers.IntegerField()
    approved = serializers.IntegerField()
    rejectedTotal = serializers.IntegerField()
    rejectedByContent = serializers.IntegerField()
    rejectedByForm = serializers.IntegerField()
    contentRejectionRate = serializers.FloatField(help_text="Devueltas por contenido / decididas (0 a 1).")
    formRejectionRate = serializers.FloatField(help_text="Devueltas por forma / decididas (0 a 1).")
    rubberStampAlarm = serializers.BooleanField()


class AuditListSerializer(serializers.Serializer):
    """Página de auditoría, de la más reciente a la más antigua, con el resumen de calidad de las revisiones."""

    items = AuditLogItemSerializer(many=True)
    page = serializers.IntegerField()
    pageSize = serializers.IntegerField()
    coverage = PageCoverageSerializer()
    retentionDays = serializers.IntegerField(help_text="Días que se conserva la auditoría (nunca menos de 360).")
    reviewQuality = ReviewQualitySerializer()


# ─── GET /api/instructor/attempts ─────────────────────────────────────────────
class InstructorAttemptItemSerializer(serializers.Serializer):
    """Un intento en la revisión docente. El estudiante se identifica solo por su alias (nunca por su id)."""

    attemptId = serializers.UUIDField()
    studentAlias = serializers.CharField(help_text="`Estudiante-<hash>`: el mismo en todas las vistas del docente.")
    caseVersionId = serializers.IntegerField()
    caseVersionStatus = serializers.ChoiceField(choices=CaseVersionStatus.choices)
    caseTitle = serializers.CharField()
    status = serializers.ChoiceField(choices=AttemptStatus.choices)
    activeSeconds = serializers.IntegerField()
    startedAt = serializers.DateTimeField(help_text=LOCAL_TIME)
    endedAt = serializers.DateTimeField(allow_null=True, help_text=f"Nulo mientras el intento está abierto. {LOCAL_TIME}")


class InstructorAttemptsListSerializer(serializers.Serializer):
    """Página de intentos dentro del alcance del docente, del más reciente al más antiguo."""

    items = InstructorAttemptItemSerializer(many=True)
    page = serializers.IntegerField()
    pageSize = serializers.IntegerField()
    coverage = PageCoverageSerializer()


# ─── POST /api/simulation/ai-assistant (RF-027) ───────────────────────────────
class AssistantAnswerSerializer(serializers.Serializer):
    """La respuesta del asistente de IA: un objeto con el texto, SIN el sobre `{success, data}` de las demás rutas."""

    response = serializers.CharField()


# ─── …/cases/{id}/assistant/* (asistente de IA de autoría, P5) ────────────────
class AssistantStatusSerializer(serializers.Serializer):
    """Si el asistente de autoría está listo y cuánto cupo le queda hoy a quien lo usa."""

    enabled = serializers.BooleanField()
    remainingToday = serializers.IntegerField()
    mode = serializers.ChoiceField(choices=ASSISTANT_STATUS_MODES)


class AssistantResultSerializer(serializers.Serializer):
    """El resultado de ``propose``: el mensaje, la lista de cambios propuestos y con qué modelo se hizo.

    Cada cambio es un objeto con su ``op`` (una de las diez operaciones del asistente) y los campos de esa
    operación; el servidor ya los validó contra el caso. Proponer NO escribe nada: el cliente los aplica.
    """

    mensaje = serializers.CharField()
    cambios = serializers.ListField(child=serializers.DictField(), help_text="Cambios validados, cada uno con su `op`.")
    modo = serializers.CharField(help_text="Siempre `connected` en un resultado.")
    model = serializers.CharField(help_text="El modelo que respondió.")
    changes = serializers.IntegerField(help_text="Cuántos cambios trae `cambios`.")


class AssistantGuideSerializer(serializers.Serializer):
    """El resultado de ``guide``: la acción elegida del catálogo (o ``null``), cómo mostrarla y el mensaje."""

    accionId = serializers.CharField(allow_null=True)
    modo = serializers.ChoiceField(choices=ASSISTANT_GUIDE_MODES)
    mensaje = serializers.CharField()
    model = serializers.CharField(help_text="El modelo que respondió.")
    changes = serializers.IntegerField(help_text="Siempre 0: la guía no propone cambios.")


# ─── PATCH /api/simulation/attempts/{attempt_id}/world-state ──────────────────
class WorldPatchAckMapSerializer(serializers.Serializer):
    """La sala en la que quedó guardado el jugador."""

    key = serializers.CharField()


class PlayerPositionSerializer(serializers.Serializer):
    """Posición del jugador en el mapa, en píxeles."""

    x = serializers.IntegerField()
    y = serializers.IntegerField()


class WorldPatchAckSerializer(serializers.Serializer):
    """Acuse de la posición guardada (E5-1): sin releer objetos, diálogos ni herramientas.

    Si la sala del cliente ya no es la actual, la respuesta es el mundo completo: estas mismas claves y además
    `objects`, `collisions`, `tools`, `inventory`… El cliente solo debe leer de aquí `map.key` y `player`.
    """

    attemptId = serializers.UUIDField()
    status = serializers.ChoiceField(choices=AttemptStatus.choices)
    map = WorldPatchAckMapSerializer()
    player = PlayerPositionSerializer()


# ─── POST /api/{admin,authoring}/cases/{id}/validate  (C6) ────────────────────
class ValidationIssueSerializer(serializers.Serializer):
    """Un hallazgo del validador. El mensaje está en lenguaje llano: nombra los elementos por su título, sin ids."""

    code = serializers.CharField(help_text="Estable: `DSL.OCL-02`, `WORLD.OPTION_WITHOUT_TRIGGER`…")
    severity = serializers.ChoiceField(choices=ISSUE_SEVERITIES)
    message = serializers.CharField()
    path = serializers.CharField(
        required=False, help_text="Dónde está en el documento (`DSL.*`); no viaja si el hallazgo es del documento entero."
    )
    nodeId = serializers.IntegerField(required=False, help_text="La escena a la que el editor lleva el foco.")
    mapId = serializers.IntegerField(required=False, help_text="El mapa al que el editor lleva el foco.")


class CaseValidationSerializer(serializers.Serializer):
    """El resultado de validar una versión: sus hallazgos y si puede publicarse."""

    issues = ValidationIssueSerializer(many=True)
    canPublish = serializers.BooleanField(help_text="Falso mientras haya algún error; los avisos no impiden publicar.")


# ─── GET /api/{admin,authoring}/cases/{id}/definition y POST …/cases/import  (C10) ───
class CaseDefinitionSerializer(serializers.Serializer):
    """El documento de una versión (borrador o publicada) con su hash, su sello y su reutilización."""

    definition = serializers.DictField(help_text="El documento del caso: el mismo formato que se exporta y se importa.")
    definitionHash = serializers.CharField(help_text="Hash del documento tal como está ahora (`sha256:<hex>`).")
    sealedHash = serializers.CharField(
        allow_null=True, help_text="El hash que se selló al publicar; nulo en lo que no tiene sello."
    )
    validatedAt = serializers.DateTimeField(allow_null=True, help_text=f"Solo lo sellado la tiene. {LOCAL_TIME}")
    reuseRatio = serializers.FloatField(
        allow_null=True, help_text="Qué parte del caso reutiliza de su versión anterior (0 a 1); solo un clon publicado."
    )


class CaseImportedSerializer(serializers.Serializer):
    """El borrador que creó la importación y los avisos del documento (lo que no se guarda)."""

    caseVersionId = serializers.IntegerField()
    caseId = serializers.IntegerField()
    issues = ValidationIssueSerializer(many=True, help_text="Solo avisos: con algún error no se crea nada.")


class ImportRejectedEnvelopeSerializer(ErrorEnvelopeSerializer):
    """El sobre de error de una importación rechazada (`DSL_INVALID`): lleva los hallazgos en la raíz."""

    issues = ValidationIssueSerializer(many=True)


# ─── GET /api/simulation/cases/{id}/brief  (C8) ───────────────────────────────
class BriefCharacterSerializer(serializers.Serializer):
    """Un personaje que Psicología marcó para la ficha del caso."""

    id = serializers.IntegerField()
    displayName = serializers.CharField()
    roleLabel = serializers.CharField(help_text="Puede venir vacío.")
    portraitKey = serializers.CharField(help_text="Puede venir vacío.")


class CaseBriefSerializer(serializers.Serializer):
    """La ficha del caso: lo que el estudiante lee antes de jugar. No crea intento."""

    caseVersionId = serializers.IntegerField()
    title = serializers.CharField()
    context = serializers.CharField(help_text="Puede venir vacío.")
    characters = BriefCharacterSerializer(many=True)
    learningObjectives = serializers.ListField(child=serializers.CharField())
    hasSensitiveContent = serializers.BooleanField()
    access = AccessDecisionSerializer()


# ─── GET /api/simulation/attempts/{id}/hints  (C9) ────────────────────────────
class ShownHintSerializer(serializers.Serializer):
    """Una pista que el intento ya pidió. El texto de las que no pidió nunca sale."""

    id = serializers.IntegerField()
    order = serializers.IntegerField()
    text = serializers.CharField()


class HintStateSerializer(serializers.Serializer):
    """Las pistas de la escena actual: las que el intento ya pidió y cuántas quedan.

    Es también lo que responde `POST …/hints/next`: el estado DESPUÉS de pedir (o, si la orden se repitió o cayó
    dentro de la ventana de duplicado, el mismo estado sin revelar otra).
    """

    available = serializers.IntegerField(help_text="Cuántas quedan por pedir en esta escena.")
    shown = ShownHintSerializer(many=True)
    reason = serializers.ChoiceField(
        choices=HINT_REASONS, required=False, help_text="Solo si no quedan: la escena no tiene o ya se pidieron todas."
    )


class SurveyRequestSerializer(serializers.Serializer):
    """Lo que el estudiante envía: la calificación y, si quiere, un comentario (la validación es del servicio)."""

    rating = serializers.IntegerField(min_value=1, max_value=5, help_text="Entero de 1 a 5.")
    comment = serializers.CharField(
        required=False, allow_blank=True, max_length=500, help_text="Texto plano, sin marcado ni enlaces."
    )


class SurveyStateSerializer(serializers.Serializer):
    """La encuesta breve de un intento: si ya se respondió y, en ese caso, qué respondió."""

    submitted = serializers.BooleanField()
    rating = serializers.IntegerField(required=False, help_text="Solo si ya respondió.")
    comment = serializers.CharField(required=False, allow_blank=True, help_text="Solo si ya respondió; puede ser vacío.")
    submittedAt = serializers.DateTimeField(required=False, help_text=f"Solo si ya respondió. {LOCAL_TIME}")

# ─── GET|POST /api/{admin,authoring}/cases/{id}/lifecycle  (C4) ───────────────
class LifecycleBlockedReasonSerializer(serializers.Serializer):
    """Por qué hoy no se puede enviar a revisión ni aprobar: el primer bloqueo."""

    code = serializers.CharField(help_text="Estable: `CHECKLIST_INCOMPLETE`, `VALIDATION_ERRORS`…")
    message = serializers.CharField()


class ContentReviewSerializer(serializers.Serializer):
    """La constancia de la revisión de contenido de Psicología."""

    reviewer = serializers.CharField()
    reviewedOn = serializers.DateField(allow_null=True)
    reference = serializers.CharField(help_text="El acta o la referencia de la revisión.")


class CaseReviewSerializer(serializers.Serializer):
    """La última revisión de la versión. Mientras nadie la decide solo trae quién la pidió y cuándo."""

    requestedBy = serializers.CharField(allow_null=True)
    requestedAt = serializers.DateTimeField(help_text=LOCAL_TIME)
    decision = serializers.ChoiceField(choices=ReviewDecision.choices, required=False, help_text="Solo si ya se decidió.")
    decidedBy = serializers.CharField(allow_null=True, required=False)
    decidedAt = serializers.DateTimeField(allow_null=True, required=False, help_text=f"Solo si ya se decidió. {LOCAL_TIME}")
    note = serializers.CharField(required=False, help_text="Solo si ya se decidió; puede venir vacía.")
    reason = serializers.ChoiceField(
        choices=ReviewReason.choices, required=False, help_text="Solo si se devolvió a borrador."
    )
    contentReview = ContentReviewSerializer(required=False, help_text="Solo si la aprobación trae constancia.")


class ChecklistItemSerializer(serializers.Serializer):
    """Un ítem de la lista de publicación y quién lo respalda (S3-3)."""

    code = serializers.CharField(help_text="Estable: `contentOriginal`, `ethicsReviewed`, `safetyProtocols`…")
    label = serializers.CharField()
    required = serializers.BooleanField(help_text="Si la publicación lo exige hoy: seis ítems, o siete con la revisión de contenido.")
    fulfilled = serializers.BooleanField(help_text="Si la última lista guardada lo tiene marcado.")
    draft = serializers.BooleanField(help_text="Su texto es un borrador pendiente de la validación de Psicología.")
    backing = serializers.ChoiceField(
        choices=CHECKLIST_BACKINGS,
        help_text="Quién lo respalda: el sistema, la constancia de Psicología o solo la declaración de quien autora.",
    )
    backed = serializers.BooleanField(
        allow_null=True, help_text="Si el dato que lo respalda existe ahora; `null` si es solo una declaración."
    )
    backingLabel = serializers.CharField(help_text="El respaldo en lenguaje llano, para mostrarlo tal cual.")


class ChecklistContentReviewSerializer(serializers.Serializer):
    """La constancia de Psicología vista desde la lista: si existe y, cuando existe, sus datos."""

    fulfilled = serializers.BooleanField()
    reviewer = serializers.CharField(required=False, help_text="Solo si ya hay constancia.")
    reviewedOn = serializers.DateField(allow_null=True, required=False, help_text="Solo si ya hay constancia.")
    reference = serializers.CharField(
        required=False, help_text="El acta o la referencia de la revisión. Solo si ya hay constancia."
    )


class CaseChecklistSerializer(serializers.Serializer):
    """La lista de publicación del caso con quién respalda cada casilla (S3-3): la misma que trae el editor."""

    items = ChecklistItemSerializer(many=True)
    contentReview = ChecklistContentReviewSerializer()
    strict = serializers.BooleanField(
        help_text="Si rige la revisión de contenido de Psicología (`SIEP_REVIEW_WORKFLOW_STRICT`): publicar exige la constancia."
    )


class CaseLifecycleSerializer(serializers.Serializer):
    """El ciclo de vida de una versión: su estado, lo que esta persona puede hacer, su lista de publicación y la última revisión (C4)."""

    caseVersionId = serializers.IntegerField(help_text="En `clone`, la versión NUEVA que se creó.")
    state = serializers.ChoiceField(choices=CaseVersionStatus.choices)
    allowedTransitions = serializers.ListField(
        child=serializers.ChoiceField(choices=LIFECYCLE_ACTIONS), help_text="Las acciones que esta persona puede hacer hoy."
    )
    checklist = CaseChecklistSerializer(
        help_text="La lista de publicación con el respaldo de cada casilla: quien revisa la ve sin pedir el caso entero (S3-3)."
    )
    blockedReason = LifecycleBlockedReasonSerializer(
        required=False, help_text="Solo si puede enviar o aprobar y algo lo impide."
    )
    review = CaseReviewSerializer(required=False, help_text="Solo si la versión ya tuvo una revisión.")


class CaseBlockerSerializer(serializers.Serializer):
    """Un bloqueo de publicación: la lista incompleta o los errores de validación (con sus hallazgos)."""

    code = serializers.CharField()
    message = serializers.CharField()
    issues = ValidationIssueSerializer(many=True, required=False, help_text="Solo en `VALIDATION_ERRORS`.")


class CaseConflictEnvelopeSerializer(ErrorEnvelopeSerializer):
    """El 409 de una transición del caso. Cada motivo suma sus campos en la raíz:

    `INVALID_TRANSITION` → `state` y `action`; `CASE_NOT_PUBLISHABLE` → `blockers`; `REVISION_CONFLICT` → `revision` y
    `current` (el editor tal como está ahora).
    """

    state = serializers.ChoiceField(choices=CaseVersionStatus.choices, required=False)
    action = serializers.ChoiceField(choices=LIFECYCLE_ACTIONS, required=False)
    blockers = CaseBlockerSerializer(many=True, required=False)
    revision = serializers.IntegerField(required=False, help_text="La revisión vigente del caso.")
    current = serializers.DictField(required=False, help_text="El editor del caso con los cambios de la otra sesión.")


# ─── GET /api/simulation/attempts/{attempt_id} ────────────────────────────────
class DecisionOptionStateSerializer(serializers.Serializer):
    """Una opción de decisión tal como la ve quien juega: solo su id y su texto (ni clase ni efectos, antes de decidir)."""

    id = serializers.IntegerField()
    text = serializers.CharField()


class PersonaStateSerializer(serializers.Serializer):
    """La persona consultante en palabras: su vínculo y su activación en la ficción, sin cifras."""

    bond = serializers.ChoiceField(choices=[valor.value for valor in Bond])
    activation = serializers.ChoiceField(choices=[valor.value for valor in Activation])
    label = serializers.CharField(help_text="La frase para el estudiante: «se muestra cautelosa y tensa».")


class CurrentNodeSerializer(serializers.Serializer):
    """La escena actual del intento. ``options`` va vacía si el intento no está en juego o la escena es terminal."""

    id = serializers.IntegerField()
    key = serializers.CharField()
    title = serializers.CharField()
    narrative = serializers.CharField()
    supportResources = serializers.ListField(child=serializers.CharField())
    requiredTools = serializers.ListField(child=serializers.CharField())
    sensitiveContent = serializers.BooleanField()
    safeExitRequired = serializers.BooleanField()
    warningMessage = serializers.CharField(allow_null=True)
    intensity = serializers.ChoiceField(
        choices=[valor.value for valor in Intensity], help_text="Cuánta carga emocional trae la escena."
    )
    terminal = serializers.BooleanField()
    decisionPrompt = serializers.CharField()
    displayOrder = serializers.IntegerField()
    options = DecisionOptionStateSerializer(many=True)


class AttemptStateSerializer(serializers.Serializer):
    """El estado del intento (inicio, lectura, reanudación): la escena, la persona y, al completar, el informe congelado.

    Ninguna cifra llega al estudiante: ni puntaje, ni estrés, ni métricas, ni estado clínico (`test_no_numbers_to_student`).

    La respuesta lleva además `attemptToken` (la credencial del intento, que el cliente reenvía en la cabecera): este
    contrato NO la declara a propósito, porque el documento no publica ninguna propiedad con nombre de credencial
    (`test_openapi_schema_never_exposes_prohibited_fields`). Su prueba la admite como la única clave de más.
    """

    attemptId = serializers.CharField(help_text="UUID del intento.")
    caseVersionId = serializers.IntegerField()
    caseTitle = serializers.CharField()
    status = serializers.ChoiceField(choices=AttemptStatus.choices)
    persona = PersonaStateSerializer()
    currentNode = CurrentNodeSerializer()
    completionReport = serializers.DictField(
        allow_null=True,
        help_text=(
            "El informe congelado (schemaVersion 3) de un intento completado; nulo mientras no lo está. Su forma "
            "(hitos, persona, final con su razón, revisión de decisiones, niveles con su evidencia) la fija "
            "`attempt_report`; tiparla campo a campo queda fuera de este contrato."
        ),
    )
    supportResources = serializers.ListField(
        child=serializers.CharField(), help_text="Recursos de apoyo: solo si el intento está en pausa o salió de forma segura."
    )

"""Simulation core models.

Note: support_resources_json / required_tools_json are TEXT columns holding
JSON strings (not jsonb), so they are TextField and parsed in serializers.
"""
from django.conf import settings
from django.db import models

from apps.simulation.casedef.vocabulary import Intensity, ResponseClass


class CaseVersionStatus(models.TextChoices):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class ReviewDecision(models.TextChoices):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ReviewReason(models.TextChoices):
    """Por qué una revisión devuelve el caso a borrador: de forma o de contenido (consejo §9.1-B)."""

    FORMA = "FORMA"
    CONTENIDO = "CONTENIDO"


class SimulationCase(models.Model):
    code = models.CharField(max_length=80, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    active = models.BooleanField(default=True, db_default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="created_by",
        related_name="simulation_cases",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "simulation_cases"

    def __str__(self):
        return self.code


class CaseVersion(models.Model):
    simulation_case = models.ForeignKey(
        SimulationCase, on_delete=models.DB_CASCADE, related_name="versions",
        db_column="simulation_case_id",
    )
    semantic_version = models.CharField(max_length=32)
    status = models.CharField(
        max_length=24, choices=CaseVersionStatus.choices, default=CaseVersionStatus.DRAFT
    )
    narrative_context = models.TextField(blank=True, null=True)
    # Los objetivos de aprendizaje del caso (E3-4, RF-16): una lista de textos planos en JSON
    # (como los demás ``*_json``). Los redacta Psicología; ``[]`` = el caso aún no los tiene.
    learning_objectives = models.TextField(default="[]", db_default="[]")
    cloned_from = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.DO_NOTHING, db_column="cloned_from_id"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    # El sello de lo publicado (E4-4, R13): cuándo se validó el documento de la versión y la huella
    # (``sha256:`` + 64 hex) de ese documento. Lo escribe la compuerta (``authoring.gate``) junto con
    # ``PUBLISHED``; sin sello no se arranca un intento. Los dos o ninguno (``case_versions_seal_check``).
    validated_at = models.DateTimeField(null=True, blank=True)
    definition_hash = models.CharField(max_length=71, null=True, blank=True)
    # Cuánto del original sobrevive idéntico en un clon al publicarlo (E4-7, RQ-NEG-007): entre 0 y 1 con cuatro
    # decimales; vacío en un original y en lo publicado antes de E4. Lo escribe la compuerta (``authoring.gate``).
    reuse_ratio = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="created_by",
        related_name="created_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Optimistic-lock column (Spring @Version) + world schema version.
    version = models.BigIntegerField(default=0, db_default=0)
    world_schema_version = models.IntegerField(default=1, db_default=1)
    # Reglas de la versión (JSON en TEXT, como los demás): ``secondChance`` (¿se concede una
    # segunda oportunidad ante una primera respuesta con riesgo o contraindicada?), ``milestones``,
    # ``riskLevel`` y ``endings``. Ausente = segunda oportunidad apagada (ED-7). Ver
    # ``services/case_rules.py``.
    rules = models.TextField(default="{}", db_default="{}")
    # E2 (revisión de fase, R15): quién editó por última vez y desde qué revisión lo hace en
    # solitario. Una revisión vencida de la MISMA persona (otra pestaña, un guardado cuya respuesta
    # se canceló) no es un conflicto mientras nadie más haya editado después
    # (``authoring.guards.check_revision``). Un clon empieza sin historial.
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DB_SET_NULL, null=True, blank=True,
        db_column="last_edited_by", related_name="+",
    )
    edited_alone_since = models.BigIntegerField(default=0, db_default=0)

    class Meta:
        db_table = "case_versions"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=CaseVersionStatus.values), name="case_versions_status_check"),
            models.CheckConstraint(
                condition=(
                    models.Q(validated_at__isnull=True, definition_hash__isnull=True)
                    | models.Q(validated_at__isnull=False, definition_hash__isnull=False)
                ),
                name="case_versions_seal_check",
            ),
            models.CheckConstraint(
                condition=models.Q(reuse_ratio__isnull=True) | (models.Q(reuse_ratio__gte=0) & models.Q(reuse_ratio__lte=1)),
                name="case_versions_reuse_ratio_check",
            ),
            models.UniqueConstraint(fields=["simulation_case", "semantic_version"], name="case_versions_simulation_case_id_semantic_version_key"),
        ]
        indexes = [
            models.Index(fields=["simulation_case", "status"], name="idx_case_versions_case_status"),
        ]

    def __str__(self):
        return f"{self.simulation_case.code} v{self.semantic_version}"


class CaseReview(models.Model):
    """Una revisión de una versión del caso (E2-5): quién la pidió y quién la decidió.

    Mientras ``decision`` es nulo la revisión está **pendiente** (la versión está en
    ``IN_REVIEW``); solo puede haber una pendiente por versión. La constancia de revisión de
    contenido de Psicología (revisor, fecha y referencia o acta) se registra al aprobar y es
    obligatoria con ``REVIEW_WORKFLOW_STRICT`` (R5 del plan E2).
    """

    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, related_name="reviews", db_column="case_version_id"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="requested_by",
        related_name="case_reviews_requested",
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
        db_column="decided_by", related_name="case_reviews_decided",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision = models.CharField(max_length=10, choices=ReviewDecision.choices, null=True, blank=True)
    reason = models.CharField(max_length=10, choices=ReviewReason.choices, null=True, blank=True)
    note = models.TextField(blank=True, default="", db_default="")
    content_reviewer = models.CharField(max_length=255, null=True, blank=True)
    content_reviewed_on = models.DateField(null=True, blank=True)
    content_reference = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "case_reviews"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(decision__isnull=True) | models.Q(decision__in=ReviewDecision.values),
                name="case_reviews_decision_check",
            ),
            models.CheckConstraint(
                condition=models.Q(reason__isnull=True) | models.Q(reason__in=ReviewReason.values),
                name="case_reviews_reason_check",
            ),
            models.CheckConstraint(
                condition=~models.Q(decision=ReviewDecision.REJECTED) | models.Q(reason__isnull=False),
                name="case_reviews_rejection_has_reason_check",
            ),
            models.UniqueConstraint(
                fields=["case_version"],
                condition=models.Q(decision__isnull=True),
                name="uq_case_reviews_one_pending",
            ),
        ]
        indexes = [
            models.Index(fields=["case_version", "requested_at"], name="idx_case_reviews_version"),
        ]

    def __str__(self):
        return f"revisión {self.pk} de la versión {self.case_version_id} ({self.decision or 'PENDIENTE'})"


class SimulationNode(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, related_name="nodes", db_column="case_version_id"
    )
    node_key = models.CharField(max_length=120)
    title = models.CharField(max_length=255)
    narrative = models.TextField()
    support_resources_json = models.TextField(default="[]", db_default="[]")
    required_tools_json = models.TextField(default="[]", db_default="[]")
    sensitive_content = models.BooleanField(default=False, db_default=False)
    safe_exit_required = models.BooleanField(default=False, db_default=False)
    warning_message = models.TextField(blank=True, null=True)
    start_node = models.BooleanField(default=False, db_default=False)
    terminal_node = models.BooleanField(default=False, db_default=False)
    position_x = models.IntegerField(null=True, blank=True, default=0)
    position_y = models.IntegerField(null=True, blank=True, default=0)
    # El enunciado de la decisión (E3-6, RF-06): lo que el estudiante lee antes de elegir. Texto
    # plano y blando: vacío = la escena no lo declara.
    decision_prompt = models.TextField(default="", db_default="")
    # Orden informativo con que el editor lista los nodos (E3-6, RF-08): no cambia el grafo.
    display_order = models.IntegerField(default=0, db_default=0)
    # La intensidad de la escena (modelo de respuesta): ``LOW`` | ``MEDIUM`` | ``HIGH``; ``HIGH`` por defecto en las
    # escenas con ``sensitive_content``. Ver ``casedef.vocabulary.Intensity``.
    intensity = models.CharField(max_length=8, default=Intensity.MEDIUM.value, db_default=Intensity.MEDIUM.value)
    # Sugerido por el asistente de IA y aún sin revisar (P5): la compuerta de publicación no deja pasar mientras esté en alto.
    ai_suggested = models.BooleanField(default=False, db_default=False)

    class Meta:
        db_table = "simulation_nodes"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(intensity__in=[member.value for member in Intensity]),
                name="simulation_nodes_intensity_check",
            ),
            models.UniqueConstraint(fields=["case_version", "node_key"], name="simulation_nodes_case_version_id_node_key_key"),
        ]

    def __str__(self):
        return self.node_key


class DecisionOption(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.DB_CASCADE, related_name="decisions", db_column="case_version_id"
    )
    option_key = models.CharField(max_length=120)
    source_node = models.ForeignKey(
        SimulationNode, on_delete=models.DB_CASCADE, related_name="options", db_column="source_node_id"
    )
    target_node = models.ForeignKey(
        SimulationNode, on_delete=models.DB_CASCADE, related_name="incoming_options",
        db_column="target_node_id",
    )
    text = models.TextField()
    immediate_feedback = models.TextField(default="")
    prohibition_reason = models.TextField(blank=True, null=True)
    # Consecuencia narrativa (lo que se ve al elegir) frente a retroalimentación pedagógica (lo
    # que se explica al cierre, con su fundamento): decisiones 6 y 10, RN-08 (E1-7). Vacíos: la
    # consecuencia cae a la narrativa del nodo destino y la explicación a ``immediate_feedback``.
    consequence_text = models.TextField(blank=True, null=True)
    theory_basis = models.TextField(blank=True, null=True)
    feedback_text = models.TextField(blank=True, null=True)
    # Los efectos de la opción como datos del caso: ``{persona, milestones, competencies}``. Vacío = la opción no
    # trae efectos propios (la persona se mueve según su clase y no marca hitos).
    effects = models.TextField(default="{}", db_default="{}")
    # La clase de la respuesta (modelo de respuesta): ``RECOMMENDED`` | ``ACCEPTABLE`` | ``RISKY`` |
    # ``CONTRAINDICATED``; ver ``casedef.vocabulary.ResponseClass``. Toda opción la tiene: la ``CONTRAINDICATED`` es la
    # conducta que se debe evitar y exige ``prohibition_reason``.
    response_class = models.CharField(max_length=24)
    # Sugerido por el asistente de IA y aún sin revisar (P5): la compuerta de publicación no deja pasar mientras esté en alto.
    ai_suggested = models.BooleanField(default=False, db_default=False)

    class Meta:
        db_table = "decision_options"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(response_class__isnull=True)
                | models.Q(response_class__in=[member.value for member in ResponseClass]),
                name="decision_options_response_class_check",
            ),
            models.UniqueConstraint(fields=["case_version", "option_key"], name="decision_options_case_version_id_option_key_key"),
        ]

    def __str__(self):
        return self.option_key

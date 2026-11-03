"""Rubric / checklist / audit models."""
from django.conf import settings
from django.db import models

from .attempt import SimulationAttempt
from .case import CaseVersion

PUBLICATION_STATUSES = ["PENDING", "COMPLETE", "REJECTED"]


class FormativeLevel(models.TextChoices):
    """Niveles cualitativos de la evaluación formativa (RN-09, ED-2): no son una nota."""

    EN_INICIO = "EN_INICIO"
    EN_PROCESO = "EN_PROCESO"
    LOGRADO = "LOGRADO"
    DESTACADO = "DESTACADO"


#: Índice interno 1–4 de cada nivel (para promediar por ponderación); nunca se muestra como nota.
LEVEL_INDEX = {
    FormativeLevel.EN_INICIO: 1,
    FormativeLevel.EN_PROCESO: 2,
    FormativeLevel.LOGRADO: 3,
    FormativeLevel.DESTACADO: 4,
}


class EvaluationOrigin(models.TextChoices):
    """Quién produjo la evaluación: el docente o el sistema (evaluación automática, E6)."""

    SISTEMA = "SISTEMA"
    DOCENTE = "DOCENTE"


class Rubric(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.CASCADE, null=True, blank=True,
        related_name="rubrics", db_column="case_version_id",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    active = models.BooleanField(default=True, db_default=True)
    version = models.CharField(max_length=30, default="1.0", db_default="1.0")
    is_default = models.BooleanField(default=False, db_default=False)
    updated_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="created_by",
        related_name="rubrics_creadas",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "rubrics"


class Competency(models.Model):
    """Una competencia del catálogo del programa (RQ-NEG-002, E3-9).

    Es la base de la analítica por competencia (E6): un código estable (mayúsculas, sin espacios),
    un nombre y su descripción. El ADMIN amplía el catálogo; el personal lo lee. Los criterios de
    las rúbricas la referencian con ``competency_id`` sin perder su texto libre ``competency``.
    """

    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(default="", db_default="")
    active = models.BooleanField(default=True, db_default=True)
    sort_order = models.IntegerField(default=0, db_default=0)

    class Meta:
        db_table = "competencies"
        ordering = ["sort_order", "code"]

    def __str__(self):
        return self.code


class RubricCriterion(models.Model):
    rubric = models.ForeignKey(
        Rubric, on_delete=models.CASCADE, related_name="criteria", db_column="rubric_id"
    )
    competency = models.CharField(max_length=100)
    #: La competencia del catálogo a la que apunta el criterio (el texto libre de arriba se
    #: conserva); se desvincula si la competencia se borra.
    competency_ref = models.ForeignKey(
        Competency, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="criteria", db_column="competency_id",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    max_score = models.IntegerField(default=0, db_default=0)
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=0, db_default=0)
    active = models.BooleanField(default=True, db_default=True)
    display_order = models.IntegerField(default=0, db_default=0)

    class Meta:
        db_table = "rubric_criteria"
        ordering = ["display_order"]


class RubricEvaluation(models.Model):
    attempt = models.ForeignKey(
        SimulationAttempt, on_delete=models.CASCADE, related_name="rubric_evaluations",
        db_column="attempt_id",
    )
    rubric = models.ForeignKey(Rubric, on_delete=models.DO_NOTHING, db_column="rubric_id")
    # Quien evaluó: el docente. La evaluación automática del sistema (E6-1c, ``origin = SISTEMA``) no tiene docente:
    # el CHECK de abajo exige que ``instructor`` sea nulo si y solo si el origen es el sistema.
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="instructor_id", null=True, blank=True,
    )
    total_score = models.DecimalField(max_digits=10, decimal_places=2, default=0, db_default=0)
    comment = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, default="PENDING", db_default="PENDING")
    snapshot_json = models.TextField(default="{}", db_default="{}")
    origin = models.CharField(
        max_length=10, choices=EvaluationOrigin.choices,
        default=EvaluationOrigin.DOCENTE, db_default=EvaluationOrigin.DOCENTE,
    )
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    evaluated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "rubric_evaluations"
        constraints = [
            models.UniqueConstraint(fields=["attempt", "rubric", "instructor"], name="rubric_evaluations_attempt_id_rubric_id_instructor_id_key"),
            models.CheckConstraint(
                condition=models.Q(origin__in=EvaluationOrigin.values),
                name="rubric_evaluations_origin_check",
            ),
            # E6-1c: «sistema» y «sin docente» van juntos; la del docente siempre dice quién la hizo.
            models.CheckConstraint(
                condition=(
                    models.Q(origin=EvaluationOrigin.SISTEMA, instructor__isnull=True)
                    | models.Q(origin=EvaluationOrigin.DOCENTE, instructor__isnull=False)
                ),
                name="rubric_evaluations_origin_instructor_check",
            ),
            # E6-1c: el sistema evalúa una sola vez cada intento con cada rúbrica (el cierre es idempotente).
            models.UniqueConstraint(
                fields=["attempt", "rubric"], condition=models.Q(origin=EvaluationOrigin.SISTEMA),
                name="uq_rubric_evaluations_system_attempt_rubric",
            ),
        ]


class CriterionScore(models.Model):
    rubric_evaluation = models.ForeignKey(
        RubricEvaluation, on_delete=models.CASCADE, related_name="criterion_scores",
        db_column="rubric_evaluation_id",
    )
    rubric_criterion = models.ForeignKey(
        RubricCriterion, on_delete=models.CASCADE, db_column="rubric_criterion_id"
    )
    score = models.DecimalField(max_digits=10, decimal_places=2, default=0, db_default=0)
    # Nivel formativo (E1-9): lo que se muestra; ``score`` queda como dato interno del docente.
    level = models.CharField(max_length=20, choices=FormativeLevel.choices, null=True, blank=True)
    comment = models.TextField(null=True, blank=True)
    evidence_json = models.TextField(default="[]", db_default="[]")

    class Meta:
        db_table = "criterion_scores"
        constraints = [
            models.UniqueConstraint(fields=["rubric_evaluation", "rubric_criterion"], name="criterion_scores_rubric_evaluation_id_rubric_criterion_id_key"),
            models.CheckConstraint(
                condition=models.Q(level__isnull=True) | models.Q(level__in=FormativeLevel.values),
                name="criterion_scores_level_check",
            ),
        ]


class SimulationRubricAssignment(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.CASCADE, related_name="rubric_assignments",
        db_column="case_version_id",
    )
    rubric = models.ForeignKey(Rubric, on_delete=models.DO_NOTHING, db_column="rubric_id")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
        db_column="assigned_by",
    )
    active = models.BooleanField(default=True, db_default=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "simulation_rubric_assignments"
        constraints = [
            models.UniqueConstraint(fields=["case_version"], condition=models.Q(active=True), name="uq_active_case_version_rubric_assignment"),
        ]


class PublicationChecklist(models.Model):
    case_version = models.ForeignKey(
        CaseVersion, on_delete=models.CASCADE, related_name="checklists", db_column="case_version_id"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, db_column="submitted_by"
    )
    completion_ratio = models.DecimalField(max_digits=5, decimal_places=2, default=0, db_default=0)
    status = models.CharField(max_length=30, default="PENDING")
    submitted_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "publication_checklists"
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=PUBLICATION_STATUSES), name="publication_checklists_status_check"),
        ]


class PublicationChecklistItem(models.Model):
    checklist = models.ForeignKey(
        PublicationChecklist, on_delete=models.CASCADE, related_name="items", db_column="checklist_id"
    )
    code = models.CharField(max_length=80)
    label = models.CharField(max_length=255)
    required = models.BooleanField(default=True, db_default=True)
    fulfilled = models.BooleanField(default=False, db_default=False)
    evidence_note = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "publication_checklist_items"
        constraints = [
            models.UniqueConstraint(fields=["checklist", "code"], name="publication_checklist_items_checklist_id_code_key"),
        ]


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DO_NOTHING, null=True, blank=True,
        db_column="actor_id", related_name="+",
    )
    actor_role = models.CharField(max_length=40, null=True, blank=True)
    action = models.CharField(max_length=120)
    resource_type = models.CharField(max_length=100, null=True, blank=True)
    resource_id = models.CharField(max_length=120, null=True, blank=True)
    context_json = models.TextField(default="{}", db_default="{}")
    ip_address = models.CharField(max_length=80, null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)
    retention_until = models.DateTimeField()

    class Meta:
        db_table = "audit_logs"
        indexes = [
            models.Index(fields=["occurred_at"], name="idx_audit_logs_time"),
            models.Index(fields=["retention_until"], name="idx_audit_logs_retention"),
        ]


class AuthoringAssistantUsage(models.Model):
    """Consumo diario del asistente de IA de autoría (P5): una fila por persona y día.

    ``limits.consume`` la reserva ANTES de llamar al proveedor (bajo ``select_for_update``) y
    ``limits.refund`` la devuelve si el proveedor falla.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_column="user_id", related_name="+",
    )
    day = models.DateField()
    count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "authoring_assistant_usage"
        constraints = [
            models.UniqueConstraint(fields=["user", "day"], name="uq_authoring_assistant_usage_user_day"),
        ]

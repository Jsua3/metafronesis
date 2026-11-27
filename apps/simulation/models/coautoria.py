"""El acuerdo de coautoría (IA coautora, fase 1): la idea del docente, las preguntas que la IA le hizo con sus respuestas y
la ficha «Lo que acordamos». Lo usa ``apps/ia/coautorias.py``; diseño en ``docs/diseno/2026-11-25-ia-coautora-del-editor.md``.

Nace para un caso nuevo (``lugar_id``) o para uno que se edita (``case_version``), nunca para los dos."""
import uuid

from django.conf import settings
from django.db import models


class AgreementStatus(models.TextChoices):
    #: La IA está haciendo preguntas (``question_json`` es la pendiente; vacía si hay que volver a pedirla).
    CLARIFYING = "clarifying"
    #: No hay más preguntas: falta pedir el resumen.
    READY = "ready"
    #: Hay una ficha que el docente puede aceptar, corregir o pedir cambiar.
    SUMMARIZED = "summarized"
    ACCEPTED = "accepted"
    CANCELLED = "cancelled"


AgreementStatus.OPEN = (AgreementStatus.CLARIFYING, AgreementStatus.READY, AgreementStatus.SUMMARIZED)


class CoauthorAgreement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="coauthor_agreements")
    lugar_id = models.CharField(max_length=64, blank=True, default="")
    case_version = models.ForeignKey("simulation.CaseVersion", null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    idea = models.TextField()
    turns_json = models.TextField(default="[]")
    question_json = models.TextField(default="{}")
    agreement_json = models.TextField(default="{}")
    status = models.CharField(max_length=20, choices=AgreementStatus.choices, default=AgreementStatus.CLARIFYING)
    calls = models.PositiveSmallIntegerField(default=0)
    busy_since = models.DateTimeField(null=True, blank=True)
    generation = models.ForeignKey("simulation.CaseGeneration", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "authoring_coauthor_agreements"
        indexes = [models.Index(fields=["owner", "created_at"], name="idx_coauthor_owner_created")]
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=AgreementStatus.values), name="coauthor_status_check"),
            models.CheckConstraint(
                condition=(models.Q(case_version__isnull=True) & ~models.Q(lugar_id=""))
                | (models.Q(case_version__isnull=False) & models.Q(lugar_id="")),
                name="coauthor_one_target_check",
            ),
        ]

import uuid

from django.conf import settings
from django.db import models


class GenerationStatus(models.TextChoices):
    CREATED = "created"
    SKELETON_READY = "skeleton_ready"
    SCENES_READY = "scenes_ready"
    NEEDS_REPAIR = "needs_repair"
    IMPORTED = "imported"
    FAILED = "failed"
    CANCELLED = "cancelled"


GenerationStatus.IN_PROGRESS = (GenerationStatus.CREATED, GenerationStatus.SKELETON_READY, GenerationStatus.SCENES_READY, GenerationStatus.NEEDS_REPAIR)


class CaseGeneration(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="case_generations")
    lugar_id = models.CharField(max_length=64)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=GenerationStatus.choices, default=GenerationStatus.CREATED)
    skeleton_json = models.TextField(default="{}")
    scenes_json = models.TextField(default="{}")
    skeleton_started_at = models.DateTimeField(null=True)
    repair_rounds = models.PositiveSmallIntegerField(default=0)
    repair_json = models.TextField(default="{}")
    report_json = models.TextField(default="[]")
    document_json = models.TextField(default="")
    last_error_json = models.TextField(default="{}")
    calls = models.PositiveSmallIntegerField(default=0)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    case_version = models.ForeignKey("simulation.CaseVersion", null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "authoring_generations"
        constraints = [models.UniqueConstraint(fields=["owner"], condition=models.Q(status__in=GenerationStatus.IN_PROGRESS), name="uq_generation_in_progress_per_owner")]
        indexes = [models.Index(fields=["owner", "created_at"], name="idx_generation_owner_created")]

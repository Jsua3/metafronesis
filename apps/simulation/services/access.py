"""Política S3: publicación, asignación vigente y membresía aceptada."""

from django.db.models import Q
from django.utils import timezone
from apps.grupos.models import CaseAssignment, GrupoEstudiante
from apps.simulation.models import CaseVersion


def available_versions(user):
    now = timezone.now()
    groups = GrupoEstudiante.objects.filter(
        estudiante=user, status="ACTIVE", grupo__activo=True
    ).values("grupo_id")
    assignments = (
        CaseAssignment.objects.filter(active=True)
        .filter(Q(estudiante=user) | Q(grupo_id__in=groups))
        .filter(Q(opens_at__isnull=True) | Q(opens_at__lte=now))
        .filter(Q(closes_at__isnull=True) | Q(closes_at__gt=now))
    )
    return CaseVersion.objects.filter(
        pk__in=assignments.values("case_version_id"),
        status="PUBLISHED",
        simulation_case__active=True,
        validated_at__isnull=False,
        definition_hash__isnull=False,
    )

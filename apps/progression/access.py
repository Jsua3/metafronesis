"""Secuencia mínima: completar los anteriores vigentes para iniciar uno nuevo."""

from django.db.models import Q
from django.utils import timezone
from apps.grupos.models import CaseAssignment, GrupoEstudiante
from .models import StudentCaseCompletion


def catalog(student):
    now = timezone.now()
    groups = GrupoEstudiante.objects.filter(
        estudiante=student, status="ACTIVE", grupo__activo=True
    ).values("grupo_id")
    assignments = (
        CaseAssignment.objects.filter(active=True)
        .filter(Q(estudiante=student) | Q(grupo_id__in=groups))
        .select_related("case_version__simulation_case")
    )
    by_version = {}
    for assignment in assignments:
        version = assignment.case_version
        if (
            version.status != "PUBLISHED"
            or not version.simulation_case.active
            or not version.validated_at
            or not version.definition_hash
        ):
            continue
        by_version.setdefault(version.pk, []).append(assignment)
    completed = set(
        StudentCaseCompletion.objects.filter(student_id=student.pk).values_list(
            "simulation_case_id", flat=True
        )
    )
    ordered = sorted(
        by_version.values(),
        key=lambda entries: (
            min(a.sort_order for a in entries),
            entries[0].case_version.simulation_case_id,
            entries[0].case_version_id,
        ),
    )
    blocked = False
    items = []
    for entries in ordered:
        version = entries[0].case_version
        open_now = any(
            (a.opens_at is None or a.opens_at <= now)
            and (a.closes_at is None or now < a.closes_at)
            for a in entries
        )
        future = any(a.opens_at is not None and a.opens_at > now for a in entries)
        closed = not open_now and not future
        done = version.simulation_case_id in completed
        reason = (
            "NOT_YET_OPEN"
            if future and not open_now
            else "CLOSED"
            if closed
            else "LOCKED_BY_SEQUENCE"
            if blocked
            else None
        )
        items.append(
            {
                "case_version_id": version.pk,
                "case_id": version.simulation_case_id,
                "title": version.simulation_case.title,
                "completed": done,
                "allowed": reason is None,
                "reason": reason,
            }
        )
        if not done and not closed:
            blocked = True
    return items


def can_start(student, version_id):
    return any(
        item["case_version_id"] == version_id and item["allowed"]
        for item in catalog(student)
    )

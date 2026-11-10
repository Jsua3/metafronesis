from decimal import Decimal

from django.db import transaction
from django.http import Http404

from apps.simulation.models import CaseVersion, CaseVersionStatus, Rubric, RubricCriterion, SimulationRubricAssignment
from apps.simulation.services.audit_service import auditable
from shared import policies
from shared.exceptions import ApiError


@transaction.atomic
@auditable("RUBRIC_CREATED", "RUBRIC", resource_id=lambda args, kwargs, result: result.pk)
def crear_rubrica(docente, nombre: str, criterios: list[dict]) -> Rubric:
    if not criterios or sum((c["weight"] for c in criterios), Decimal("0")) != Decimal("100"):
        raise ApiError("RUBRIC_WEIGHTS", "Los pesos deben sumar 100.", 400)
    rubrica = Rubric.objects.create(name=nombre, created_by=docente)
    RubricCriterion.objects.bulk_create([
        RubricCriterion(rubric=rubrica, competency=c["competency"], title=c["competency"],
                        description=c["description"], weight=c["weight"], display_order=orden)
        for orden, c in enumerate(criterios)
    ])
    return rubrica


@transaction.atomic
@auditable("RUBRIC_UPDATED", "CASE_VERSION", resource_id=lambda args, kwargs, result: result.case_version_id)
def asociar_a_version(docente, rubric_id: int, case_version_id: int) -> SimulationRubricAssignment:
    version = CaseVersion.objects.select_for_update().filter(pk=case_version_id).first()
    rubrica = Rubric.objects.filter(pk=rubric_id).first()
    if (version is None or rubrica is None
            or not policies.can(docente, "case", "author", owner_id=version.created_by_id)
            or not policies.can(docente, "rubric", "edit", owner_id=rubrica.created_by_id)):
        raise Http404
    if version.status != CaseVersionStatus.DRAFT:
        raise ApiError("VERSION_NOT_EDITABLE", "La versión no se puede editar.", 409)
    SimulationRubricAssignment.objects.filter(case_version=version, active=True).update(active=False)
    return SimulationRubricAssignment.objects.create(case_version=version, rubric=rubrica, assigned_by=docente)


def rubrica_activa_de(case_version_id: int) -> Rubric | None:
    asignacion = SimulationRubricAssignment.objects.select_related("rubric").filter(
        case_version_id=case_version_id, active=True
    ).first()
    return asignacion.rubric if asignacion else None

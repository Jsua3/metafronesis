from django.db import transaction
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.simulation.models import RubricEvaluation, SimulationAttempt
from apps.simulation.models.rubric import EvaluationOrigin
from apps.simulation.services.audit_service import auditable
from apps.simulation.services.rubricas import rubrica_activa_de
from shared.exceptions import ApiError


@transaction.atomic
@auditable("ATTEMPT_FEEDBACK_SAVED", "ATTEMPT", resource_id=lambda args, kwargs, result: result.attempt_id)
def registrar_retroalimentacion_docente(intento, docente, texto: str) -> RubricEvaluation:
    texto = texto.strip()
    if not texto:
        raise ApiError("FEEDBACK_EMPTY", "La retroalimentación no puede estar vacía.", 400)
    intento = SimulationAttempt.objects.select_for_update().get(pk=intento.pk)
    rubrica = rubrica_activa_de(intento.case_version_id)
    if rubrica is None:
        raise ApiError("RUBRIC_MISSING", "El intento no tiene una rúbrica activa.", 409)
    evaluacion = RubricEvaluation.objects.filter(attempt=intento, instructor=docente, origin=EvaluationOrigin.DOCENTE).first()
    if evaluacion is None:
        evaluacion = RubricEvaluation(attempt=intento, instructor=docente, origin=EvaluationOrigin.DOCENTE, created_at=timezone.now())
    evaluacion.rubric = rubrica
    evaluacion.comment = texto
    evaluacion.updated_at = timezone.now()
    evaluacion.save()
    return evaluacion


def retroalimentacion_docente_de(intento) -> str | None:
    evaluacion = intento.rubric_evaluations.filter(origin=EvaluationOrigin.DOCENTE).order_by(Coalesce("updated_at", "evaluated_at").desc(), "-pk").first()
    return evaluacion.comment if evaluacion else None

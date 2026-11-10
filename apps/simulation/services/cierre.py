from django.db import transaction
from django.utils import timezone

from apps.simulation.assessment.evaluation import freeze
from apps.simulation.models import AttemptEvent, AttemptStatus, SimulationAttempt
from . import attempt_lifecycle as lifecycle
from .audit_service import auditable
from .calificacion import calificar_y_guardar


@auditable("ATTEMPT_EXPIRED", "ATTEMPT", resource_id=lambda args, kwargs, result: result.pk)
@transaction.atomic
def cerrar_como_incompleto(intento, motivo: str) -> SimulationAttempt:
    intento = SimulationAttempt.objects.select_for_update().get(pk=intento.pk)
    if intento.status == AttemptStatus.INCOMPLETE:
        return intento
    lifecycle.apply(intento, lifecycle.EXPIRE)
    intento.ended_at = intento.locked_at = timezone.now()
    intento.save(update_fields=["status", "ended_at", "locked_at"])
    AttemptEvent.objects.create(attempt=intento, node=intento.current_node, event_type="ATTEMPT_EXPIRED", detail=motivo)
    freeze(intento)
    calificar_y_guardar(intento)
    return intento

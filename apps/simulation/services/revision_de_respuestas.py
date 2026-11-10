from django.db import transaction

from apps.simulation.models import AttemptStatus
from apps.simulation.models.attempt import REGISTERED_DECISION_EVENT_TYPES
from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError


def decisiones_vigentes(intento):
    eventos = intento.events.filter(event_type__in=REGISTERED_DECISION_EVENT_TYPES, decision_option__isnull=False).select_related("decision_option", "node").order_by("id")
    vigentes = {}
    for evento in eventos:
        vigentes[evento.node_id] = evento
    return list(vigentes.values())


@auditable("ATTEMPT_REVISITED", "ATTEMPT", resource_id_param_index=1)
def revisitar(estudiante, attempt_id, node_id) -> dict:
    from .attempt_api import owned, _error_si_vencido

    with transaction.atomic():
        intento = owned(estudiante, attempt_id, lock=True)
        if not intento._time_expired:
            if intento.status != AttemptStatus.IN_PROGRESS:
                raise ApiError("ATTEMPT_NOT_IN_PROGRESS", "El intento no est? en curso.", 409)
            evento = next((e for e in decisiones_vigentes(intento) if e.node_id == node_id), None)
            if evento is None:
                raise ApiError("NODE_NOT_ANSWERED", "La escena no ha sido respondida.", 400)
            intento.current_node = evento.node
            intento.save(update_fields=["current_node"])
    _error_si_vencido(intento)
    return {"attemptId": str(intento.pk), "nodeId": intento.current_node_id}

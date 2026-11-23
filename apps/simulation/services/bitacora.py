"""Bitácora cifrada y salida segura del intento propio."""

from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.privacy.consent_service import require_consent
from apps.simulation.models import AttemptEvent, ReflectionJournal, SimulationAttempt, SimulationNode
from apps.simulation.services import attempt_duration, attempt_lifecycle, crypto_service, estado_intento, world
from apps.simulation.services.attempt_lock import lock_attempt_row
from apps.simulation.services.audit_service import auditable
from shared import policies
from shared.idempotency import normalize_request_id

MOTIVO_MAXIMO = 500


@auditable("REFLECTION_SAVED", "ATTEMPT", resource_id_param_index=1)
def guardar(usuario, identificador, datos):
    def ejecutar(intento):
        if not intento.is_rehearsal:  # el ensayo de la docente no pasa por el consentimiento del estudiante
            require_consent(usuario, intento.case_version)
        solicitud = normalize_request_id(datos.get("requestId"))
        nodo_id = datos["nodeId"]
        if solicitud:
            anterior = intento.events.filter(request_id=solicitud).first()
            if anterior:
                if anterior.event_type != "REFLECTION_SAVED" or anterior.node_id != nodo_id:
                    raise ValidationError("requestId ya corresponde a otra acción.")
                registro = ReflectionJournal.objects.filter(attempt=intento, node_id=nodo_id).first()
                return {"nodeId": nodo_id, "locked": bool(registro and registro.locked)}
        world._activo(intento)
        texto = datos["text"]
        if not texto.strip():
            raise ValidationError("La bitácora requiere texto.")
        nodo = get_object_or_404(SimulationNode, pk=nodo_id)
        if nodo.case_version_id != intento.case_version_id:
            raise ValidationError("El nodo no pertenece al caso del intento.")
        registro, _ = ReflectionJournal.objects.get_or_create(
            attempt=intento, node=nodo, defaults={"encrypted_text": "", "encryption_key_ref": crypto_service.key_ref()}
        )
        if registro.locked:
            raise ValidationError("La bitácora ya está bloqueada.")
        referencia = crypto_service.key_ref()
        registro.encrypted_text = crypto_service.encrypt(texto, key_ref=referencia, attempt_id=intento.pk, node_id=nodo.pk)
        registro.encryption_key_ref = referencia
        registro.save()
        attempt_duration.record_activity(intento)
        AttemptEvent.objects.create(attempt=intento, node=nodo, event_type="REFLECTION_SAVED",
                                    detail="Bitácora registrada", request_id=solicitud)
        return {"nodeId": nodo.pk, "locked": False}
    return world._ejecutar(usuario, identificador, ejecutar)


@auditable("SAFE_EXIT_REQUESTED", "ATTEMPT", resource_id_param_index=1)
def salida_segura(usuario, identificador, motivo):
    with transaction.atomic():
        lock_attempt_row(identificador)
        intento = get_object_or_404(SimulationAttempt.all_objects.select_related("case_version__simulation_case", "current_node"),
                                    pk=identificador, student=usuario)
        if intento.is_rehearsal and not policies.can(usuario, "attempt", "rehearse", owner_id=intento.student_id):
            raise Http404
        if attempt_lifecycle.state_of(intento).can(attempt_lifecycle.PAUSE):
            attempt_duration.touch(intento, timezone.now())
            attempt_lifecycle.apply(intento, attempt_lifecycle.PAUSE)
            intento.save()
            detalle = (motivo or "").strip()[:MOTIVO_MAXIMO] or "Salida segura solicitada"
            AttemptEvent.objects.create(attempt=intento, node=intento.current_node,
                                        event_type="SAFE_EXIT_REQUESTED", detail=detalle)
        return estado_intento.construir(intento)

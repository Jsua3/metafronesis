"""Ensayo del borrador (SIEP-243): la docente autora (o administración) recorre su versión en el mundo del juego.

Un ensayo es un ``SimulationAttempt`` con ``is_rehearsal=True``: usa el mismo mundo, decisiones y puertas del juego, pero
no exige asignación, consentimiento ni publicación y no aparece en reportes, revisión, historial ni resultados porque el
gestor por defecto (``SimulationAttempt.objects``) lo excluye. Solo se ensayan versiones en borrador.
"""
import hashlib
import secrets

from django.db import IntegrityError, transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.simulation.models import AttemptEvent, SimulationAttempt
from apps.simulation.services import attempt_lifecycle as lifecycle
from apps.simulation.services.attempt_lock import lock_attempt_row
from shared import policies
from shared.exceptions import ApiError

from . import guardas

MOTIVO_AJUSTE = "Escena elegida por la autora"


def _abiertos(usuario, version):
    return SimulationAttempt.all_objects.filter(
        student_id=usuario.pk, case_version_id=version.pk, is_rehearsal=True, status__in=lifecycle.OPEN_STATUSES
    ).select_related("current_node")


def _dto(intento, *, resumed):
    return {
        "attemptId": str(intento.pk), "caseVersionId": intento.case_version_id, "status": intento.status,
        "currentNodeId": intento.current_node_id, "currentNodeKey": intento.current_node.node_key, "resumed": resumed,
    }


def _crear(usuario, version):
    escena = version.nodes.filter(start_node=True).order_by("pk").first()
    if escena is None:
        raise ApiError("NO_START_NODE", "El caso no tiene escena de inicio.", 409)
    intento = SimulationAttempt.all_objects.create(
        is_rehearsal=True, student=usuario, case_version=version, current_node=escena,
        attempt_token_hash=hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
        last_activity_at=timezone.now(),
    )
    AttemptEvent.objects.create(attempt=intento, node=escena, event_type="ATTEMPT_STARTED")
    return intento


def abrir(usuario, case_version_id):
    """Crea el ensayo abierto de ``usuario`` en esa versión, o reanuda el que ya tiene. Devuelve ``(dto, creado)``."""
    with transaction.atomic():
        version = guardas.version_editable(usuario, case_version_id)
        existente = _abiertos(usuario, version).first()
        if existente is not None:
            return _dto(existente, resumed=True), False
        try:
            with transaction.atomic():
                return _dto(_crear(usuario, version), resumed=False), True
        except IntegrityError:
            # Otra pestaña lo abrió entre la lectura y la creación (``uq_rehearsal_open_per_author_case``): gana esa.
            return _dto(_abiertos(usuario, version).get(), resumed=True), False


def _propio(usuario, version, attempt_id):
    """El ensayo de esa versión que ``usuario`` puede usar: 404 si no existe, no es de esa versión o no es suyo."""
    intento = get_object_or_404(
        SimulationAttempt.all_objects.select_related("current_node"),
        pk=attempt_id, is_rehearsal=True, case_version_id=version.pk,
    )
    if not policies.can(usuario, "attempt", "rehearse", owner_id=intento.student_id):
        raise Http404
    return intento


def leer(usuario, case_version_id, attempt_id):
    with transaction.atomic():
        version = guardas.version_editable(usuario, case_version_id)
        return _dto(_propio(usuario, version, attempt_id), resumed=True)


def ajustar(usuario, case_version_id, attempt_id, datos):
    """Mueve el ensayo a otra escena de la misma versión (``irA``)."""
    with transaction.atomic():
        version = guardas.version_editable(usuario, case_version_id)
        lock_attempt_row(attempt_id)
        intento = _propio(usuario, version, attempt_id)
        if not lifecycle.state_of(intento).is_open:
            raise ApiError("REHEARSAL_CLOSED", "Este ensayo ya se cerró. Abre uno nuevo.", 409)
        destino_id = datos.get("irA")
        if destino_id is not None and destino_id != intento.current_node_id:
            destino = version.nodes.filter(pk=destino_id).first()
            if destino is None:
                raise ApiError("VALIDATION_ERROR", "La escena a la que se quiere ir no es de este caso.", 400)
            intento.current_node = destino
            intento.save(update_fields=["current_node"])
            AttemptEvent.objects.create(attempt=intento, node=destino, event_type="NODE_ENTERED", detail=MOTIVO_AJUSTE)
        return _dto(intento, resumed=True)


def descartar_de_version(case_version_id) -> int:
    """Borra los ensayos de una versión (la docente borró una escena o una respuesta); sus hijos caen con ellos."""
    intentos = SimulationAttempt.all_objects.filter(case_version_id=case_version_id, is_rehearsal=True)
    borrados, _ = intentos.delete()
    return borrados

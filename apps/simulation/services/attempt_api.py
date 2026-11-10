"""Persistencia transaccional del contrato S3 y decisión mínima S4."""

import hashlib
import json
import secrets
from copy import copy
from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from apps.simulation.models import SimulationAttempt, AttemptEvent, DecisionOption
from .access import available_versions
from . import attempt_lifecycle as lifecycle
from . import limites, reglas_de_inicio
from .cierre import cerrar_como_incompleto
from .calificacion import calificar_y_guardar
from .attempt_duration import touch, reset_clock
from .case_rules import rules_of, effects_of
from .response_effects import apply as apply_effects
from apps.simulation.assessment.evaluation import freeze
from apps.simulation.signals import attempt_completed
from apps.simulation.casedef.vocabulary import ResponseClass
from shared.exceptions import ApiError


@transaction.atomic
def start(user, version_id):
    # Serializa inicios incluso cuando aún no existe una fila de intento.
    get_user_model().objects.select_for_update().get(pk=user.pk)
    version = get_object_or_404(available_versions(user), pk=version_id)
    reglas_de_inicio.verificar(user, version)
    existing = SimulationAttempt.objects.filter(
        student=user, case_version=version, status__in=lifecycle.OPEN_STATUSES
    ).first()
    if existing:
        return existing, False
    from apps.progression.access import can_start

    if not can_start(user, version_id):
        raise ValidationError("Completa el caso anterior de la secuencia.")
    nodes = list(version.nodes.filter(start_node=True)[:2])
    if len(nodes) != 1:
        raise ValidationError("El caso debe tener exactamente una escena inicial.")
    attempt = SimulationAttempt.objects.create(
        student=user,
        case_version=version,
        current_node=nodes[0],
        attempt_token_hash=hashlib.sha256(secrets.token_bytes(32)).hexdigest(),
        last_activity_at=timezone.now(),
    )
    AttemptEvent.objects.create(
        attempt=attempt, node=nodes[0], event_type="ATTEMPT_STARTED"
    )
    return attempt, True


def _owned(user, pk):
    qs = SimulationAttempt.objects.select_for_update()
    attempt = get_object_or_404(qs, pk=pk, student=user)
    get_object_or_404(available_versions(user), pk=attempt.case_version_id)
    attempt._time_expired = _cerrar_si_vencido(attempt)
    return attempt


def _cerrar_si_vencido(attempt):
    if attempt.status not in lifecycle.OPEN_STATUSES:
        return False
    limite = limites.minutos_para(attempt)
    if limite is None:
        return False
    medido = copy(attempt)
    if attempt.status == lifecycle.INITIAL_STATUS:
        touch(medido, timezone.now())
    if medido.active_seconds <= limite * 60:
        return False
    attempt.active_seconds = medido.active_seconds
    attempt.last_activity_at = medido.last_activity_at
    attempt.save(update_fields=["active_seconds", "last_activity_at"])
    cerrar_como_incompleto(attempt, "TIEMPO")
    return True


def _error_si_vencido(attempt):
    if attempt._time_expired:
        raise ApiError("ATTEMPT_TIME_EXPIRED", "El tiempo del intento ha vencido.", 409)


def owned(user, pk, lock=False):
    if lock:
        return _owned(user, pk)
    with transaction.atomic():
        attempt = _owned(user, pk)
    _error_si_vencido(attempt)
    return attempt


def transition(user, pk, action):
    with transaction.atomic():
        attempt = _transition(user, pk, action)
    _error_si_vencido(attempt)
    return attempt


def _transition(user, pk, action):
    attempt = owned(user, pk, lock=True)
    if attempt._time_expired:
        return attempt
    now = timezone.now()
    previous = attempt.status
    lifecycle.apply(attempt, action)
    if action == lifecycle.RESUME:
        reset_clock(attempt, now)
    elif previous == "IN_PROGRESS":
        touch(attempt, now)
    if action == lifecycle.REPLACE:
        attempt.ended_at = attempt.locked_at = now
        attempt.replaced_by = user
        attempt.replace_reason = "Reemplazo solicitado por el propietario"
    attempt.save()
    AttemptEvent.objects.create(
        attempt=attempt, node=attempt.current_node, event_type=action.upper()
    )
    return attempt


def _previous_result(attempt, request_id, option_id):
    """La misma orden repetida (mismo ``request_id``) devuelve lo que respondió la primera vez."""
    previous = attempt.events.filter(request_id=request_id).first()
    if previous is None:
        return None
    if previous.decision_option_id != option_id:
        raise ValidationError("request_id ya corresponde a otra decisión.")
    result = json.loads(previous.detail)
    result.pop("feedback", None)
    result.pop("response_class", None)
    return result


def _valid_option(attempt, option_id):
    """La opción elegida, si el intento admite decisiones y la opción sale de la escena actual del mismo caso."""
    if not lifecycle.state_of(attempt).plays:
        raise ValidationError("El intento no admite decisiones en su estado actual.")
    option = get_object_or_404(
        DecisionOption.objects.select_related("target_node"),
        pk=option_id,
        source_node=attempt.current_node,
        case_version=attempt.case_version,
    )
    if option.target_node.case_version_id != attempt.case_version_id:
        raise ValidationError("La escena destino pertenece a otro caso.")
    return option


def _needs_second_chance(attempt, option):
    """Una primera respuesta riesgosa por escena no aplica efectos ni avanza."""
    return (
        rules_of(attempt.case_version).second_chance
        and option.response_class in (ResponseClass.RISKY, ResponseClass.CONTRAINDICATED)
        and not attempt.events.filter(
            node=option.source_node, event_type="DECISION_RETRY_REQUIRED"
        ).exists()
    )


def _result(attempt, option, *, retry_required):
    return {
        "attempt_id": str(attempt.pk),
        "node_id": attempt.current_node_id,
        "status": attempt.status,
        "retry_required": retry_required,
    }


def _record(attempt, option, request_id, event_type, result):
    return AttemptEvent.objects.create(
        attempt=attempt,
        node=option.source_node,
        decision_option=option,
        event_type=event_type,
        request_id=request_id,
        detail=json.dumps({**result, "response_class": option.response_class}),
    )


def _ask_for_retry(attempt, option, request_id):
    result = _result(attempt, option, retry_required=True)
    attempt.save()
    _record(attempt, option, request_id, "DECISION_RETRY_REQUIRED", result)
    return result


def _advance(attempt, option, now, aplicar=True):
    """Aplica los efectos de la opción, mueve el intento a la escena destino y lo cierra si es terminal."""
    if aplicar:
        attempt.state_json = apply_effects(attempt.state_json, option)
    attempt.current_node = option.target_node
    if option.target_node.terminal_node:
        lifecycle.apply(attempt, lifecycle.COMPLETE)
        attempt.ended_at = attempt.locked_at = now
    attempt.save()


def _close_if_completed(attempt, result, event):
    """Si el intento terminó: congela la evaluación, la agrega al evento y avisa a los observadores."""
    if attempt.status != "COMPLETED":
        return
    evaluation = freeze(attempt)
    calificar_y_guardar(attempt)
    result["evaluation"] = evaluation.snapshot
    detail = json.loads(event.detail)
    detail["evaluation"] = result["evaluation"]
    event.detail = json.dumps(detail)
    event.save(update_fields=["detail"])
    attempt_completed.send(sender=SimulationAttempt, attempt=attempt)


def decide(user, pk, option_id, request_id):
    """Registra la decisión del estudiante: cada paso es una función con nombre y una sola responsabilidad."""
    with transaction.atomic():
        attempt = owned(user, pk, lock=True)
        result = None if attempt._time_expired else _decide(attempt, option_id, request_id)
    _error_si_vencido(attempt)
    return result


def _decide(attempt, option_id, request_id):
    previous = _previous_result(attempt, request_id, option_id)
    if previous is not None:
        return previous
    option = _valid_option(attempt, option_id)
    now = timezone.now()
    touch(attempt, now)
    if _needs_second_chance(attempt, option):
        return _ask_for_retry(attempt, option, request_id)
    from .revision_de_respuestas import decisiones_vigentes
    vigentes = decisiones_vigentes(attempt)
    cambiada = any(evento.node_id == option.source_node_id for evento in vigentes)
    if cambiada:
        # La opci?n cambiada conserva su posici?n original en la secuencia.
        estado = {}
        for evento in vigentes:
            estado = apply_effects(estado, option if evento.node_id == option.source_node_id else evento.decision_option)
        attempt.state_json = estado
    _advance(attempt, option, now, aplicar=not cambiada)
    result = _result(attempt, option, retry_required=False)
    result.update(effects=effects_of(option), state=attempt.state_json)
    event = _record(attempt, option, request_id, "DECISION_CHANGED" if cambiada else "DECISION_SELECTED", result)
    _close_if_completed(attempt, result, event)
    return result

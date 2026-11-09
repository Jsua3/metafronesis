"""Persistencia transaccional del contrato S3 y decisión mínima S4."""

import hashlib
import json
import secrets
from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from apps.simulation.models import SimulationAttempt, AttemptEvent, DecisionOption
from .access import available_versions
from . import attempt_lifecycle as lifecycle
from .attempt_duration import touch, reset_clock
from .case_rules import rules_of, effects_of
from .response_effects import apply as apply_effects
from apps.simulation.assessment.evaluation import freeze
from apps.simulation.signals import attempt_completed
from apps.simulation.casedef.vocabulary import ResponseClass


@transaction.atomic
def start(user, version_id):
    # Serializa inicios incluso cuando aún no existe una fila de intento.
    get_user_model().objects.select_for_update().get(pk=user.pk)
    version = get_object_or_404(available_versions(user), pk=version_id)
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


def owned(user, pk, lock=False):
    qs = (
        SimulationAttempt.objects.select_for_update()
        if lock
        else SimulationAttempt.objects.all()
    )
    attempt = get_object_or_404(qs, pk=pk, student=user)
    get_object_or_404(available_versions(user), pk=attempt.case_version_id)
    return attempt


@transaction.atomic
def transition(user, pk, action):
    attempt = owned(user, pk, lock=True)
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
    return json.loads(previous.detail)


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
        "feedback": option.immediate_feedback,
        "response_class": option.response_class,
        "retry_required": retry_required,
    }


def _record(attempt, option, request_id, event_type, result):
    return AttemptEvent.objects.create(
        attempt=attempt,
        node=option.source_node,
        decision_option=option,
        event_type=event_type,
        request_id=request_id,
        detail=json.dumps(result),
    )


def _ask_for_retry(attempt, option, request_id):
    result = _result(attempt, option, retry_required=True)
    attempt.save()
    _record(attempt, option, request_id, "DECISION_RETRY_REQUIRED", result)
    return result


def _advance(attempt, option, now):
    """Aplica los efectos de la opción, mueve el intento a la escena destino y lo cierra si es terminal."""
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
    result["evaluation"] = evaluation.snapshot
    event.detail = json.dumps(result)
    event.save(update_fields=["detail"])
    attempt_completed.send(sender=SimulationAttempt, attempt=attempt)


@transaction.atomic
def decide(user, pk, option_id, request_id):
    """Registra la decisión del estudiante: cada paso es una función con nombre y una sola responsabilidad."""
    attempt = owned(user, pk, lock=True)
    previous = _previous_result(attempt, request_id, option_id)
    if previous is not None:
        return previous
    option = _valid_option(attempt, option_id)
    now = timezone.now()
    touch(attempt, now)
    if _needs_second_chance(attempt, option):
        return _ask_for_retry(attempt, option, request_id)
    _advance(attempt, option, now)
    result = _result(attempt, option, retry_required=False)
    result.update(effects=effects_of(option), state=attempt.state_json)
    event = _record(attempt, option, request_id, "DECISION_SELECTED", result)
    _close_if_completed(attempt, result, event)
    return result

"""Primer final declarativo aplicable; respaldo neutral sin interpretación clínica.

Los finales del DSL 2.x usan el vocabulario de ``casedef.conditions`` (``milestone``, ``persona``, ``count``); los
documentos antiguos usan ``flag``, que solo entiende ``services.conditions``. Se evalúa con el vocabulario que la
condición declara: antes, todo final con ``milestone`` o ``persona`` se descartaba sin evaluarse y cualquier intento
terminaba en el final de respaldo.
"""

from apps.simulation.casedef import conditions as condiciones_dsl
from apps.simulation.models import AttemptStatus

from .case_rules import rules_of
from .conditions import evaluate, is_valid

_NIVELES = {"bond": ("WITHDRAWN", "GUARDED", "OPEN"), "activation": ("CALM", "TENSE", "CRISIS")}


def _nivel(valor, valores):
    return valores[max(0, min(2, 1 + valor))] if type(valor) is int else valores[1]


def _persona(state):
    persona = state.get("persona") if isinstance(state.get("persona"), dict) else {}
    return {dimension: _nivel(persona.get(dimension, 0), valores) for dimension, valores in _NIVELES.items()}


def _aplica(condition, legado, dsl):
    if condiciones_dsl.is_valid(condition):
        return condiciones_dsl.evaluate(condition, dsl)
    return is_valid(condition) and evaluate(condition, legado)


def incomplete():
    return {
        "key": "incompleto",
        "title": "Recorrido incompleto",
        "message": "El caso no se terminó. Las decisiones tomadas quedan en el informe.",
        "tone": "neutral",
    }


def resolve(attempt, counts):
    if attempt.status != AttemptStatus.COMPLETED:
        return incomplete()
    state = attempt.state_json
    milestones = state.get("milestones", [])
    legado = {"milestones": milestones, "counts": counts}
    dsl = {"milestones": set(milestones), "counts": counts, "persona": _persona(state)}
    for ending in rules_of(attempt.case_version).endings:
        if "when" in ending and not _aplica(ending.get("when"), legado, dsl):
            continue
        return {key: ending[key] for key in ("key", "title", "message", "tone")}
    return {
        "key": "completed",
        "title": "Recorrido completado",
        "message": "Revisa las decisiones con tu docente.",
        "tone": "neutral",
    }

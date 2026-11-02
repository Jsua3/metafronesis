"""Regla pura de efectos: devuelve un estado nuevo y no escribe en la base."""

from copy import deepcopy
from .case_rules import effects_of


def apply(state, option):
    result = deepcopy(state)
    effects = effects_of(option)
    persona = result.setdefault("persona", {"bond": 0, "activation": 0})
    for key, delta in effects.get("persona", {}).items():
        persona[key] = max(-2, min(2, persona.get(key, 0) + delta))
    result["milestones"] = sorted(
        set(result.get("milestones", [])) | set(effects.get("milestones", []))
    )
    return result

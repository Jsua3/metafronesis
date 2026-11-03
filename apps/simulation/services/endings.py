"""Primer final declarativo aplicable; respaldo neutral sin interpretación clínica."""

from .conditions import evaluate, is_valid


def resolve(rules, state, counts):
    context = {"milestones": state.get("milestones", []), "counts": counts}
    for ending in rules.endings:
        condition = ending.get("when")
        if "when" in ending and (
            not is_valid(condition) or not evaluate(condition, context)
        ):
            continue
        return {key: ending[key] for key in ("key", "title", "message", "tone")}
    return {
        "key": "completed",
        "title": "Recorrido completado",
        "message": "Revisa las decisiones con tu docente.",
        "tone": "neutral",
    }

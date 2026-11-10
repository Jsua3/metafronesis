"""Evaluación mínima a partir de evidencia declarada; no infiere competencias."""

import json

from apps.simulation.models.vocabulary import FormativeLevel
from apps.simulation.services.case_rules import rules_of
from apps.simulation.services.endings import resolve
from apps.simulation.models import AttemptEvaluation

LEVELS = list(FormativeLevel.values)


def build(attempt):
    counts = {
        key: 0
        for key in ("recommended", "acceptable", "risky", "contraindicated", "critical")
    }
    evidence = []
    levels = {}
    # Los efectos se sellan en el evento: no se releen opciones editadas después.
    from apps.simulation.services.revision_de_respuestas import decisiones_vigentes
    for event in decisiones_vigentes(attempt):
        detail = json.loads(event.detail)
        response_class = detail["response_class"]
        counts[response_class.lower()] += 1
        if response_class == "CONTRAINDICATED":
            counts["critical"] += 1
        declared = detail.get("effects", {}).get("competencies", {})
        for code, level in declared.items():
            if level in LEVELS:
                index = LEVELS.index(level)
                if response_class == "CONTRAINDICATED":
                    index = min(index, 1)
                previous = levels.get(code)
                levels[code] = min(previous, index) if previous is not None else index
            else:
                levels.setdefault(code, None)
        evidence.append(
            {
                "event_id": event.pk,
                "decision_option_id": event.decision_option_id,
                "response_class": response_class,
                "competencies": declared,
            }
        )
    return {
        "status": "BORRADOR",
        "rules_version": "s4-minimal-1",
        "definition_hash": attempt.case_version.definition_hash,
        "competencies": [
            {"code": code, "level": LEVELS[index] if index is not None else None}
            for code, index in sorted(levels.items())
        ],
        "counts": counts,
        "milestones": attempt.state_json.get("milestones", []),
        "ending": resolve(rules_of(attempt.case_version), attempt.state_json, counts),
        "evidence": evidence,
    }


def freeze(attempt):
    evaluation, _ = AttemptEvaluation.objects.get_or_create(
        attempt=attempt, defaults={"snapshot": build(attempt)}
    )
    return evaluation

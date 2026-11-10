import json
import pytest
from django.utils import timezone
from apps.simulation.models import (
    AttemptEvaluation,
    SimulationAttempt,
    SimulationCase,
    CaseVersion,
    SimulationNode,
)
from apps.progression.models import StudentCaseCompletion
from apps.grupos.models import CaseAssignment
from apps.simulation.services.conditions import evaluate, is_valid
from apps.simulation.signals import attempt_completed
from .test_s3_api import start

pytestmark = pytest.mark.django_db


def choose(scene, attempt_id, key="command"):
    return scene["client"].post(
        "/api/simulation/attempts/" + str(attempt_id) + "/decisions",
        {"decision_option_id": scene["option"].pk, "request_id": key},
        format="json",
    )


def test_effects_evaluation_completion_and_replay_are_atomic_and_once(scene):
    version = scene["version"]
    version.rules = json.dumps(
        {
            "milestones": [{"key": "care", "label": "Cuidado"}],
            "endings": [
                {"key": "careful", "title": "Cuidado", "when": {"flag": "care"}},
                {"key": "other", "title": "Otro"},
            ],
        }
    )
    version.save()
    option = scene["option"]
    option.effects = json.dumps(
        {
            "persona": {"bond": 1, "activation": -1},
            "milestones": ["care", "care"],
            "competencies": {"CARE": "LOGRADO", "UNDECLARED": None},
        }
    )
    option.save()
    attempt_id = start(scene).data["id"]
    result = choose(scene, attempt_id)
    assert result.status_code == 200
    assert result.data["state"] == {
        "persona": {"bond": 1, "activation": -1},
        "milestones": ["care"],
    }
    report = result.data["evaluation"]
    assert report["ending"]["key"] == "careful"
    assert report["competencies"] == [
        {"code": "CARE", "level": "LOGRADO"},
        {"code": "UNDECLARED", "level": None},
    ]
    assert len(report["evidence"]) == 1
    assert (
        StudentCaseCompletion.objects.count() == AttemptEvaluation.objects.count() == 1
    )
    option.effects = "{}"
    option.immediate_feedback = "EDITADO"
    option.save()
    replay = choose(scene, attempt_id)
    assert replay.data == result.data
    assert (
        scene["client"].get("/api/simulation/attempts/" + attempt_id + "/evaluation").data
        == report
    )
    assert (
        StudentCaseCompletion.objects.count() == AttemptEvaluation.objects.count() == 1
    )
    evaluation = AttemptEvaluation.objects.get()
    with pytest.raises(RuntimeError):
        evaluation.save()


def test_second_chance_does_not_apply_or_grade_first_risky_choice(scene):
    version = scene["version"]
    version.rules = '{"secondChance":true}'
    version.save()
    option = scene["option"]
    option.response_class = "RISKY"
    option.effects = '{"persona":{"bond":-1},"competencies":{"CARE":"LOGRADO"}}'
    option.save()
    attempt_id = start(scene).data["id"]
    first = choose(scene, attempt_id, "first")
    assert first.data["retry_required"] is True
    assert choose(scene, attempt_id, "first").data == first.data
    attempt = SimulationAttempt.objects.get()
    assert attempt.current_node_id == scene["node"].pk
    assert attempt.state_json == {}
    assert not AttemptEvaluation.objects.exists()
    second = choose(scene, attempt_id, "second")
    assert second.data["status"] == "COMPLETED"
    assert second.data["evaluation"]["counts"]["risky"] == 1
    assert len(second.data["evaluation"]["evidence"]) == 1


def test_bad_rules_fall_back_without_breaking_game(scene):
    version = scene["version"]
    version.rules = "not-json"
    version.save()
    option = scene["option"]
    option.effects = "not-json"
    option.save()
    result = choose(scene, start(scene).data["id"])
    assert result.status_code == 200
    assert result.data["evaluation"]["ending"]["key"] == "completed"
    assert result.data["evaluation"]["competencies"] == []


def test_completion_failure_rolls_back_decision_evaluation_and_progress(scene):
    attempt_id = start(scene).data["id"]

    def fail(sender, **kwargs):
        raise RuntimeError("observer failed")

    attempt_completed.connect(fail, weak=False, dispatch_uid="test.fail")
    try:
        assert choose(scene, attempt_id).status_code == 500
    finally:
        attempt_completed.disconnect(dispatch_uid="test.fail")
    attempt = SimulationAttempt.objects.get()
    assert attempt.status == "IN_PROGRESS"
    assert attempt.current_node_id == scene["node"].pk
    assert not attempt.events.filter(event_type="DECISION_SELECTED").exists()
    assert not AttemptEvaluation.objects.exists()
    assert not StudentCaseCompletion.objects.exists()


def test_sequence_unlocks_only_on_completion(scene):
    case = SimulationCase.objects.create(
        code="NEXT", title="Siguiente", created_by=scene["teacher"]
    )
    version = CaseVersion.objects.create(
        simulation_case=case,
        semantic_version="1",
        status="PUBLISHED",
        created_by=scene["teacher"],
        validated_at=timezone.now(),
        definition_hash="sha256:" + "b" * 64,
    )
    SimulationNode.objects.create(
        case_version=version,
        node_key="start",
        title="Inicio",
        narrative="Inicio",
        start_node=True,
    )
    CaseAssignment.objects.create(
        case_version=version, estudiante=scene["student"], sort_order=1
    )
    catalog = scene["client"].get("/api/simulation/catalog").data
    assert catalog[1]["reason"] == "LOCKED_BY_SEQUENCE"
    assert (
        scene["client"]
        .post("/api/simulation/attempts", {"case_version_id": version.pk}, format="json")
        .status_code
        == 400
    )
    attempt_id = start(scene).data["id"]
    scene["client"].post("/api/simulation/attempts/" + attempt_id + "/pause")
    assert not StudentCaseCompletion.objects.exists()
    scene["client"].post("/api/simulation/attempts/" + attempt_id + "/resume")
    choose(scene, attempt_id)
    assert scene["client"].get("/api/simulation/catalog").data[1]["allowed"] is True
    assert (
        scene["client"]
        .post("/api/simulation/attempts", {"case_version_id": version.pk}, format="json")
        .status_code
        == 201
    )


@pytest.mark.parametrize(
    "condition,expected",
    [
        ({"flag": "care"}, True),
        ({"count": "risky", "gte": 2}, True),
        ({"all": [{"flag": "care"}, {"not": {"count": "critical", "gt": 0}}]}, True),
        ({"any": [{"flag": "missing"}, {"count": "recommended", "eq": 1}]}, True),
        ({"unknown": "field"}, False),
        ({"not": {"unknown": "field"}}, False),
        ({"count": [], "gte": 1}, False),
        ({"all": []}, False),
    ],
)
def test_conditions_are_deterministic_and_invalid_documents_are_false(
    condition, expected
):
    context = {"milestones": ["care"], "counts": {"risky": 2, "recommended": 1}}
    assert evaluate(condition, context) is expected
    if expected:
        assert is_valid(condition)

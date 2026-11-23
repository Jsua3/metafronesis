"""Contrato y congelación del informe del estudiante."""
import json

import pytest
from rest_framework.test import APIClient

from apps.privacy import consent_service
from apps.simulation.models import AttemptReport, Rubric, RubricCriterion, SimulationAttempt, SimulationRubricAssignment

pytestmark = [pytest.mark.django_db, pytest.mark.req("RF-22", "RF-23", "CU-12")]


@pytest.fixture
def intento(scene):
    registro = SimulationAttempt.objects.create(student=scene["student"], case_version=scene["version"],
        current_node=scene["node"], attempt_token_hash="informe-prueba")
    return {**scene, "registro": registro, "base": f"/api/simulation/attempts/{registro.pk}"}


def test_resumen_en_curso_cumple_contrato_sin_evaluacion(intento):
    respuesta = intento["client"].get(intento["base"] + "/student-report")
    assert respuesta.status_code == 200
    informe = respuesta.json()["data"]
    assert {"attemptId", "caseTitle", "status", "totalDurationSeconds", "phaseDurations", "toolsUsed", "reflectionsCount", "safeExitUsed", "visitedNodeTitles", "recommendations", "summaryMessage"} <= set(informe)
    assert informe["status"] == "IN_PROGRESS"
    assert informe["totalDurationSeconds"] is None
    assert informe["phaseDurations"] == []
    assert "decisionReview" not in informe and "ending" not in informe
    assert AttemptReport.objects.filter(attempt=intento["registro"]).count() == 0


def test_informe_congelado_al_cerrar_y_visible_en_estado(intento):
    cliente, base = intento["client"], intento["base"]
    assert cliente.post(base + "/reflections", {"nodeId": intento["node"].pk, "text": "Reflexión"}, format="json").status_code == 200
    respuesta = cliente.post(base + "/decisions", {"decision_option_id": intento["option"].pk, "request_id": "cierre-informe"}, format="json")
    assert respuesta.status_code == 200
    informe = cliente.get(base + "/student-report").json()["data"]
    assert informe["status"] == "COMPLETED"
    assert informe["reflectionsCount"] == 1
    assert informe["decisionReview"]
    assert AttemptReport.objects.filter(attempt=intento["registro"]).count() == 1
    intento["case"].title = "Título modificado"
    intento["case"].save()
    intento["option"].text = "Opción modificada"
    intento["option"].save()
    assert cliente.get(base + "/student-report").json()["data"] == informe
    assert cliente.post(base + "/safe-exit", {}, format="json").json()["data"]["completionReport"] == informe


def test_informe_exige_propietario(intento):
    cliente = APIClient()
    assert cliente.get(intento["base"] + "/student-report").status_code in (401, 403)
    cliente.force_authenticate(intento["stranger"])
    assert cliente.get(intento["base"] + "/student-report").status_code == 404



def test_informe_incluye_nivel_solo_si_hay_rubrica(intento):
    rubrica = Rubric.objects.create(name="Rúbrica", created_by=intento["teacher"])
    RubricCriterion.objects.create(rubric=rubrica, competency="CARE", title="Cuidado", weight=100)
    SimulationRubricAssignment.objects.create(case_version=intento["version"], rubric=rubrica)
    intento["option"].effects = json.dumps({"competencies": ["CARE"]})
    intento["option"].save()
    respuesta = intento["client"].post(intento["base"] + "/decisions", {"decision_option_id": intento["option"].pk, "request_id": "cierre-rubrica"}, format="json")
    assert respuesta.status_code == 200
    nivel = intento["client"].get(intento["base"] + "/student-report").json()["data"]["competencyLevels"][0]
    assert nivel == {"code": "CARE", "name": "Cuidado", "level": "DESTACADO", "basis": None, "evidence": []}


def test_resumen_refleja_salida_y_no_expone_texto(intento):
    cliente, base = intento["client"], intento["base"]
    assert cliente.post(base + "/reflections", {"nodeId": intento["node"].pk, "text": "Texto privado"}, format="json").status_code == 200
    assert cliente.post(base + "/safe-exit", {"reason": "Motivo privado"}, format="json").status_code == 200
    respuesta = cliente.get(base + "/student-report")
    informe = respuesta.json()["data"]
    assert informe["safeExitUsed"] is True and informe["reflectionsCount"] == 1
    assert informe["status"] == "PAUSED" and informe["recommendations"]
    assert "Texto privado" not in respuesta.content.decode()
    assert "Motivo privado" not in respuesta.content.decode()


def test_contrato_anidado_del_informe_completado(intento):
    cliente, base = intento["client"], intento["base"]
    respuesta = cliente.post(base + "/decisions", {"decision_option_id": intento["option"].pk, "request_id": "contrato"}, format="json")
    assert respuesta.status_code == 200
    informe = cliente.get(base + "/student-report").json()["data"]
    assert set(informe) == {"attemptId", "caseTitle", "status", "totalDurationSeconds", "phaseDurations", "toolsUsed", "reflectionsCount", "safeExitUsed", "visitedNodeTitles", "recommendations", "summaryMessage", "schemaVersion", "ending", "persona", "counts", "decisionReview", "reflections", "retries", "prohibitedRetries"}
    assert isinstance(informe["totalDurationSeconds"], int)
    assert isinstance(informe["phaseDurations"], list)
    assert isinstance(informe["safeExitUsed"], bool)
    assert all(isinstance(titulo, str) for titulo in informe["visitedNodeTitles"])
    assert set(informe["ending"]) == {"key", "title", "message", "tone", "reason"}
    assert set(informe["persona"]) == {"bond", "activation", "label"}
    assert set(informe["counts"]) == {"recommended", "acceptable", "risky", "contraindicated", "retries", "prohibitedRetries", "toolsUsed", "reflections"}
    decision = informe["decisionReview"][0]
    assert set(decision) == {"order", "nodeId", "nodeTitle", "chosen", "consequence", "feedback", "class", "prohibited"}
    assert set(decision["chosen"]) == {"optionId", "text"}
    assert set(decision["feedback"]) == {"explanation", "theoryBasis"}


def test_informe_disponible_con_consentimiento_retirado(intento, settings):
    settings.SIEP_CONSENT_REQUIRED = True
    consent_service.accept_content_notice(intento["student"], intento["version"], settings.SIEP_CONTENT_NOTICE_VERSION)
    consent_service.withdraw_content_notice(intento["student"], intento["version"])
    assert intento["client"].get(intento["base"] + "/student-report").status_code == 200

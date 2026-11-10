from decimal import Decimal
import json

import pytest

from apps.simulation.models import AttemptEvent, Rubric, RubricCriterion, SimulationAttempt, SimulationRubricAssignment
from apps.simulation.services import calificacion
from .test_s3_api import start

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-30")]


@pytest.fixture
def datos(scene):
    rubric = Rubric.objects.create(name="Rúbrica", created_by=scene["teacher"])
    a = RubricCriterion.objects.create(rubric=rubric, competency="CARE", title="Cuidado", weight=60)
    b = RubricCriterion.objects.create(rubric=rubric, competency="OTHER", title="Otra", weight=40)
    SimulationRubricAssignment.objects.create(case_version=scene["version"], rubric=rubric)
    attempt = SimulationAttempt.objects.create(student=scene["student"], case_version=scene["version"], current_node=scene["node"], attempt_token_hash="token", status="COMPLETED")
    return scene, rubric, a, b, attempt


def registrar(datos, effects, clase="RECOMMENDED", tipo="DECISION_SELECTED"):
    scene, _, _, _, intento = datos
    option = scene["option"]
    option.effects = json.dumps({"competencies": effects})
    option.response_class = clase
    option.save()
    AttemptEvent.objects.create(attempt=intento, node=scene["node"], decision_option=option, event_type=tipo)


def test_todo_recomendado_da_destacado_y_total_4(datos):
    registrar(datos, ["CARE", "OTHER"])
    resultado = calificacion.PorCompetenciaPonderada().calificar(datos[4], datos[1])
    assert resultado.total == Decimal("4.00")
    assert set(resultado.niveles.values()) == {"DESTACADO"}
    assert resultado.estado == "EVALUATED"


def test_contraindicada_topa_en_proceso(datos):
    registrar(datos, {"CARE": "DESTACADO"}, "CONTRAINDICATED")
    resultado = calificacion.PorCompetenciaPonderada().calificar(datos[4], datos[1])
    assert resultado.niveles[datos[2].id] == "EN_PROCESO"


def test_criterio_sin_evidencia_queda_pendiente(datos):
    registrar(datos, ["CARE"])
    resultado = calificacion.PorCompetenciaPonderada().calificar(datos[4], datos[1])
    assert resultado.estado == "PENDING"
    assert resultado.niveles[datos[3].id] is None
    assert resultado.total == Decimal("4.00")


def test_incompleto_cuenta_lo_faltante_como_en_inicio(datos):
    registrar(datos, ["CARE"])
    resultado = calificacion.IncompletoParcial().calificar(datos[4], datos[1])
    assert resultado.estado == "PARTIAL"
    assert resultado.niveles[datos[3].id] == "EN_INICIO"
    assert resultado.total == Decimal("2.80")


def test_estrategia_segun_estado(datos):
    intento = datos[4]
    assert isinstance(calificacion.estrategia_para(intento), calificacion.PorCompetenciaPonderada)
    intento.status = "PAUSED"
    assert isinstance(calificacion.estrategia_para(intento), calificacion.IncompletoParcial)


def test_completar_un_intento_crea_la_evaluacion_del_sistema(scene):
    rubric = Rubric.objects.create(name="Rúbrica", created_by=scene["teacher"])
    criterio = RubricCriterion.objects.create(rubric=rubric, competency="CARE", title="Cuidado", weight=100)
    SimulationRubricAssignment.objects.create(case_version=scene["version"], rubric=rubric)
    scene["option"].effects = json.dumps({"competencies": ["CARE"]})
    scene["option"].save()
    intento_id = start(scene).data["id"]
    response = scene["client"].post(f"/api/simulation/attempts/{intento_id}/decisions", {"decision_option_id": scene["option"].pk, "request_id": "fin"}, format="json")
    assert response.status_code == 200
    intento = SimulationAttempt.objects.get(pk=intento_id)
    evaluacion = intento.rubric_evaluations.get(origin="SISTEMA")
    assert evaluacion.total_score == Decimal("4.00")
    assert evaluacion.criterion_scores.get(rubric_criterion=criterio).level == "DESTACADO"
    assert calificacion.calificar_y_guardar(intento).pk == evaluacion.pk
    assert intento.rubric_evaluations.count() == 1


def test_promedio_redondea_mitad_hacia_arriba_y_omite_reintentos(datos):
    scene, rubrica, criterio, _, intento = datos
    registrar(datos, {"CARE": "EN_INICIO"})
    otra = type(scene["option"]).objects.create(case_version=scene["version"], source_node=scene["node"], target_node=scene["end"], option_key="otra", text="Otra", response_class="RECOMMENDED", effects=json.dumps({"competencies": {"CARE": "EN_PROCESO"}}))
    AttemptEvent.objects.create(attempt=intento, decision_option=otra, event_type="DECISION_SELECTED")
    AttemptEvent.objects.create(attempt=intento, decision_option=otra, event_type="DECISION_RETRY_REQUIRED")
    assert calificacion.PorCompetenciaPonderada().calificar(intento, rubrica).niveles[criterio.pk] == "EN_PROCESO"


def test_sin_rubrica_no_se_guarda_evaluacion(scene):
    intento = SimulationAttempt.objects.create(student=scene["student"], case_version=scene["version"], current_node=scene["node"], attempt_token_hash="token")
    assert calificacion.calificar_y_guardar(intento) is None
    assert not intento.rubric_evaluations.exists()

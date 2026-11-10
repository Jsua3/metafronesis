import json

import pytest

from apps.simulation.models import DecisionOption, Rubric, RubricCriterion, SimulationNode, SimulationRubricAssignment
from apps.simulation.services.evaluacion import registrar_retroalimentacion_docente
from .test_s3_api import start
from .test_s4_engine import choose

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-31")]


def test_decidir_no_muestra_la_justificacion(scene):
    intento = start(scene).data["id"]
    respuesta = choose(scene, intento)
    assert respuesta.status_code == 200
    assert "feedback" not in respuesta.data
    assert "response_class" not in respuesta.data
    evento = scene["student"].simulationattempt_set.get(pk=intento).events.get(request_id="command")
    datos = json.loads(evento.detail)
    datos.update(feedback="histórico", response_class="RECOMMENDED")
    evento.detail = json.dumps(datos)
    evento.save(update_fields=["detail"])
    repetida = choose(scene, intento)
    assert "feedback" not in repetida.data
    assert "response_class" not in repetida.data


def test_resultado_antes_de_terminar_409(scene):
    intento = start(scene).data["id"]
    respuesta = scene["client"].get(f"/api/simulation/attempts/{intento}/result")
    assert respuesta.status_code == 409
    assert respuesta.data["code"] == "ATTEMPT_NOT_FINISHED"


def test_resultado_trae_aciertos_errores_y_justificaciones(scene):
    medio = SimulationNode.objects.create(case_version=scene["version"], node_key="medio", title="Medio", narrative="Medio", decision_prompt="¿Qué sigue?")
    primera = scene["option"]
    primera.target_node = medio
    primera.feedback_text = "Bien"
    primera.theory_basis = "Fundamento"
    primera.effects = json.dumps({"competencies": ["CARE"]})
    primera.save()
    segunda = DecisionOption.objects.create(case_version=scene["version"], source_node=medio, target_node=scene["end"], option_key="error", text="Error", response_class="RISKY", feedback_text="Revisar", theory_basis="Teoría")
    rubrica = Rubric.objects.create(name="Rúbrica", created_by=scene["teacher"])
    criterio = RubricCriterion.objects.create(rubric=rubrica, competency="CARE", title="Cuidado", weight=100)
    SimulationRubricAssignment.objects.create(case_version=scene["version"], rubric=rubrica)
    intento = start(scene).data["id"]
    assert choose(scene, intento).status_code == 200
    assert scene["client"].post(f"/api/simulation/attempts/{intento}/decisions", {"decision_option_id": segunda.pk, "request_id": "segunda"}, format="json").status_code == 200
    objeto = scene["student"].simulationattempt_set.get(pk=intento)
    registrar_retroalimentacion_docente(objeto, scene["teacher"], "Buen trabajo")
    respuesta = scene["client"].get(f"/api/simulation/attempts/{intento}/result")
    assert respuesta.status_code == 200
    datos = respuesta.data["data"]
    assert datos["attemptId"] == intento and datos["status"] == "COMPLETED"
    assert [d["correct"] for d in datos["decisions"]] == [True, False]
    assert datos["decisions"][0] == {"node": "Inicio", "question": "", "option": "Terminar", "correct": True, "responseClass": "RECOMMENDED", "justification": {"feedback": "Bien", "theoryBasis": "Fundamento"}}
    assert datos["decisions"][1]["justification"] == {"feedback": "Revisar", "theoryBasis": "Teoría"}
    assert datos["evaluation"] == objeto.evaluation.snapshot
    assert str(datos["rubric"]["total"]) == "4.00"
    assert datos["rubric"]["status"] == "EVALUATED"
    assert datos["rubric"]["levels"] == [{"criterion": criterio.pk, "level": "DESTACADO"}]
    assert datos["teacherFeedback"] == "Buen trabajo"


def test_resultado_de_otro_estudiante_404(scene):
    intento = start(scene).data["id"]
    choose(scene, intento)
    scene["client"].force_authenticate(scene["stranger"])
    assert scene["client"].get(f"/api/simulation/attempts/{intento}/result").status_code == 404

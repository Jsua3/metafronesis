"""Estado completo del intento para el juego: lectura propia y respuesta de las decisiones."""
import pytest
from rest_framework.test import APIClient

from apps.simulation.models import AttemptReport, DecisionOption, SimulationAttempt

pytestmark = [pytest.mark.django_db, pytest.mark.req("SF-22", "REGLA-004", "RNF-08")]

CLAVES_ESTADO = {"attemptId", "attemptToken", "caseVersionId", "caseTitle", "status", "persona",
                 "currentNode", "completionReport", "supportResources"}
CLAVES_ESCENA = {"id", "key", "title", "narrative", "goal", "options", "supportResources", "requiredTools",
                 "sensitiveContent", "safeExitRequired", "warningMessage", "intensity", "terminal",
                 "decisionPrompt", "displayOrder"}
CLAVES_PERSONA = {"bond", "activation", "label"}
TEXTO_CONSECUENCIA = "La persona respira hondo y te mira."
MENSAJE_REINTENTO = "Puedes volver a elegir en esta escena."


@pytest.fixture
def intento(scene):
    creado = SimulationAttempt.objects.create(student=scene["student"], case_version=scene["version"],
        current_node=scene["node"], attempt_token_hash="estado-prueba")
    return {**scene, "intento": creado, "ruta": f"/api/simulation/attempts/{creado.pk}/state"}


def test_estado_tiene_la_forma_completa_del_cliente(intento):
    respuesta = intento["client"].get(intento["ruta"])
    assert respuesta.status_code == 200
    datos = respuesta.json()["data"]
    assert set(datos) == CLAVES_ESTADO
    assert set(datos["persona"]) == CLAVES_PERSONA
    assert set(datos["currentNode"]) == CLAVES_ESCENA
    assert datos["attemptId"] == str(intento["intento"].pk)
    assert datos["caseVersionId"] == intento["version"].pk
    assert datos["caseTitle"] == "Prueba"
    assert datos["status"] == "IN_PROGRESS"
    assert datos["completionReport"] is None
    assert datos["supportResources"] == []
    escena = datos["currentNode"]
    assert escena["id"] == intento["node"].pk
    assert escena["key"] == "start"
    assert escena["narrative"] == "Inicio"
    assert escena["terminal"] is False
    assert escena["options"] == [{"id": intento["option"].pk, "text": "Terminar"}]


def test_estado_no_revela_la_clasificacion_de_las_opciones(intento):
    opciones = intento["client"].get(intento["ruta"]).json()["data"]["currentNode"]["options"]
    assert all(set(opcion) == {"id", "text"} for opcion in opciones)


def test_estado_pausado_ofrece_recursos_de_apoyo_sin_opciones(intento):
    intento["client"].post(intento["ruta"].replace("/state", "/safe-exit"), {}, format="json")
    datos = intento["client"].get(intento["ruta"]).json()["data"]
    assert datos["status"] == "PAUSED"
    assert datos["currentNode"]["options"] == []
    assert len(datos["supportResources"]) == 3


def test_estado_de_un_intento_terminado_trae_el_informe_congelado(intento):
    final = intento["intento"]
    final.current_node = intento["end"]
    final.status = "COMPLETED"
    final.save()
    AttemptReport.objects.create(attempt=final, report_json={"version": 2})
    datos = intento["client"].get(intento["ruta"]).json()["data"]
    assert datos["status"] == "COMPLETED"
    assert datos["completionReport"] == {"version": 2}
    assert datos["currentNode"]["terminal"] is True
    assert datos["currentNode"]["options"] == []


def test_estado_es_solo_del_estudiante_dueno(intento):
    ajeno = APIClient()
    ajeno.force_authenticate(intento["stranger"])
    assert ajeno.get(intento["ruta"]).status_code == 404
    docente = APIClient()
    docente.force_authenticate(intento["teacher"])
    assert docente.get(intento["ruta"]).status_code == 403
    assert APIClient().get(intento["ruta"]).status_code in {401, 403}


def test_estado_no_acepta_escrituras(intento):
    assert intento["client"].post(intento["ruta"], {}, format="json").status_code == 405


def test_decision_agrega_consecuencia_y_estado_sin_quitar_lo_anterior(intento):
    DecisionOption.objects.filter(pk=intento["option"].pk).update(consequence_text=TEXTO_CONSECUENCIA)
    cuerpo = {"decision_option_id": intento["option"].pk, "request_id": "decision-estado-1"}
    respuesta = intento["client"].post(intento["ruta"].replace("/state", "/decisions"), cuerpo, format="json")
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert {"attempt_id", "node_id", "status", "retry_required"} <= set(datos)
    assert datos["consequence"] == {"text": TEXTO_CONSECUENCIA, "source": "OPTION"}
    assert set(datos["attempt"]) == CLAVES_ESTADO
    assert datos["attempt"]["currentNode"]["id"] == intento["end"].pk
    assert datos["attempt"]["status"] == "COMPLETED"
    assert "retry" not in datos or datos["retry"] is None


def test_consecuencia_cae_a_la_narrativa_de_la_escena_destino(intento):
    cuerpo = {"decision_option_id": intento["option"].pk, "request_id": "decision-estado-2"}
    datos = intento["client"].post(intento["ruta"].replace("/state", "/decisions"), cuerpo, format="json").json()
    assert datos["consequence"] == {"text": "Fin", "source": "NODE"}


def test_decision_repetida_devuelve_la_misma_consecuencia(intento):
    DecisionOption.objects.filter(pk=intento["option"].pk).update(consequence_text=TEXTO_CONSECUENCIA)
    cuerpo = {"decision_option_id": intento["option"].pk, "request_id": "decision-estado-3"}
    ruta = intento["ruta"].replace("/state", "/decisions")
    primera = intento["client"].post(ruta, cuerpo, format="json").json()
    segunda = intento["client"].post(ruta, cuerpo, format="json").json()
    assert segunda["consequence"] == primera["consequence"]
    assert segunda["attempt"]["currentNode"]["id"] == primera["attempt"]["currentNode"]["id"]


def test_decision_con_segunda_oportunidad_trae_retry_y_sin_consecuencia(intento, monkeypatch):
    from apps.simulation.services import attempt_api
    monkeypatch.setattr(attempt_api, "_needs_second_chance", lambda intento_actual, opcion: True)
    cuerpo = {"decision_option_id": intento["option"].pk, "request_id": "decision-estado-4"}
    datos = intento["client"].post(intento["ruta"].replace("/state", "/decisions"), cuerpo, format="json").json()
    assert datos["retry_required"] is True
    assert datos["consequence"] is None
    assert datos["retry"] == {"allowed": True, "message": MENSAJE_REINTENTO}
    assert datos["attempt"]["currentNode"]["id"] == intento["node"].pk

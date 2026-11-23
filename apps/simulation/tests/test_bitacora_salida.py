"""Contratos de la bitácora y la salida segura."""
import pytest
from rest_framework.test import APIClient

from apps.privacy import consent_service
from apps.simulation.models import ReflectionJournal, SimulationAttempt
from apps.simulation.services import crypto_service

pytestmark = [pytest.mark.django_db, pytest.mark.req("SF-22", "REGLA-004", "RNF-08")]


@pytest.fixture
def intento(scene):
    intento = SimulationAttempt.objects.create(student=scene["student"], case_version=scene["version"],
        current_node=scene["node"], attempt_token_hash="bitacora-prueba")
    return {**scene, "intento": intento, "base": f"/api/simulation/attempts/{intento.pk}"}


def test_reflexion_cifrada_idempotente_y_bloqueada_al_avanzar(intento):
    cliente, base = intento["client"], intento["base"]
    cuerpo = {"nodeId": intento["node"].pk, "text": "Mi reflexión", "requestId": "reflexion-1"}
    respuesta = cliente.post(base + "/reflections", cuerpo, format="json")
    assert respuesta.status_code == 200
    assert respuesta.json()["data"] == {"nodeId": intento["node"].pk, "locked": False}
    assert cliente.post(base + "/reflections", cuerpo, format="json").status_code == 200
    registro = ReflectionJournal.objects.get(attempt=intento["intento"])
    assert "Mi reflexión" not in registro.encrypted_text
    assert crypto_service.decrypt(registro.encrypted_text, key_ref=registro.encryption_key_ref,
                                  attempt_id=intento["intento"].pk, node_id=intento["node"].pk) == "Mi reflexión"
    assert intento["intento"].events.filter(event_type="REFLECTION_SAVED").count() == 1
    assert cliente.post(base + "/decisions", {"decision_option_id": intento["option"].pk, "request_id": "decision-1"}, format="json").status_code == 200
    registro.refresh_from_db()
    assert registro.locked


def test_salida_segura_idempotente_y_reanudable(intento):
    cliente, base = intento["client"], intento["base"]
    respuesta = cliente.post(base + "/safe-exit", {"reason": "Necesito una pausa"}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.json()["data"]["status"] == "PAUSED"
    assert cliente.post(base + "/safe-exit", {}, format="json").status_code == 200
    evento = intento["intento"].events.get(event_type="SAFE_EXIT_REQUESTED")
    assert evento.detail == "Necesito una pausa"
    assert cliente.post(base + "/resume", {}, format="json").status_code == 200
    intento["intento"].refresh_from_db()
    assert intento["intento"].status == "IN_PROGRESS"


@pytest.mark.parametrize("texto", ["", "   ", "a" * 5001])
def test_reflexion_rechaza_texto_vacio_o_demasiado_largo(intento, texto):
    respuesta = intento["client"].post(intento["base"] + "/reflections",
                                      {"nodeId": intento["node"].pk, "text": texto}, format="json")
    assert respuesta.status_code == 400
    assert not ReflectionJournal.objects.exists()


def test_ajeno_no_puede_guardar_ni_pausar(intento):
    cliente = APIClient()
    cliente.force_authenticate(intento["stranger"])
    assert cliente.post(intento["base"] + "/reflections", {"nodeId": intento["node"].pk, "text": "Texto"}, format="json").status_code == 404
    assert cliente.post(intento["base"] + "/safe-exit", {}, format="json").status_code == 404


def test_salida_disponible_con_consentimiento_retirado_y_asignacion_inactiva(intento, settings):
    settings.SIEP_CONSENT_REQUIRED = True
    consent_service.accept_content_notice(intento["student"], intento["version"], settings.SIEP_CONTENT_NOTICE_VERSION)
    consent_service.withdraw_content_notice(intento["student"], intento["version"])
    intento["assignment"].active = False
    intento["assignment"].save()
    respuesta = intento["client"].post(intento["base"] + "/safe-exit", {"reason": "x" * 600}, format="json")
    assert respuesta.status_code == 200
    assert intento["intento"].events.get(event_type="SAFE_EXIT_REQUESTED").detail == "x" * 500


def test_reflexion_exige_consentimiento_vigente(intento, settings):
    settings.SIEP_CONSENT_REQUIRED = True
    respuesta = intento["client"].post(intento["base"] + "/reflections", {"nodeId": intento["node"].pk, "text": "Texto"}, format="json")
    assert respuesta.status_code == 403


def test_reanudacion_funciona_tras_retirar_consentimiento(intento, settings):
    settings.SIEP_CONSENT_REQUIRED = True
    consent_service.accept_content_notice(intento["student"], intento["version"], settings.SIEP_CONTENT_NOTICE_VERSION)
    consent_service.withdraw_content_notice(intento["student"], intento["version"])
    assert intento["client"].post(intento["base"] + "/safe-exit", {}, format="json").status_code == 200
    respuesta = intento["client"].post(intento["base"] + "/resume", {}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "IN_PROGRESS"


def test_reflexion_repetida_con_clave_ajena_se_rechaza(intento):
    cliente, base = intento["client"], intento["base"]
    cuerpo = {"nodeId": intento["node"].pk, "text": "Texto", "requestId": "misma-clave"}
    assert cliente.post(base + "/reflections", cuerpo, format="json").status_code == 200
    cuerpo["nodeId"] = intento["end"].pk
    assert cliente.post(base + "/reflections", cuerpo, format="json").status_code == 400
    assert ReflectionJournal.objects.count() == 1


def test_salida_respeta_el_contrato_del_estado(intento):
    datos = intento["client"].post(intento["base"] + "/safe-exit", {}, format="json").json()["data"]
    assert set(datos) == {"attemptId", "attemptToken", "caseVersionId", "caseTitle", "status", "persona", "currentNode", "completionReport", "supportResources"}
    assert datos["attemptId"] == str(intento["intento"].pk)
    assert datos["persona"] == {"bond": "GUARDED", "activation": "TENSE", "label": "se muestra cautelosa y tensa"}
    assert datos["currentNode"]["options"] == []
    assert len(datos["supportResources"]) == 3

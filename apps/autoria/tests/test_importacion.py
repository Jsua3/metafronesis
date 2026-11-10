import pytest
from django.test import override_settings
from apps.simulation.models import SimulationCase

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-22")]
BASE = "/api/authoring/cases"


def test_exportar_e_importar_da_el_mismo_arbol(cliente):
    creado = cliente.post(BASE, {"code": "ORIGEN", "title": "Caso", "narrativeContext": "Contexto"}, format="json")
    pk = creado.data["data"]["versionId"]
    origen = cliente.get(f"{BASE}/{pk}/definition").data["data"]["nodes"][0]["id"]
    destino = cliente.post(f"{BASE}/{pk}/nodes", {"key": "fin", "title": "Fin", "narrative": "Final", "terminal": True}, format="json").data["data"]["id"]
    cliente.post(f"{BASE}/{pk}/decisions", {"sourceNodeId": origen, "targetNodeId": destino, "text": "Elegir", "responseClass": "RECOMMENDED", "feedback": "Explicación", "theoryBasis": "Fundamento"}, format="json")
    documento = cliente.get(f"{BASE}/{pk}/export").data["data"]
    documento["ficha"]["code"] = "COPIA"
    importado = cliente.post(f"{BASE}/import", documento, format="json")
    assert importado.status_code == 201
    copia = cliente.get(f"{BASE}/{importado.data['data']['versionId']}/export").data["data"]
    assert copia == documento
    assert cliente.post(f"{BASE}/import", documento, format="json").status_code == 409


def test_documento_invalido_400_con_detalle(cliente):
    respuesta = cliente.post(f"{BASE}/import", {"formato": "incorrecto"}, format="json")
    assert respuesta.status_code == 400
    assert respuesta.data.get("details") or respuesta.data.get("field") or respuesta.data.get("message")
    assert not SimulationCase.objects.exists()


def test_importar_exige_permiso(cliente, usuarios):
    usuarios[0].permiso_autoria.delete()
    respuesta = cliente.post(f"{BASE}/import", {}, format="json")
    assert respuesta.status_code == 403


def test_importacion_respeta_tope(cliente):
    with override_settings(SIEP_MAX_CASE_IMPORT_BODY_BYTES=40):
        respuesta = cliente.post(f"{BASE}/import", {"formato": "x" * 100}, format="json")
    assert respuesta.status_code == 413


def test_referencias_invalidas_no_crean_caso(cliente):
    creado = cliente.post(BASE, {"code": "ORIGINAL", "title": "Caso"}, format="json")
    pk = creado.data["data"]["versionId"]
    documento = cliente.get(f"{BASE}/{pk}/export").data["data"]
    documento["ficha"]["code"] = "INVALIDO"
    documento["decisiones"] = [{"key": "d", "source": "inicio", "target": "ausente", "text": "Elegir", "responseClass": "RISKY", "feedback": None, "theoryBasis": None}]
    respuesta = cliente.post(f"{BASE}/import", documento, format="json")
    assert respuesta.status_code == 400
    assert not SimulationCase.objects.filter(code="INVALIDO").exists()


def test_exportar_caso_ajeno_404(cliente, usuarios):
    creado = cliente.post(BASE, {"code": "PRIVADO", "title": "Caso"}, format="json")
    cliente.force_authenticate(usuarios[1])
    assert cliente.get(f"{BASE}/{creado.data['data']['versionId']}/export").status_code == 404

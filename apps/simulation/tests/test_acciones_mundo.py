"""Contrato de acciones y pistas de las salas."""
import pytest
from apps.simulation.models import SceneHint, MapObject, ClinicalTool
from apps.simulation.tests.test_mundo_api import mundo

pytestmark = [pytest.mark.django_db, pytest.mark.req("RF-11", "RF-17", "RF-19", "RNF-08")]


def test_pistas_ocultas_y_reenvio_idempotente(mundo):
    SceneHint.objects.create(scene_map=mundo["sala"], hint_order=1, text="Primera pista")
    SceneHint.objects.create(scene_map=mundo["sala"], hint_order=2, text="Pista reservada")
    cliente, base = mundo["client"], mundo["base"]
    assert cliente.get(base + "/hints").json()["data"] == {"available": 2, "shown": []}
    primera = cliente.post(base + "/hints/next", {"requestId": "pista-001"}, format="json")
    segunda = cliente.post(base + "/hints/next", {"requestId": "pista-001"}, format="json")
    assert primera.status_code == segunda.status_code == 200
    assert primera.json()["data"] == segunda.json()["data"]
    assert primera.json()["data"]["shown"][0]["text"] == "Primera pista"
    assert "Pista reservada" not in str(primera.json())
    assert mundo["intento"].events.filter(event_type="HINT_VIEWED").count() == 1


def test_interaccion_herramienta_y_personaje(mundo):
    MapObject.objects.create(scene_map=mundo["sala"], object_key="persona", label="Persona", object_type="PERSON", position_x=60, position_y=50, tool_code="guia")
    ClinicalTool.objects.create(case_version=mundo["version"], tool_code="guia", label="Guía")
    cliente, base = mundo["client"], mundo["base"]
    respuesta = cliente.post(base + "/interactions/persona", {}, format="json")
    assert respuesta.status_code == 200
    datos = respuesta.json()["data"]
    assert datos["unlockedToolCode"] == "guia"
    assert "persona" in datos["world"]["inspectedObjectKeys"]
    uso = cliente.post(base + "/tools/use", {"toolCode": "guia", "targetInteractionKey": "persona"}, format="json")
    assert uso.status_code == 200
    assert uso.json()["data"]["pertinent"] is True
    personaje = cliente.post(base + "/npcs/persona", {}, format="json")
    assert personaje.status_code == 200
    assert personaje.json()["data"]["flags"]["viewedNpcKeys"] == ["persona"]


def test_objeto_lejano_no_se_inspecciona(mundo):
    MapObject.objects.create(scene_map=mundo["sala"], object_key="distante", label="Objeto", object_type="OBJECT", position_x=400, position_y=350)
    respuesta = mundo["client"].post(mundo["base"] + "/interactions/distante", {}, format="json")
    assert respuesta.status_code == 400


@pytest.mark.parametrize("ruta,metodo,cuerpo", [
    ("hints", "get", None), ("hints/next", "post", {}),
    ("interactions/persona", "post", {}), ("tools/use", "post", {"toolCode": "guia"}),
    ("npcs/persona", "post", {}),
])
def test_otro_estudiante_no_puede_acceder(mundo, ruta, metodo, cuerpo):
    mundo["client"].force_authenticate(mundo["stranger"])
    peticion = getattr(mundo["client"], metodo)
    respuesta = peticion(mundo["base"] + "/" + ruta, cuerpo, format="json") if cuerpo is not None else peticion(mundo["base"] + "/" + ruta)
    assert respuesta.status_code in (403, 404)


def test_pistas_sin_contenido_y_sin_costo(mundo):
    respuesta = mundo["client"].get(mundo["base"] + "/hints")
    assert respuesta.json()["data"] == {"available": 0, "shown": [], "reason": "NONE_FOR_SCENE"}
    respuesta = mundo["client"].post(mundo["base"] + "/hints/next", {}, format="json")
    assert respuesta.status_code == 409
    assert not mundo["intento"].events.filter(event_type="HINT_VIEWED").exists()


def test_ventana_de_doble_clic_y_pistas_agotadas(mundo):
    from datetime import timedelta
    from django.utils import timezone
    SceneHint.objects.create(scene_map=mundo["sala"], hint_order=1, text="Primera")
    SceneHint.objects.create(scene_map=mundo["sala"], hint_order=2, text="Segunda")
    cliente, base = mundo["client"], mundo["base"]
    cliente.post(base + "/hints/next", {"requestId": "pista-001"}, format="json")
    respuesta = cliente.post(base + "/hints/next", {"requestId": "pista-002"}, format="json")
    assert respuesta.json()["data"]["available"] == 1
    mundo["intento"].events.filter(event_type="HINT_VIEWED").update(occurred_at=timezone.now() - timedelta(seconds=3))
    respuesta = cliente.post(base + "/hints/next", {"requestId": "pista-003"}, format="json")
    assert respuesta.json()["data"]["reason"] == "ALL_SHOWN"
    assert [pista["text"] for pista in respuesta.json()["data"]["shown"]] == ["Primera", "Segunda"]


def test_objeto_oculto_o_con_condicion_no_se_inspecciona(mundo):
    MapObject.objects.create(scene_map=mundo["sala"], object_key="oculto", label="Oculto", object_type="OBJECT", visible=False)
    MapObject.objects.create(scene_map=mundo["sala"], object_key="cerrado", label="Cerrado", object_type="OBJECT", position_x=50, position_y=50, unlock_condition_json='{"flag":"autorizado"}')
    cliente, base = mundo["client"], mundo["base"]
    assert cliente.post(base + "/interactions/oculto", {}, format="json").status_code == 404
    assert cliente.post(base + "/interactions/cerrado", {}, format="json").status_code == 400
    assert not mundo["intento"].events.filter(event_type="MAP_INTERACTION_OPENED").exists()


def test_herramienta_exige_inventario_y_npc_exige_cercania(mundo):
    ClinicalTool.objects.create(case_version=mundo["version"], tool_code="guia", label="Guía")
    MapObject.objects.create(scene_map=mundo["sala"], object_key="persona", label="Persona", object_type="PERSON", position_x=400, position_y=350)
    cliente, base = mundo["client"], mundo["base"]
    assert cliente.post(base + "/tools/use", {"toolCode": "guia"}, format="json").status_code == 400
    assert cliente.post(base + "/npcs/persona", {}, format="json").status_code == 400


def test_herramienta_repetida_no_duplica_evento(mundo):
    ClinicalTool.objects.create(case_version=mundo["version"], tool_code="guia", label="Guía", category="global")
    MapObject.objects.create(scene_map=mundo["sala"], object_key="recurso", label="Recurso", object_type="TOOL", position_x=50, position_y=50, tool_code="guia")
    cliente, base = mundo["client"], mundo["base"]
    cliente.post(base + "/interactions/recurso", {}, format="json")
    cuerpo = {"toolCode": "guia", "requestId": "uso-0001"}
    primera = cliente.post(base + "/tools/use", cuerpo, format="json")
    segunda = cliente.post(base + "/tools/use", cuerpo, format="json")
    assert primera.json()["data"] == segunda.json()["data"]
    assert mundo["intento"].events.filter(event_type="TOOL_USED").count() == 1

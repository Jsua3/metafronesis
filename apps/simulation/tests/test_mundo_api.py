"""Contrato de lectura y desplazamiento por las salas del intento."""

import json

import pytest
from rest_framework.test import APIClient

from apps.simulation.models import CollisionZone, DialogueLine, DialogueTree, MapObject, SceneMap, SimulationAttempt


pytestmark = [pytest.mark.django_db, pytest.mark.req("RF-17", "RF-19", "RF-21", "RNF-08")]


@pytest.fixture
def mundo(scene):
    intento = SimulationAttempt.objects.create(
        student=scene["student"], case_version=scene["version"],
        current_node=scene["node"], attempt_token_hash="prueba-mundo",
    )
    sala = SceneMap.objects.create(
        case_version=scene["version"], node=scene["node"], map_key="inicio",
        title="Inicio", width=500, height=400, spawn_x=50, spawn_y=50,
    )
    SceneMap.objects.create(
        case_version=scene["version"], node=scene["end"], map_key="fin",
        title="Fin", width=500, height=400, spawn_x=50, spawn_y=50,
    )
    MapObject.objects.create(
        scene_map=sala, object_key="puerta", label="Puerta", object_type="EXIT",
        position_x=60, position_y=50, width=20, height=20,
        metadata_json=json.dumps({"targetNodeKey": "end", "entryX": 50, "entryY": 50}),
    )
    CollisionZone.objects.create(
        scene_map=sala, zone_key="muro", position_x=200, position_y=200, width=30, height=30,
    )
    return {**scene, "intento": intento, "sala": sala,
            "base": f"/api/simulation/attempts/{intento.pk}"}


def test_lectura_tiene_contrato_y_crea_estado_perezoso(mundo):
    from apps.simulation.models import AttemptWorldState

    assert not AttemptWorldState.objects.filter(attempt=mundo["intento"]).exists()
    respuesta = mundo["client"].get(mundo["base"] + "/world", HTTP_X_SIEP_ATTEMPT_TOKEN="ignorado")
    assert respuesta.status_code == 200
    datos = respuesta.json()["data"]
    assert set(datos) == {"attemptId", "status", "map", "player", "objects", "collisions", "tools",
                          "inventory", "inspectedObjectKeys", "viewedDialogueKeys", "viewedNpcKeysHere", "usedToolKeys",
                          "usedToolKeysHere", "flags", "decisionOptions", "comments", "layout"}
    assert datos["usedToolKeysHere"] == []
    assert datos["viewedNpcKeysHere"] == []
    assert datos["player"] == {"x": 50, "y": 50}
    assert AttemptWorldState.objects.filter(attempt=mundo["intento"]).count() == 1


def test_el_mundo_recupera_la_identidad_del_tutor_inicial_al_reanudar_en_otra_sala(mundo):
    inicio = {"nombre": "Profesor", "rol": "Tutor del caso", "recipeId": "supervisor-clinico"}
    sala = mundo["sala"]
    sala.ambient_json = json.dumps({"tutor": {**inicio, "lineas": ["Bienvenida"]}})
    sala.save(update_fields=["ambient_json"])
    intento = mundo["intento"]
    intento.current_node = mundo["end"]
    intento.save(update_fields=["current_node"])

    def leer():
        respuesta = mundo["client"].get(mundo["base"] + "/world")
        assert respuesta.status_code == 200
        return respuesta.json()["data"]

    assert leer()["tutorInicial"] == inicio
    fin = SceneMap.objects.get(node=mundo["end"])
    fin.ambient_json = json.dumps({"tutor": {"nombre": "Lucía", "rol": "Docente"}})
    fin.save(update_fields=["ambient_json"])
    datos = leer()
    assert datos["map"]["ambient"]["tutor"]["nombre"] == "Lucía"
    assert "tutorInicial" not in datos


@pytest.mark.parametrize("coordenadas", [(5, 50), (210, 215)])
def test_movimiento_rechaza_limites_y_colisiones(mundo, coordenadas):
    respuesta = mundo["client"].patch(mundo["base"] + "/world-state", {
        "currentMapKey": "inicio", "playerX": coordenadas[0], "playerY": coordenadas[1],
    }, format="json")
    assert respuesta.status_code == 400
    assert respuesta.json()["success"] is False


def test_entrada_por_puerta_registra_evento(mundo):
    respuesta = mundo["client"].post(mundo["base"] + "/enter-room", {
        "targetNodeKey": "end", "doorKey": "puerta", "attemptToken": "ignorado",
    }, format="json")
    assert respuesta.status_code == 200
    assert respuesta.json()["data"]["map"]["key"] == "fin"
    assert mundo["intento"].events.filter(event_type="ROOM_ENTERED").count() == 1


def test_mapa_de_progreso_identifica_nodo_inicial(mundo):
    respuesta = mundo["client"].get(mundo["base"] + "/progress-map")
    assert respuesta.status_code == 200
    assert respuesta.json()["data"]["currentNodeKey"] == "start"


@pytest.mark.parametrize("usuario", ["stranger", "teacher", None])
@pytest.mark.parametrize("ruta,metodo,cuerpo", [
    ("world", "get", None), ("progress-map", "get", None),
    ("world-state", "patch", {"currentMapKey": "inicio", "playerX": 55, "playerY": 55}),
    ("enter-room", "post", {"targetNodeKey": "end", "doorKey": "puerta"}),
])
def test_solo_el_propietario_puede_jugar(mundo, usuario, ruta, metodo, cuerpo):
    cliente = mundo["client"] if usuario else APIClient()
    if usuario:
        cliente.force_authenticate(mundo[usuario])
    peticion = getattr(cliente, metodo)
    respuesta = peticion(mundo["base"] + "/" + ruta, cuerpo, format="json") if cuerpo else peticion(mundo["base"] + "/" + ruta)
    assert respuesta.status_code in (401, 403, 404)
    assert respuesta.json()["success"] is False


@pytest.mark.parametrize("ruta,cuerpo", [
    ("world-state", {"currentMapKey": "inicio", "playerX": 55, "playerY": 55}),
    ("enter-room", {"targetNodeKey": "end", "doorKey": "puerta"}),
])
def test_intento_terminado_no_admite_movimiento(mundo, ruta, cuerpo):
    intento = mundo["intento"]
    intento.status = "COMPLETED"
    intento.save(update_fields=["status"])
    metodo = mundo["client"].patch if ruta == "world-state" else mundo["client"].post
    respuesta = metodo(mundo["base"] + "/" + ruta, cuerpo, format="json")
    assert respuesta.status_code == 400


def test_movimiento_valido_devuelve_acuse(mundo):
    respuesta = mundo["client"].patch(mundo["base"] + "/world-state", {
        "currentMapKey": "inicio", "playerX": 70, "playerY": 70, "attemptToken": "ignorado",
    }, format="json")
    assert respuesta.status_code == 200
    assert respuesta.json()["data"] == {
        "attemptId": str(mundo["intento"].pk), "status": "IN_PROGRESS",
        "map": {"key": "inicio"}, "player": {"x": 70, "y": 70},
    }


@pytest.mark.parametrize("destino,puerta,estado", [
    ("end", "inexistente", 404), ("start", "puerta", 400), ("ausente", "puerta", 404),
])
def test_puerta_invalida_o_destino_inexistente(mundo, destino, puerta, estado):
    respuesta = mundo["client"].post(mundo["base"] + "/enter-room", {
        "targetNodeKey": destino, "doorKey": puerta,
    }, format="json")
    assert respuesta.status_code == estado
    assert not mundo["intento"].events.filter(event_type="ROOM_ENTERED").exists()


def test_mundo_incluye_dialogo_autorado(mundo):
    persona = MapObject.objects.create(scene_map=mundo["sala"], object_key="persona", label="Persona", object_type="PERSON")
    dialogo = DialogueTree.objects.create(scene_map=mundo["sala"], map_object=persona, tree_key="saludo", speaker_name="Persona")
    DialogueLine.objects.create(dialogue_tree=dialogo, display_order=1, speaker_name="Persona", text="Buenos días")
    datos = mundo["client"].get(mundo["base"] + "/world").json()["data"]
    persona_dto = next(objeto for objeto in datos["objects"] if objeto["key"] == "persona")
    assert persona_dto["dialogue"]["lines"][0]["text"] == "Buenos días"


def test_sala_por_piezas_muestra_plano_con_sala_actual(mundo):
    sala = mundo["sala"]
    sala.structure = {"ancho": 960}
    sala.save(update_fields=["structure"])
    datos = mundo["client"].get(mundo["base"] + "/world").json()["data"]
    assert datos["layout"]["currentRoom"] == "start"
    assert any(sala["key"] == "start" and sala["visited"] for sala in datos["layout"]["rooms"])


def test_puerta_bloqueada_exige_exploracion(mundo):
    puerta = mundo["sala"].map_objects.get(object_key="puerta")
    puerta.metadata_json = json.dumps({"targetNodeKey": "end", "entryX": 50, "entryY": 50,
                                      "requiresInspected": ["objeto"]})
    puerta.save(update_fields=["metadata_json"])
    respuesta = mundo["client"].post(mundo["base"] + "/enter-room", {"targetNodeKey": "end", "doorKey": "puerta"}, format="json")
    assert respuesta.status_code == 400
    assert not mundo["intento"].events.filter(event_type="ROOM_ENTERED").exists()


def test_entrada_repetida_con_la_misma_solicitud_no_duplica_evento(mundo):
    cuerpo = {"targetNodeKey": "end", "doorKey": "puerta", "requestId": "solicitud-123"}
    primera = mundo["client"].post(mundo["base"] + "/enter-room", cuerpo, format="json")
    segunda = mundo["client"].post(mundo["base"] + "/enter-room", cuerpo, format="json")
    assert primera.status_code == segunda.status_code == 200
    assert mundo["intento"].events.filter(event_type="ROOM_ENTERED").count() == 1


def test_coordenada_desmesurada_recibe_error_controlado(mundo):
    respuesta = mundo["client"].patch(mundo["base"] + "/world-state", {
        "currentMapKey": "inicio", "playerX": 10 ** 400, "playerY": 50,
    }, format="json")
    assert respuesta.status_code == 400
    assert respuesta.json()["success"] is False


def test_requisitos_nulos_de_puerta_se_interpretan_como_vacios(mundo):
    puerta = mundo["sala"].map_objects.get(object_key="puerta")
    puerta.metadata_json = json.dumps({"targetNodeKey": "end", "entryX": 50, "entryY": 50,
                                      "requiresInspected": None, "requiresTools": None, "requiresNpcs": None})
    puerta.save(update_fields=["metadata_json"])
    respuesta = mundo["client"].post(mundo["base"] + "/enter-room", {"targetNodeKey": "end", "doorKey": "puerta"}, format="json")
    assert respuesta.status_code == 200


def test_puerta_lejana_no_permite_entrar(mundo):
    puerta = mundo["sala"].map_objects.get(object_key="puerta")
    puerta.position_x = 350
    puerta.save(update_fields=["position_x"])
    respuesta = mundo["client"].post(mundo["base"] + "/enter-room", {"targetNodeKey": "end", "doorKey": "puerta"}, format="json")
    assert respuesta.status_code == 400
    assert not mundo["intento"].events.filter(event_type="ROOM_ENTERED").exists()


def test_openapi_del_patch_admite_acuse_y_mundo_completo():
    from drf_spectacular.generators import SchemaGenerator

    esquema = SchemaGenerator().get_schema(public=True)
    respuesta = esquema["paths"]["/api/simulation/attempts/{id}/world-state"]["patch"]["responses"]["200"]
    assert "anyOf" in respuesta["content"]["application/json"]["schema"]
    mundo = esquema["components"]["schemas"]["MundoRespuesta"]
    assert "usedToolKeysHere" in mundo["required"]
    assert mundo["properties"]["usedToolKeysHere"] == {"type": "array", "items": {"type": "string"}}
    assert "viewedNpcKeysHere" in mundo["required"]
    assert mundo["properties"]["viewedNpcKeysHere"] == {"type": "array", "items": {"type": "string"}}

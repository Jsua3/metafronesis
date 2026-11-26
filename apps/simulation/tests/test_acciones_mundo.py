"""Contrato de acciones y pistas de las salas."""
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch
from datetime import timedelta

import pytest
from django.utils import timezone
from django.db import close_old_connections, transaction
from django.db.models.query import QuerySet
from rest_framework.test import APIClient
from apps.simulation.models import AttemptWorldState, ClinicalTool, DialogueTree, MapObject, SceneHint
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
    assert datos["world"]["viewedNpcKeysHere"] == []
    uso = cliente.post(base + "/tools/use", {"toolCode": "guia", "targetInteractionKey": "persona"}, format="json")
    assert uso.status_code == 200
    assert uso.json()["data"]["pertinent"] is True
    personaje = cliente.post(base + "/npcs/persona", {}, format="json")
    assert personaje.status_code == 200
    assert personaje.json()["data"]["flags"]["viewedNpcKeys"] == ["persona"]
    assert personaje.json()["data"]["viewedNpcKeysHere"] == ["persona"]


def test_objeto_lejano_no_se_inspecciona(mundo):
    MapObject.objects.create(scene_map=mundo["sala"], object_key="distante", label="Objeto", object_type="OBJECT", position_x=400, position_y=350)
    respuesta = mundo["client"].post(mundo["base"] + "/interactions/distante", {}, format="json")
    assert respuesta.status_code == 400


@pytest.mark.parametrize("indicacion_compartida", [False, True])
def test_recupera_conversaciones_historicas_del_nodo(mundo, indicacion_compartida):
    cliente, base, intento = mundo["client"], mundo["base"], mundo["intento"]
    indicacion = "Hablar con Gloria"
    gloria = MapObject.objects.create(scene_map=mundo["sala"], object_key="gloria", object_type="PERSON",
                                      position_x=50, position_y=50, interaction_prompt=indicacion)
    DialogueTree.objects.create(scene_map=mundo["sala"], map_object=gloria, tree_key="dialogo-gloria")
    if indicacion_compartida:
        MapObject.objects.create(scene_map=mundo["sala"], object_key="otro", object_type="OBJECT", interaction_prompt=indicacion)
    assert cliente.get(base + "/world").status_code == 200
    AttemptWorldState.objects.filter(attempt=intento).update(
        viewed_dialogue_keys=["dialogo-gloria"],
        flags={"viewedNpcKeys": ["gloria", "dialogo-gloria", "ana", "lejos"]},
    )
    intento.events.create(node=intento.current_node, event_type="MAP_INTERACTION_OPENED", detail=indicacion)
    intento.events.create(node=intento.current_node, event_type="NPC_DIALOGUE_VIEWED", detail="NPC escuchado: ana")
    intento.events.create(node=mundo["end"], event_type="NPC_DIALOGUE_VIEWED", detail="NPC escuchado: lejos")

    datos = cliente.get(base + "/world").json()["data"]
    assert datos["viewedNpcKeysHere"] == (["ana"] if indicacion_compartida else ["gloria", "ana"])
    respuesta = cliente.post(base + "/interactions/gloria", {}, format="json")
    assert respuesta.status_code == 200, respuesta.content
    assert set(respuesta.json()["data"]["world"]["viewedNpcKeysHere"]) == {"gloria", "ana"}


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


def test_objeto_oculto_y_condicion_autorada(mundo):
    MapObject.objects.create(scene_map=mundo["sala"], object_key="oculto", label="Oculto", object_type="OBJECT", visible=False)
    MapObject.objects.create(scene_map=mundo["sala"], object_key="cerrado", label="Cerrado", object_type="OBJECT", position_x=50, position_y=50, unlock_condition_json='{"flag":"autorizado"}')
    cliente, base = mundo["client"], mundo["base"]
    assert cliente.post(base + "/interactions/oculto", {}, format="json").status_code == 404
    assert cliente.post(base + "/interactions/cerrado", {}, format="json").status_code == 200
    assert mundo["intento"].events.filter(event_type="MAP_INTERACTION_OPENED").count() == 1


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


def test_uso_historico_de_herramienta_se_atribuye_al_nodo_del_evento(mundo):
    intento, cliente, base = mundo["intento"], mundo["client"], mundo["base"]
    ClinicalTool.objects.create(case_version=mundo["version"], tool_code="guia", label="Guía")
    MapObject.objects.create(scene_map=mundo["sala"], object_key="ana", label="Ana", object_type="PERSON",
                             position_x=50, position_y=50, tool_code="guia")
    assert cliente.get(base + "/world").status_code == 200
    estado = intento.world_state
    estado.inventory = ["guia"]
    estado.used_tool_keys = ["guia@ana", "guia"]
    estado.save(update_fields=["inventory", "used_tool_keys"])
    intento.events.create(node=intento.current_node, event_type="TOOL_USED",
                          detail="Herramienta usada: guia sobre ana — pertinente")
    intento.events.create(node=mundo["end"], event_type="TOOL_USED",
                          detail="Herramienta usada: guia — no pertinente")

    datos = cliente.get(base + "/world").json()["data"]
    assert datos["usedToolKeysHere"] == ["guia@ana"]
    repetida = cliente.post(base + "/tools/use", {"toolCode": "guia", "targetInteractionKey": "ana"}, format="json")
    assert repetida.json()["data"]["alreadyUsed"] is True
    assert intento.events.filter(event_type="TOOL_USED").count() == 2


@pytest.mark.parametrize("movimiento", ["deambula", {"tipo": "va-y-viene", "hasta": {"x": 50, "y": 50}},
    {"tipo": "ruta", "puntos": [{"x": 50, "y": 50}, {"x": 80, "y": 50}], "modo": "ida-y-vuelta"}])
def test_persona_en_movimiento_es_alcanzable(mundo, movimiento):
    MapObject.objects.create(scene_map=mundo["sala"], object_key="persona", label="Persona", object_type="PERSON",
                             position_x=250, position_y=50, metadata_json=json.dumps({"movimiento": movimiento}))
    assert mundo["client"].post(mundo["base"] + "/interactions/persona", {}, format="json").status_code == 200
    assert mundo["client"].post(mundo["base"] + "/npcs/persona", {}, format="json").status_code == 200


def test_dialogo_propio_del_acompanante_sigue_disponible_en_el_recorrido(mundo):
    cliente, base, sala = mundo["client"], mundo["base"], mundo["sala"]
    guia = {"personas": ["lider", "acompanante"], "modo": "caminan",
            "lineas": [{"quien": "lider", "texto": "Caminemos."}]}
    sala.ambient_json = json.dumps({"conversaciones": [guia]})
    sala.save(update_fields=["ambient_json"])
    MapObject.objects.create(scene_map=sala, object_key="lider", object_type="PERSON", position_x=50, position_y=85)
    actor = MapObject.objects.create(scene_map=sala, object_key="acompanante", object_type="PERSON",
                                    position_x=390, position_y=85)
    DialogueTree.objects.create(scene_map=sala, map_object=actor, tree_key="dialogo-propio")
    lejos = MapObject.objects.create(scene_map=sala, object_key="fuera", object_type="PERSON", position_x=490, position_y=380)
    DialogueTree.objects.create(scene_map=sala, map_object=lejos, tree_key="fuera")
    assert cliente.post(base + "/interactions/acompanante", {}, format="json").status_code == 200
    assert cliente.post(base + "/interactions/fuera", {}, format="json").status_code == 400
    guia["modo"] = "quietos"
    sala.ambient_json = json.dumps({"conversaciones": [guia]})
    sala.save(update_fields=["ambient_json"])
    assert cliente.post(base + "/interactions/acompanante", {}, format="json").status_code == 400


def test_intento_esperado_cambiado_devuelve_conflicto(mundo):
    respuesta = mundo["client"].post("/api/simulation/attempts", {"case_version_id": mundo["version"].pk,
        "expectedAttemptId": str(uuid.uuid4())}, format="json")
    assert respuesta.status_code == 409
    assert respuesta.json()["code"] == "ATTEMPT_CHANGED"
    assert respuesta.json()["currentAttemptId"] == str(mundo["intento"].pk)


@pytest.mark.django_db(transaction=True)
def test_intento_esperado_relee_tras_reemplazo_concurrente(mundo):
    intento_id = mundo["intento"].pk
    estudiante_id = mundo["student"].pk
    version_id = mundo["version"].pk
    nodo_id = mundo["node"].pk
    esperando = Event()
    primero_original = QuerySet.first

    def observar_cerrojo(consulta):
        # Avisa justo antes de la relectura bajo cerrojo, que queda esperando la fila que tiene esta transacción.
        if consulta.model.__name__ == "SimulationAttempt" and consulta.query.select_for_update:
            esperando.set()
        return primero_original(consulta)

    def solicitar():
        close_old_connections()
        try:
            from apps.users.models import CustomUser
            cliente = APIClient()
            cliente.force_authenticate(CustomUser.objects.get(pk=estudiante_id))
            respuesta = cliente.post("/api/simulation/attempts", {"case_version_id": version_id,
                "expectedAttemptId": str(intento_id)}, format="json")
            return respuesta.status_code, respuesta.json()
        finally:
            close_old_connections()

    from apps.simulation.models import SimulationAttempt
    with ThreadPoolExecutor(max_workers=1) as ejecutor:
        with transaction.atomic():
            anterior = SimulationAttempt.objects.select_for_update().get(pk=intento_id)
            with patch.object(QuerySet, "first", observar_cerrojo):
                tarea = ejecutor.submit(solicitar)
                assert esperando.wait(10)
                anterior.status = "REPLACED"
                anterior.save(update_fields=["status"])
                nuevo = SimulationAttempt.objects.create(student_id=estudiante_id, case_version_id=version_id,
                    current_node_id=nodo_id, attempt_token_hash="reemplazo")
        codigo, datos = tarea.result(timeout=10)
    assert codigo == 409
    assert datos["code"] == "ATTEMPT_CHANGED"
    assert datos["currentAttemptId"] == str(nuevo.pk)
    assert SimulationAttempt.objects.get(pk=nuevo.pk).status == "IN_PROGRESS"


def test_contrato_completo_de_respuestas_de_acciones(mundo):
    pista = SceneHint.objects.create(scene_map=mundo["sala"], hint_order=1, text="Observa")
    MapObject.objects.create(scene_map=mundo["sala"], object_key="persona", label="Persona", object_type="PERSON",
                             position_x=50, position_y=50, tool_code="guia")
    ClinicalTool.objects.create(case_version=mundo["version"], tool_code="guia", label="Guía", category="global")
    cliente, base = mundo["client"], mundo["base"]
    assert cliente.get(base + "/hints").json()["data"] == {"available": 1, "shown": []}
    assert cliente.post(base + "/hints/next", {"requestId": "contrato-1"}, format="json").json()["data"] == {
        "available": 0, "shown": [{"id": pista.pk, "order": 1, "text": "Observa"}], "reason": "ALL_SHOWN"}
    interaccion = cliente.post(base + "/interactions/persona", {}, format="json").json()["data"]
    assert set(interaccion) == {"world", "interaction", "dialogue", "preparedDecisionOptionId", "unlockedToolCode"}
    assert interaccion["dialogue"] is None and interaccion["preparedDecisionOptionId"] is None
    assert interaccion["unlockedToolCode"] == "guia"
    objeto = interaccion["interaction"]
    assert set(objeto) == {"key", "label", "type", "x", "y", "width", "height", "color", "icon", "shortCode",
                           "collision", "interactionPrompt", "interactionText", "decisionOptionId", "toolCode",
                           "dialogue", "movementPattern", "facing", "metadata"}
    uso = cliente.post(base + "/tools/use", {"toolCode": "guia"}, format="json").json()["data"]
    assert set(uso) == {"world", "toolCode", "targetKey", "pertinent", "feedbackMessage", "alreadyUsed"}
    assert (uso["toolCode"], uso["targetKey"], uso["pertinent"], uso["alreadyUsed"]) == ("guia", None, True, False)
    assert uso["world"]["usedToolKeysHere"] == ["guia"]
    personaje = cliente.post(base + "/npcs/persona", {}, format="json").json()["data"]
    for estado in (interaccion["world"], uso["world"], personaje):
        assert set(estado) == {"attemptId", "status", "map", "player", "objects", "collisions", "tools", "inventory",
                               "inspectedObjectKeys", "viewedDialogueKeys", "viewedNpcKeysHere", "usedToolKeys", "usedToolKeysHere",
                               "flags", "decisionOptions", "comments", "layout"}
        assert set(estado["map"]) == {"id", "key", "title", "width", "height", "theme", "spawnX", "spawnY", "ambient", "structure"}
        assert set(estado["player"]) == {"x", "y"}
        assert isinstance(estado["attemptId"], str) and isinstance(estado["status"], str)
        assert all(isinstance(estado["map"][clave], int) for clave in ("id", "width", "height", "spawnX", "spawnY"))
        assert all(isinstance(estado["map"][clave], str) for clave in ("key", "title", "theme"))
        assert isinstance(estado["map"]["ambient"], dict)
        assert all(isinstance(estado["player"][clave], int) for clave in ("x", "y"))
        listas_texto = ("inventory", "inspectedObjectKeys", "viewedDialogueKeys", "viewedNpcKeysHere", "usedToolKeys", "usedToolKeysHere")
        assert all(isinstance(estado[clave], list) for clave in (*listas_texto, "objects", "collisions", "tools", "decisionOptions", "comments"))
        assert isinstance(estado["flags"], dict)
        assert all(isinstance(valor, str) for clave in listas_texto for valor in estado[clave])
        for elemento in estado["objects"]:
            assert all(isinstance(elemento[clave], str) for clave in ("key", "label", "type", "color", "icon", "shortCode", "interactionPrompt", "interactionText", "facing"))
            assert all(isinstance(elemento[clave], int) for clave in ("x", "y", "width", "height"))
            assert isinstance(elemento["collision"], bool)
            assert isinstance(elemento["movementPattern"], dict) and isinstance(elemento["metadata"], dict)
            assert elemento["dialogue"] is None
            assert elemento["decisionOptionId"] is None or isinstance(elemento["decisionOptionId"], int)
            assert elemento["toolCode"] is None or isinstance(elemento["toolCode"], str)
        for zona in estado["collisions"]:
            assert isinstance(zona["key"], str) and (zona["label"] is None or isinstance(zona["label"], str))
            assert all(isinstance(zona[clave], int) for clave in ("x", "y", "width", "height"))
        for herramienta in estado["tools"]:
            assert all(isinstance(herramienta[clave], str) for clave in ("code", "label", "icon", "category", "description"))
            assert isinstance(herramienta["active"], bool)
        assert all(set(elemento) == set(objeto) for elemento in estado["objects"])
        assert all(set(elemento) == {"key", "label", "x", "y", "width", "height"} for elemento in estado["collisions"])
        assert all(set(elemento) == {"code", "label", "icon", "category", "description", "active"} for elemento in estado["tools"])


@pytest.mark.django_db(transaction=True)
def test_pistas_concurrentes_con_misma_solicitud(mundo):
    from apps.simulation.services.world_actions import siguiente
    from apps.users.models import CustomUser
    SceneHint.objects.create(scene_map=mundo["sala"], hint_order=1, text="Primera")
    SceneHint.objects.create(scene_map=mundo["sala"], hint_order=2, text="Segunda")
    intento_id, estudiante_id = mundo["intento"].pk, mundo["student"].pk
    def solicitar():
        close_old_connections()
        try:
            return siguiente(CustomUser.objects.get(pk=estudiante_id), intento_id, {"requestId": "concurrente-1"})
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as ejecutor:
        resultados = list(ejecutor.map(lambda indice: solicitar(), range(2)))
    assert resultados[0] == resultados[1]
    assert resultados[0]["available"] == 1
    assert mundo["intento"].events.filter(event_type="HINT_VIEWED").count() == 1


def test_intento_esperado_valido_y_uuid_invalido(mundo):
    cliente = mundo["client"]
    cuerpo = {"case_version_id": mundo["version"].pk, "expectedAttemptId": str(mundo["intento"].pk)}
    assert cliente.post("/api/simulation/attempts", cuerpo, format="json").status_code == 200
    cuerpo["expectedAttemptId"] = "invalido"
    assert cliente.post("/api/simulation/attempts", cuerpo, format="json").status_code == 400


def test_ruta_de_persona_no_autoriza_el_rectangulo_envolvente(mundo):
    movimiento = {"tipo": "ruta", "puntos": [{"x": 400, "y": 50}, {"x": 400, "y": 350}], "modo": "ida-y-vuelta"}
    MapObject.objects.create(scene_map=mundo["sala"], object_key="persona", label="Persona", object_type="PERSON",
                             position_x=50, position_y=50, metadata_json=json.dumps({"movimiento": movimiento}))
    from apps.simulation.services import world
    estado = world._estado(mundo["intento"])
    estado.player_x, estado.player_y = 50, 350
    estado.save()
    respuesta = mundo["client"].post(mundo["base"] + "/interactions/persona", {}, format="json")
    assert respuesta.status_code == 400


def test_reutilizar_solicitud_de_pista_para_herramienta_se_rechaza(mundo):
    SceneHint.objects.create(scene_map=mundo["sala"], hint_order=1, text="Primera")
    ClinicalTool.objects.create(case_version=mundo["version"], tool_code="guia", label="Guía", category="global")
    MapObject.objects.create(scene_map=mundo["sala"], object_key="recurso", label="Recurso", object_type="TOOL",
                             position_x=50, position_y=50, tool_code="guia")
    cliente, base = mundo["client"], mundo["base"]
    cliente.post(base + "/interactions/recurso", {}, format="json")
    cliente.post(base + "/hints/next", {"requestId": "compartido-1"}, format="json")
    respuesta = cliente.post(base + "/tools/use", {"toolCode": "guia", "requestId": "compartido-1"}, format="json")
    assert respuesta.status_code == 400
    assert not mundo["intento"].events.filter(event_type="TOOL_USED").exists()

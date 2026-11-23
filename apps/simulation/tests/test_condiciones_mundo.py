"""Comentarios y disponibilidad durante la exploración."""
import json

import pytest
from apps.simulation.models import CaseCharacter, ClinicalTool, MapObject
from apps.simulation.tests.test_mundo_api import mundo

pytestmark = [pytest.mark.django_db, pytest.mark.req("RF-17", "RF-19", "RF-21")]


def test_comentarios_y_opciones_reaccionan_a_exploracion(mundo):
    personaje = CaseCharacter.objects.create(case_version=mundo["version"], character_key="ana", display_name="Ana")
    MapObject.objects.create(scene_map=mundo["sala"], object_key="ana", label="Ana", object_type="PERSON", character=personaje, position_x=50, position_y=50)
    MapObject.objects.create(scene_map=mundo["sala"], object_key="historia", label="Historia", object_type="OBJECT", position_x=50, position_y=50)
    mundo["node"].comments_json = json.dumps([{"personaje": "ana", "linea": "Ya la viste", "cuando": {"inspected": "historia"}}])
    mundo["node"].save()
    opcion = mundo["option"]
    opcion.requires_json = json.dumps({"inspected": "historia"})
    opcion.save()
    from apps.simulation.models import DecisionOption
    libre = DecisionOption.objects.create(case_version=mundo["version"], source_node=mundo["node"], target_node=mundo["end"], option_key="libre", text="Esperar", response_class="ACCEPTABLE")
    cliente, base = mundo["client"], mundo["base"]
    inicial = cliente.get(base + "/world").json()["data"]
    assert inicial["decisionOptions"] == [{"id": libre.pk, "text": "Esperar"}]
    assert inicial["comments"] == []
    denegada = cliente.post(base + "/decisions", {"decision_option_id": opcion.pk, "request_id": "requisito-1"}, format="json")
    assert denegada.status_code == 400
    respuesta = cliente.post(base + "/interactions/historia", {}, format="json").json()["data"]["world"]
    assert respuesta["decisionOptions"] == [{"id": opcion.pk, "text": "Terminar"}, {"id": libre.pk, "text": "Esperar"}]
    assert respuesta["comments"] == [{"id": f'{mundo["node"].pk}-0', "objectKey": "ana", "line": "Ya la viste", "emotion": None, "gesture": None}]


def test_requisito_roto_no_bloquea_una_escena_sin_salida(mundo):
    mundo["option"].requires_json = '{"desconocido":true}'
    mundo["option"].save()
    datos = mundo["client"].get(mundo["base"] + "/world").json()["data"]
    assert datos["decisionOptions"] == [{"id": mundo["option"].pk, "text": "Terminar"}]


def test_herramienta_y_personaje_activan_comentarios(mundo):
    personaje = CaseCharacter.objects.create(case_version=mundo["version"], character_key="ana", display_name="Ana")
    MapObject.objects.create(scene_map=mundo["sala"], object_key="ana", label="Ana", object_type="PERSON", character=personaje, position_x=50, position_y=50, tool_code="guia")
    ClinicalTool.objects.create(case_version=mundo["version"], tool_code="guia", label="Guía")
    mundo["node"].comments_json = json.dumps([{"personaje": "ana", "linea": "Te escucho", "cuando": {"all": [{"talked": "ana"}, {"used": "guia"}]}}])
    mundo["node"].save()
    cliente, base = mundo["client"], mundo["base"]
    cliente.post(base + "/interactions/ana", {}, format="json")
    cliente.post(base + "/npcs/ana", {}, format="json")
    respuesta = cliente.post(base + "/tools/use", {"toolCode": "guia", "targetInteractionKey": "ana"}, format="json")
    assert respuesta.json()["data"]["world"]["comments"][0]["line"] == "Te escucho"


def test_decision_devuelve_reaccion_y_repite_el_resultado(mundo):
    personaje = CaseCharacter.objects.create(case_version=mundo["version"], character_key="ana", display_name="Ana")
    MapObject.objects.create(scene_map=mundo["sala"], object_key="ana", label="Ana", object_type="PERSON", character=personaje, position_x=50, position_y=50)
    mundo["option"].reaction_json = json.dumps({"personaje": "ana", "linea": "Gracias", "emocion": "alegre", "gesto": "asiente"})
    mundo["option"].save()
    cliente, base = mundo["client"], mundo["base"]
    cliente.get(base + "/world")
    cuerpo = {"decision_option_id": mundo["option"].pk, "request_id": "decision-reaccion"}
    primera = cliente.post(base + "/decisions", cuerpo, format="json")
    segunda = cliente.post(base + "/decisions", cuerpo, format="json")
    assert primera.status_code == 200
    assert primera.json()["reaction"] == {"line": "Gracias", "emotion": "alegre", "gesture": "asiente", "objectKey": "ana"}
    assert primera.json() == segunda.json()

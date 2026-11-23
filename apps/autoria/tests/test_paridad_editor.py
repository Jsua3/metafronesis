"""Paridad de autoría con el editor de v3: campos de escena, decisión y ficha, crear por piezas y el 409 con la vista."""
import pytest

from apps.simulation.models import CaseCharacter, CaseVersion, DecisionOption, SimulationNode
from apps.simulation.models.world import CollisionZone, MapObject, SceneMap
from .test_borrador import crear

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-238")]
BASE = "/api/authoring/cases"
ESCENA_COMPLETA = {
    "title": "Sala de espera", "narrative": "Texto", "supportResources": ["Línea 155", "Guía de ruta"],
    "requiredTools": ["ficha-riesgo"], "sensitiveContent": True, "safeExitRequired": True,
    "warningMessage": "Puede resultar difícil", "positionX": 320, "positionY": 140, "intensity": "HIGH",
    "decisionPrompt": "¿Qué haces?",
}
DECISION_COMPLETA = {
    "text": "Escuchar", "responseClass": "CONTRAINDICATED", "prohibitionReason": "Revictimiza",
    "immediateFeedback": "Se cierra", "consequenceText": "Ella calla", "feedbackText": "Mejor validar",
    "theoryBasis": "Teoría", "effects": {"persona": {"bond": 1}, "milestones": ["hito_uno"]},
    "requires": {"inspected": "historia"}, "reaction": {"linea": "Gracias", "emocion": "triste", "personaje": "ana"},
}


@pytest.fixture
def caso(cliente):
    version = CaseVersion.objects.get(pk=crear(cliente).data["data"]["versionId"])
    CaseCharacter.objects.create(case_version=version, character_key="ana", display_name="Ana")
    version.rules = '{"milestones":[{"key":"hito_uno","label":"Hito"}]}'
    version.save()
    return version


def crear_escena(cliente, version, **extra):
    return cliente.post(f"{BASE}/{version.pk}/nodes", {**ESCENA_COMPLETA, **extra}, format="json")


def test_escena_guarda_y_devuelve_los_campos_del_editor(cliente, caso):
    respuesta = crear_escena(cliente, caso, comments=[{"personaje": "ana", "linea": "Hola"}])
    assert respuesta.status_code == 201
    datos = respuesta.data["data"]
    nodo = SimulationNode.objects.get(pk=datos["id"])
    assert (nodo.support_resources_json, nodo.required_tools_json) == ('["Línea 155", "Guía de ruta"]', '["ficha-riesgo"]')
    assert (nodo.sensitive_content, nodo.safe_exit_required, nodo.warning_message) == (True, True, "Puede resultar difícil")
    assert (nodo.position_x, nodo.position_y, nodo.intensity, nodo.decision_prompt) == (320, 140, "HIGH", "¿Qué haces?")
    assert datos["supportResources"] == ["Línea 155", "Guía de ruta"] and datos["requiredTools"] == ["ficha-riesgo"]
    assert datos["sensitiveContent"] and datos["safeExitRequired"] and datos["warningMessage"] == "Puede resultar difícil"
    assert (datos["positionX"], datos["positionY"], datos["intensity"]) == (320, 140, "HIGH")
    assert datos["comments"] == [{"personaje": "ana", "linea": "Hola"}] and datos["question"] == "¿Qué haces?"
    editor = cliente.get(f"{BASE}/{caso.pk}/editor").data["data"]
    vista = next(n for n in editor["nodes"] if n["id"] == nodo.pk)
    assert vista["comments"] == datos["comments"] and vista["supportResources"] == datos["supportResources"]
    assert editor["rehearsedToEnd"] is False


def test_escena_sensible_nace_con_intensidad_alta_y_ausente_no_toca(cliente, caso):
    respuesta = cliente.post(f"{BASE}/{caso.pk}/nodes", {"title": "S", "narrative": "", "sensitiveContent": True}, format="json")
    assert respuesta.data["data"]["intensity"] == "HIGH"
    identificador = crear_escena(cliente, caso).data["data"]["id"]
    cliente.put(f"{BASE}/{caso.pk}/nodes/{identificador}", {"title": "Otro"}, format="json")
    nodo = SimulationNode.objects.get(pk=identificador)
    assert nodo.title == "Otro" and nodo.support_resources_json == '["Línea 155", "Guía de ruta"]' and nodo.position_x == 320
    cliente.put(f"{BASE}/{caso.pk}/nodes/{identificador}", {"supportResources": [], "positionX": None}, format="json")
    nodo.refresh_from_db()
    assert nodo.support_resources_json == "[]" and nodo.position_x is None


@pytest.mark.parametrize("campo, valor", [
    ("intensity", "EXTREMA"), ("supportResources", "no es lista"), ("positionX", "a"),
    ("comments", [{"personaje": "nadie", "linea": "Hola"}]), ("comments", [{"linea": "sin personaje"}]),
    ("warningMessage", "<b>aviso</b>"),
])
def test_escena_rechaza_valores_invalidos(cliente, caso, campo, valor):
    assert crear_escena(cliente, caso, **{campo: valor}).status_code == 400


def test_decision_guarda_y_devuelve_los_campos_del_editor(cliente, caso):
    origen = caso.nodes.get()
    destino = SimulationNode.objects.create(case_version=caso, node_key="destino", title="D", narrative="")
    datos = {**DECISION_COMPLETA, "sourceNodeId": origen.pk, "targetNodeId": destino.pk}
    respuesta = cliente.post(f"{BASE}/{caso.pk}/decisions", datos, format="json")
    assert respuesta.status_code == 201, respuesta.data
    opcion = DecisionOption.objects.get(pk=respuesta.data["data"]["id"])
    assert (opcion.prohibition_reason, opcion.immediate_feedback, opcion.consequence_text) == ("Revictimiza", "Se cierra", "Ella calla")
    assert opcion.feedback_text == "Mejor validar"
    assert opcion.effects == '{"persona": {"bond": 1}, "milestones": ["hito_uno"]}'
    assert opcion.requires_json == '{"inspected": "historia"}'
    assert opcion.reaction_json == '{"linea": "Gracias", "emocion": "triste", "personaje": "ana"}'
    devuelto = respuesta.data["data"]
    assert devuelto["prohibitionReason"] == "Revictimiza" and devuelto["immediateFeedback"] == "Se cierra"
    assert devuelto["consequenceText"] == "Ella calla" and devuelto["effects"]["milestones"] == ["hito_uno"]
    assert devuelto["requires"] == {"inspected": "historia"} and devuelto["reaction"]["personaje"] == "ana"
    editor = cliente.get(f"{BASE}/{caso.pk}/editor").data["data"]
    vista = next(d for d in editor["decisions"] if d["id"] == opcion.pk)
    assert vista["requires"] == {"inspected": "historia"} and vista["reaction"]["linea"] == "Gracias"
    cliente.put(f"{BASE}/{caso.pk}/decisions/{opcion.pk}", {"requires": None, "reaction": {}, "effects": {}}, format="json")
    opcion.refresh_from_db()
    assert (opcion.requires_json, opcion.reaction_json, opcion.effects) == ("{}", "{}", "{}")
    assert opcion.consequence_text == "Ella calla"


@pytest.mark.parametrize("campo, valor", [
    ("effects", {"milestones": ["no_declarado"]}), ("effects", {"inventado": 1}), ("requires", {"roto": True}),
    ("reaction", {"gesto": "baila"}), ("reaction", {"personaje": "nadie"}), ("consequenceText", "<i>x</i>"),
])
def test_decision_rechaza_valores_invalidos(cliente, caso, campo, valor):
    origen = caso.nodes.get()
    destino = SimulationNode.objects.create(case_version=caso, node_key="destino", title="D", narrative="")
    datos = {"sourceNodeId": origen.pk, "targetNodeId": destino.pk, "text": "x", "responseClass": "RECOMMENDED", campo: valor}
    assert cliente.post(f"{BASE}/{caso.pk}/decisions", datos, format="json").status_code == 400


def test_ficha_acepta_y_devuelve_advertencias_de_contenido(cliente, caso):
    respuesta = cliente.put(f"{BASE}/{caso.pk}/brief", {"contentWarnings": ["Violencia de pareja", " violencia de PAREJA ", ""]}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["brief"]["contentWarnings"] == ["Violencia de pareja"]
    caso.refresh_from_db()
    assert caso.content_warnings == '["Violencia de pareja"]'
    assert cliente.get(f"{BASE}/{caso.pk}/editor").data["data"]["contentWarnings"] == ["Violencia de pareja"]
    cliente.put(f"{BASE}/{caso.pk}/brief", {"title": "Nuevo"}, format="json")
    caso.refresh_from_db()
    assert caso.content_warnings == '["Violencia de pareja"]'
    cliente.put(f"{BASE}/{caso.pk}/brief", {"contentWarnings": []}, format="json")
    caso.refresh_from_db()
    assert caso.content_warnings == "[]"


def test_ficha_rechaza_demasiadas_advertencias(cliente, caso):
    muchas = [f"tema {numero}" for numero in range(9)]
    assert cliente.put(f"{BASE}/{caso.pk}/brief", {"contentWarnings": muchas}, format="json").status_code == 400
    assert cliente.put(f"{BASE}/{caso.pk}/brief", {"contentWarnings": ["<b>x</b>"]}, format="json").status_code == 400


def test_crear_con_advertencias(cliente):
    respuesta = cliente.post(BASE, {"code": "ADV", "title": "Caso", "contentWarnings": ["Duelo"]}, format="json")
    assert respuesta.data["data"]["brief"]["contentWarnings"] == ["Duelo"]


def test_crear_caso_por_piezas_copia_las_salas_del_lugar(cliente):
    respuesta = cliente.post(BASE, {"code": "LUGAR", "title": "Caso", "lugarId": "casa", "salas": ["sala", "fachada"]}, format="json")
    assert respuesta.status_code == 201, respuesta.data
    version = CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])
    assert list(version.nodes.order_by("display_order").values_list("node_key", "start_node")) == [("sala", True), ("fachada", False)]
    assert version.scene_maps.count() == 2 and MapObject.objects.filter(scene_map__case_version=version).exists()
    assert CollisionZone.objects.filter(scene_map__case_version=version, zone_key="pared-fondo").count() == 2
    assert version.characters.exists() and version.clinical_tools.exists()
    assert "valorar_el_riesgo" in version.rules and SceneMap.objects.get(node__node_key="fachada", case_version=version).title
    salida = MapObject.objects.filter(scene_map__case_version=version, object_type="EXIT")
    assert salida.count() == 2


@pytest.mark.parametrize("cuerpo, estado", [
    ({"lugarId": "no-existe", "salas": ["sala"]}, 404), ({"lugarId": "casa", "salas": []}, 400),
    ({"lugarId": "casa", "salas": ["sala", "sala"]}, 400), ({"lugarId": "casa", "salas": ["otra"]}, 400),
    ({"lugarId": "casa"}, 400), ({"lugarId": 7, "salas": ["sala"]}, 400),
])
def test_crear_por_piezas_valida_lugar_y_salas_sin_crear_el_caso(cliente, cuerpo, estado):
    respuesta = cliente.post(BASE, {"code": "MAL", "title": "Caso", **cuerpo}, format="json")
    assert respuesta.status_code == estado
    assert not CaseVersion.objects.filter(simulation_case__code="MAL").exists()


def test_conflicto_de_revision_trae_la_vista_actual(cliente, caso, settings):
    settings.REVISION_REQUIRED = True
    cliente.put(f"{BASE}/{caso.pk}/brief", {"title": "Nuevo", "revision": 0}, format="json")
    respuesta = cliente.post(f"{BASE}/{caso.pk}/nodes", {"title": "N", "narrative": "", "revision": 0}, format="json")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "REVISION_CONFLICT"
    assert respuesta.data["revision"] == 1 and respuesta.data["current"]["caseVersionId"] == caso.pk
    assert respuesta.data["current"]["revision"] == 1


def test_la_revision_tambien_llega_por_cabecera(cliente, caso, settings):
    settings.REVISION_REQUIRED = True
    sin = cliente.post(f"{BASE}/{caso.pk}/nodes", {"title": "N", "narrative": ""}, format="json")
    assert sin.status_code == 400
    con = cliente.post(f"{BASE}/{caso.pk}/nodes", {"title": "N", "narrative": ""}, format="json", HTTP_X_CASE_REVISION="0")
    assert con.status_code == 201


def test_exportar_e_importar_conserva_las_advertencias_de_contenido(cliente, caso):
    cliente.put(f"{BASE}/{caso.pk}/brief", {"contentWarnings": ["Duelo"]}, format="json")
    documento = cliente.get(f"{BASE}/{caso.pk}/export").data["data"]
    documento["ficha"]["code"] = "IMPORTADO"
    importado = cliente.post(f"{BASE}/import", documento, format="json")
    assert importado.status_code == 201
    assert importado.data["data"]["brief"]["contentWarnings"] == ["Duelo"]

import pytest

from apps.simulation.models import CaseVersion, DecisionOption, SimulationNode
from apps.simulation.models.world import CaseCharacter, ClinicalTool, DialogueTree, SceneMap
from apps.users.models import CustomUser
from .test_borrador import crear

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-22", "SIEP-23")]


@pytest.mark.parametrize("editar", [False, True])
def test_codigo_de_herramienta_reserva_la_arroba(cliente, editar):
    version_id = crear(cliente).data["data"]["versionId"]
    ruta = f"/api/authoring/cases/{version_id}/tools"
    datos = {"toolCode": "escucha@ana", "label": "Escucha"}
    if editar:
        herramienta = ClinicalTool.objects.create(case_version_id=version_id, tool_code="escucha", label="Escucha")
        respuesta = cliente.put(f"{ruta}/{herramienta.pk}", datos, format="json")
    else:
        respuesta = cliente.post(ruta, datos, format="json")
    assert respuesta.status_code == 400, respuesta.content
    assert respuesta.json()["field"] == "toolCode"
    assert "'@' está reservado" in respuesta.json()["message"]
    assert not ClinicalTool.objects.filter(case_version_id=version_id, tool_code=datos["toolCode"]).exists()


def test_guardar_dialogos_en_mundo(cliente, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    ruta = f"/api/authoring/cases/{version_id}/world"
    datos = {"revision": 0, "dialogues": [{"key": "saludo", "speakerName": "Ana", "lines": [{"order": 0, "text": "Hola"}], "choices": []}]}
    respuesta = cliente.put(ruta, datos, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["dialogues"][0]["lines"][0]["text"] == "Hola"
    assert cliente.put(ruta, datos, format="json").status_code == 409


def test_personajes_herramientas_y_orden(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    base = f"/api/authoring/cases/{version_id}"
    personaje = cliente.post(f"{base}/characters", {"characterKey": "ana", "displayName": "Ana"}, format="json")
    assert personaje.status_code == 200
    herramienta = cliente.post(f"{base}/tools", {"toolCode": "escucha", "label": "Escucha"}, format="json")
    assert herramienta.status_code == 200
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    assert cliente.patch(f"{base}/nodes/reorder", {"order": [nodo.pk]}, format="json").status_code == 200


@pytest.mark.parametrize("tipo", ["dialogo", "herramienta", "personaje", "orden"])
def test_operaciones_respetan_rol_propiedad_borrador_y_revision(cliente, usuarios, settings, tipo):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    base = f"/api/authoring/cases/{version_id}"
    rutas = {
        "dialogo": ("post", f"{base}/maps/{mapa.pk}/dialogues", {"treeKey": "dialogo", "speakerName": "Ana"}),
        "herramienta": ("post", f"{base}/tools", {"toolCode": "escucha", "label": "Escucha"}),
        "personaje": ("post", f"{base}/characters", {"characterKey": "ana", "displayName": "Ana"}),
        "orden": ("patch", f"{base}/nodes/reorder", {"order": [nodo.pk]}),
    }
    metodo, ruta, datos = rutas[tipo]
    enviar = lambda: getattr(cliente, metodo)(ruta, {**datos, "revision": 0}, format="json")
    cliente.force_authenticate(usuarios[1])
    assert enviar().status_code == 404
    cliente.force_authenticate(usuarios[2])
    assert enviar().status_code == 403
    cliente.force_authenticate(usuarios[0])
    CaseVersion.objects.filter(pk=version_id).update(status="PUBLISHED")
    assert enviar().data["code"] == "VERSION_NOT_EDITABLE"
    CaseVersion.objects.filter(pk=version_id).update(status="DRAFT")
    admin = CustomUser.objects.get(email="admin-autoria@example.test")
    cliente.force_authenticate(admin)
    assert enviar().status_code == 200
    assert enviar().data["code"] == "REVISION_CONFLICT"


def test_dialogo_lineas_opciones_integridad_y_reemplazo_atomico(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    otra_id = crear(cliente, "OTRA").data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    otro_nodo = SimulationNode.objects.get(case_version_id=otra_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    otro_mapa = SceneMap.objects.create(case_version_id=otra_id, node=otro_nodo, map_key="otra", title="Otra")
    base = f"/api/authoring/cases/{version_id}"
    datos = {"treeKey": "saludo", "speakerName": "Ana", "lines": [{"displayOrder": 0, "text": "Hola"}]}
    assert cliente.post(f"{base}/maps/{otro_mapa.pk}/dialogues", datos, format="json").status_code == 404
    assert cliente.post(f"{base}/maps/{mapa.pk}/dialogues", datos, format="json").status_code == 200
    arbol = DialogueTree.objects.get(scene_map=mapa)
    assert arbol.lines.get().text == "Hola"
    assert cliente.post(f"{base}/maps/{mapa.pk}/dialogues", datos, format="json").status_code == 400
    invalido = {**datos, "lines": [{"displayOrder": 0, "text": "Una"}, {"displayOrder": 0, "text": "Dos"}]}
    assert cliente.put(f"{base}/dialogues/{arbol.pk}", invalido, format="json").status_code == 400
    assert arbol.lines.get().text == "Hola"
    mundo = {"dialogues": [{"id": arbol.pk, "key": "saludo", "speakerName": "Ana", "lines": [{"order": 1, "text": "Adiós"}], "choices": [{"key": "seguir", "text": "Continuar", "effect": {"valor": 1}}]}]}
    respuesta = cliente.put(f"{base}/world", mundo, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["dialogues"][0]["choices"][0]["effect"] == {"valor": 1}
    assert cliente.delete(f"{base}/dialogues/{arbol.pk}").status_code == 200
    assert not DialogueTree.objects.filter(pk=arbol.pk).exists()


@pytest.mark.parametrize("tipo, datos, campo", [
    ("tools", {"toolCode": "escucha", "label": "Escucha"}, "tools"),
    ("characters", {"characterKey": "ana", "displayName": "Ana"}, "characters"),
])
def test_crear_editar_borrar_y_validar_claves(cliente, tipo, datos, campo):
    version_id = crear(cliente).data["data"]["versionId"]
    base = f"/api/authoring/cases/{version_id}/{tipo}"
    respuesta = cliente.post(base, datos, format="json")
    assert respuesta.status_code == 200
    identificador = respuesta.data["data"][campo][0]["id"]
    assert cliente.post(base, datos, format="json").status_code == 400
    assert cliente.put(f"{base}/{identificador}", datos, format="json").status_code == 200
    assert cliente.delete(f"{base}/{identificador}").status_code == 200


def test_orden_exige_todos_los_nodos_una_vez(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    ruta = f"/api/authoring/cases/{version_id}/nodes/reorder"
    assert cliente.patch(ruta, {"order": [nodo.pk, nodo.pk]}, format="json").status_code == 400
    assert cliente.patch(ruta, {"order": []}, format="json").status_code == 400
    assert cliente.patch(ruta, {"order": [nodo.pk]}, format="json").status_code == 200


@pytest.mark.parametrize("tipo, metodo", [
    ("dialogo", "put"), ("dialogo", "delete"),
    ("herramienta", "put"), ("herramienta", "delete"),
    ("personaje", "put"), ("personaje", "delete"),
])
def test_edicion_y_borrado_respetan_rol_y_version(cliente, usuarios, tipo, metodo):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    arbol = DialogueTree.objects.create(scene_map=mapa, tree_key="saludo", speaker_name="Ana")
    herramienta = ClinicalTool.objects.create(case_version_id=version_id, tool_code="escucha", label="Escucha")
    personaje = CaseCharacter.objects.create(case_version_id=version_id, character_key="ana", display_name="Ana")
    base = f"/api/authoring/cases/{version_id}"
    rutas = {
        "dialogo": (f"{base}/dialogues/{arbol.pk}", {"treeKey": "saludo", "speakerName": "Ana"}),
        "herramienta": (f"{base}/tools/{herramienta.pk}", {"toolCode": "escucha", "label": "Escucha"}),
        "personaje": (f"{base}/characters/{personaje.pk}", {"characterKey": "ana", "displayName": "Ana"}),
    }
    ruta, datos = rutas[tipo]
    enviar = lambda: getattr(cliente, metodo)(ruta, datos, format="json")
    cliente.force_authenticate(usuarios[1])
    assert enviar().status_code == 404
    cliente.force_authenticate(usuarios[2])
    assert enviar().status_code == 403
    cliente.force_authenticate(usuarios[0])
    CaseVersion.objects.filter(pk=version_id).update(status="PUBLISHED")
    assert enviar().data["code"] == "VERSION_NOT_EDITABLE"
    CaseVersion.objects.filter(pk=version_id).update(status="DRAFT")
    assert enviar().status_code == 200


def test_mundo_rechaza_decision_ajena_y_conserva_dialogo(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    otra_id = crear(cliente, "AJENA").data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    otro_nodo = SimulationNode.objects.get(case_version_id=otra_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    arbol = DialogueTree.objects.create(scene_map=mapa, tree_key="saludo", speaker_name="Ana")
    decision = DecisionOption.objects.create(case_version_id=otra_id, source_node=otro_nodo, target_node=otro_nodo, option_key="opcion", text="Seguir", response_class="ACCEPTABLE")
    dialogos = [{"id": arbol.pk, "key": "saludo", "speakerName": "Cambio", "choices": [{"key": "seguir", "decisionOptionId": decision.pk}]}]
    respuesta = cliente.put(f"/api/authoring/cases/{version_id}/world", {"dialogues": dialogos}, format="json")
    assert respuesta.status_code == 404
    arbol.refresh_from_db()
    assert arbol.speaker_name == "Ana"
    assert not arbol.choices.exists()


def test_mundo_rechaza_estructuras_de_dialogo_invalidas(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    ruta = f"/api/authoring/cases/{version_id}/world"
    for dialogos in ("texto", [{"id": [], "key": "a"}], [{"key": "a", "lines": [{"order": 0}, {"order": 0}]}], [{"key": "a"}, {"key": "a"}]):
        assert cliente.put(ruta, {"dialogues": dialogos}, format="json").status_code == 400


def test_mundo_rechaza_marca_de_ia_invalida(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    dialogos = [{"key": "a", "lines": [{"order": 0, "aiSuggested": {"invalido": True}}]}]
    respuesta = cliente.put(f"/api/authoring/cases/{version_id}/world", {"dialogues": dialogos}, format="json")
    assert respuesta.status_code == 400
    assert respuesta.data["success"] is False

import json

import pytest

from apps.simulation.models import AuditLog, CaseVersion, Rubric, RubricCriterion, SimulationNode
from apps.simulation.models.world import MapObject, SceneMap
from apps.users.models import CustomUser
from .test_borrador import crear

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-22")]


def test_editor_expone_revision_y_colecciones(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    respuesta = cliente.get(f"/api/authoring/cases/{version_id}/editor")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["revision"] == 0
    assert respuesta.data["data"]["caseVersionId"] == version_id
    assert isinstance(respuesta.data["data"]["nodes"], list)


def test_checklist_controla_revision_y_borrador(cliente, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    ruta = f"/api/authoring/cases/{version_id}/checklist"
    respuesta = cliente.put(ruta, {"revision": 0, "contentOriginal": True}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["revision"] == 1
    assert cliente.put(ruta, {"revision": 0}, format="json").status_code == 409
    CaseVersion.objects.filter(pk=version_id).update(status="PUBLISHED")
    assert cliente.put(ruta, {"revision": 1}, format="json").status_code == 409


def test_plano_respeta_propiedad(cliente, usuarios):
    version_id = crear(cliente).data["data"]["versionId"]
    ruta = f"/api/authoring/cases/{version_id}/plan"
    assert cliente.get(ruta).status_code == 200
    cliente.force_authenticate(usuarios[1])
    assert cliente.get(ruta).status_code == 404
    cliente.force_authenticate(usuarios[2])
    assert cliente.get(ruta).status_code == 403


def test_revision_en_cabecera_y_casillas_persistidas(cliente, settings):
    settings.REVISION_REQUIRED = True
    settings.REVIEW_WORKFLOW_STRICT = False
    version_id = crear(cliente).data["data"]["versionId"]
    ruta = f"/api/authoring/cases/{version_id}/checklist"
    respuesta = cliente.put(ruta, {"contentOriginal": True, "ethicsReviewed": True, "safetyProtocols": True}, format="json", HTTP_X_CASE_REVISION="0")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["checklistCompletion"] == 50
    assert cliente.get(f"/api/authoring/cases/{version_id}/editor").data["data"]["checklist"]["items"][0]["fulfilled"] is True
    assert cliente.put(ruta, {}, format="json", HTTP_X_CASE_REVISION="0").data["code"] == "REVISION_CONFLICT"
    assert cliente.put(ruta, {}, format="json").data["code"] == "REVISION_REQUIRED"


def test_editor_incluye_rubrica_y_objetivo(cliente, usuarios):
    version_id = crear(cliente).data["data"]["versionId"]
    rubrica = Rubric.objects.create(case_version_id=version_id, name="Rúbrica", created_by=usuarios[0])
    RubricCriterion.objects.create(rubric=rubrica, competency="Escucha", title="Escucha activa", weight=1)
    datos = cliente.get(f"/api/authoring/cases/{version_id}/editor").data["data"]
    assert datos["nodes"][0]["goal"] == ""
    assert datos["rubrics"][0]["rubricName"] == "Rúbrica"
    assert datos["rubrics"][0]["criteria"][0]["title"] == "Escucha activa"


def test_plano_de_salas_por_piezas_y_puerta(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    inicio = SimulationNode.objects.get(case_version_id=version_id)
    destino = SimulationNode.objects.create(case_version_id=version_id, node_key="destino", title="Destino", narrative="Texto")
    mapa = SceneMap.objects.create(case_version_id=version_id, node=inicio, map_key="inicio", title="Inicio", width=960, structure={"ancho": 960})
    SceneMap.objects.create(case_version_id=version_id, node=destino, map_key="destino", title="Destino", width=960, structure={"ancho": 960})
    MapObject.objects.create(scene_map=mapa, object_key="puerta", label="Puerta", object_type="EXIT", metadata_json=json.dumps({"targetNodeKey": "destino", "muro": "derecha", "pos": 120}))
    datos = cliente.get(f"/api/authoring/cases/{version_id}/plan").data["data"]["plan"]
    assert [sala["key"] for sala in datos["rooms"]] == [inicio.node_key, "destino"]
    assert datos["doors"] == [{"key": "puerta", "from": inicio.node_key, "to": "destino", "wall": "derecha", "pos": 120}]
    assert datos["rooms"][1]["plan"]["x"] > datos["rooms"][0]["plan"]["x"]


def test_checklist_rechaza_casilla_no_booleana(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    respuesta = cliente.put(f"/api/authoring/cases/{version_id}/checklist", {"contentOriginal": "quizás"}, format="json")
    assert respuesta.status_code == 400
    assert respuesta.data["success"] is False


def test_permisos_para_editor_y_checklist(cliente, usuarios):
    version_id = crear(cliente).data["data"]["versionId"]
    for terminacion in ("editor", "plan"):
        ruta = f"/api/authoring/cases/{version_id}/{terminacion}"
        cliente.force_authenticate(usuarios[1])
        assert cliente.get(ruta).status_code == 404
        cliente.force_authenticate(usuarios[2])
        assert cliente.get(ruta).status_code == 403
    cliente.force_authenticate(usuarios[1])
    assert cliente.put(f"/api/authoring/cases/{version_id}/checklist", {}, format="json").status_code == 404
    cliente.force_authenticate(usuarios[2])
    assert cliente.put(f"/api/authoring/cases/{version_id}/checklist", {}, format="json").status_code == 403


def test_checklist_deja_auditoria_solo_si_se_guarda(cliente, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    ruta = f"/api/authoring/cases/{version_id}/checklist"
    assert cliente.put(ruta, {"revision": 0}, format="json").status_code == 200
    assert cliente.put(ruta, {"revision": 0}, format="json").status_code == 409
    assert AuditLog.objects.filter(action="ADMIN_CHECKLIST_UPDATE", resource_id=str(version_id)).count() == 1


def test_administrador_lee_y_edita_caso_ajeno(cliente, usuarios):
    version_id = crear(cliente).data["data"]["versionId"]
    administrador = CustomUser.objects.get(email="admin-autoria@example.test")
    cliente.force_authenticate(administrador)
    assert cliente.get(f"/api/authoring/cases/{version_id}/editor").status_code == 200
    assert cliente.put(f"/api/authoring/cases/{version_id}/checklist", {}, format="json").status_code == 200


def test_editor_no_mezcla_datos_de_otras_versiones(cliente):
    primera_id = crear(cliente, "PRIMERO").data["data"]["versionId"]
    segunda_id = crear(cliente, "SEGUNDO").data["data"]["versionId"]
    SceneMap.objects.create(case_version_id=segunda_id, node=SimulationNode.objects.get(case_version_id=segunda_id), map_key="ajeno", title="Ajeno")
    datos = cliente.get(f"/api/authoring/cases/{primera_id}/editor").data["data"]
    assert datos["maps"] == []
    assert datos["objects"] == []


def test_plano_sin_salas_por_piezas_es_nulo(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    assert cliente.get(f"/api/authoring/cases/{version_id}/plan").data == {"success": True, "data": {"plan": None}}

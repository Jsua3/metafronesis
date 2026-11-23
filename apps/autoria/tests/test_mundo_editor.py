from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, SimulationNode
from apps.simulation.models.world import CollisionZone, SceneMap
from .test_borrador import crear

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-22", "SIEP-23")]


def test_crear_mapa_devuelve_editor_con_revision(cliente, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    respuesta = cliente.post(
        f"/api/authoring/cases/{version_id}/maps",
        {"nodeId": nodo.pk, "mapKey": "sala", "title": "Sala", "revision": 0},
        format="json",
    )
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["revision"] == 1
    assert respuesta.data["data"]["maps"][0]["key"] == "sala"


def test_objetos_y_pistas_con_revision_y_propiedad(cliente, usuarios, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    ruta = f"/api/authoring/cases/{version_id}/maps/{mapa.pk}"
    objeto = {"objectKey": "mesa", "label": "Mesa", "objectType": "OBJECT", "revision": 0}
    respuesta = cliente.post(f"{ruta}/objects", objeto, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["objects"][0]["key"] == "mesa"
    assert cliente.post(f"{ruta}/hints", {"text": "Pista", "revision": 0}, format="json").data["code"] == "REVISION_CONFLICT"
    respuesta = cliente.post(f"{ruta}/hints", {"text": "Pista", "revision": 1}, format="json")
    assert respuesta.data["data"]["hints"][0]["text"] == "Pista"
    cliente.force_authenticate(usuarios[1])
    assert cliente.post(f"{ruta}/hints", {"text": "Pista", "revision": 2}, format="json").status_code == 404
    cliente.force_authenticate(usuarios[2])
    assert cliente.post(f"{ruta}/hints", {"text": "Pista", "revision": 2}, format="json").status_code == 403


def test_mapa_no_acepta_nodo_de_otra_version_ni_version_publicada(cliente):
    primera = crear(cliente, "PRIMERA").data["data"]["versionId"]
    segunda = crear(cliente, "SEGUNDA").data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=segunda)
    ruta = f"/api/authoring/cases/{primera}/maps"
    datos = {"nodeId": nodo.pk, "mapKey": "sala", "title": "Sala"}
    assert cliente.post(ruta, datos, format="json").status_code in (400, 404)
    CaseVersion.objects.filter(pk=primera).update(status="PUBLISHED")
    assert cliente.post(ruta, datos, format="json").data["code"] == "VERSION_NOT_EDITABLE"


def test_guardar_zonas_de_colision_reemplaza_lista(cliente, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    ruta = f"/api/authoring/cases/{version_id}/world?nodeId={nodo.pk}"
    respuesta = cliente.put(ruta, {"revision": 0, "collisionZones": [{"key": "pared", "x": 1, "y": 2, "width": 3, "height": 4}]}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["collisionZones"][0]["key"] == "pared"
    respuesta = cliente.put(ruta, {"revision": 1, "collisionZones": []}, format="json")
    assert respuesta.data["data"]["collisionZones"] == []


def test_mundo_rechaza_claves_repetidas_y_fondo_externo(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    ruta = f"/api/authoring/cases/{version_id}/world?nodeId={nodo.pk}"
    zonas = [{"key": "pared"}, {"key": "pared"}]
    assert cliente.put(ruta, {"collisionZones": zonas}, format="json").status_code == 400
    assert cliente.put(ruta, {"map": {"ambient": {"backgroundImage": "https://externo.test/fondo.png"}}}, format="json").status_code == 400


def test_mundo_informa_geometria_y_conserva_zona_por_clave(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala", width=100, height=100)
    ruta = f"/api/authoring/cases/{version_id}/world?nodeId={nodo.pk}"
    datos = {"collisionZones": [{"key": "pared", "x": 99, "y": 1, "width": 10, "height": 10}]}
    primera = cliente.put(ruta, datos, format="json").data["data"]
    assert primera["schemaVersion"] == 2
    assert any(error["code"] == "COLLISION_OUT_OF_BOUNDS" for error in primera["validation"]["errors"])
    segunda = cliente.put(ruta, datos, format="json").data["data"]
    assert primera["collisionZones"][0]["id"] == segunda["collisionZones"][0]["id"]


def test_mundo_contrato_y_edicion_de_objetos(cliente, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala", width=960, height=540)
    ruta = f"/api/authoring/cases/{version_id}/world?nodeId={nodo.pk}"
    objeto = {"id": 9000, "key": "mesa", "label": "Mesa", "type": "OBJECT", "x": 1, "y": 2, "width": 30, "height": 40, "zIndex": 3, "facing": "up", "metadata": {"detalle": "valor"}}
    respuesta = cliente.put(ruta, {"revision": 0, "objects": [objeto]}, format="json")
    assert respuesta.status_code == 200
    mundo = respuesta.data["data"]
    assert set(mundo) == {"schemaVersion", "caseVersionId", "revision", "nodeId", "map", "objects", "collisionZones", "dialogues", "clinicalTools", "safeExit", "validation", "availableDecisions", "rooms"}
    assert mundo["objects"][0]["metadata"] == {"detalle": "valor"}
    assert cliente.get(ruta).data["data"]["map"]["id"] == mapa.pk
    assert cliente.put(ruta, {"revision": 0, "objects": []}, format="json").status_code == 409
    assert cliente.put(ruta, {"revision": 1, "objects": []}, format="json").data["data"]["objects"] == []


def test_mundo_no_modifica_version_ajena_o_publicada(cliente, usuarios, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    ruta = f"/api/authoring/cases/{version_id}/world"
    cliente.force_authenticate(usuarios[1])
    assert cliente.put(ruta, {"revision": 0}, format="json").status_code == 404
    cliente.force_authenticate(usuarios[2])
    assert cliente.put(ruta, {"revision": 0}, format="json").status_code == 403
    cliente.force_authenticate(usuarios[0])
    CaseVersion.objects.filter(pk=version_id).update(status="PUBLISHED")
    assert cliente.put(ruta, {"revision": 0}, format="json").data["code"] == "VERSION_NOT_EDITABLE"


def test_sala_rechaza_valores_fuera_de_int4(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    ruta = f"/api/authoring/cases/{version_id}/maps"
    respuesta = cliente.post(ruta, {"nodeId": nodo.pk, "mapKey": "sala", "title": "Sala", "width": 2**40}, format="json")
    assert respuesta.status_code == 400


def test_estructura_de_sala_se_valida_y_persiste(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    ruta = f"/api/authoring/cases/{version_id}/world"
    assert cliente.put(ruta, {"map": {"structure": {"ancho": 960}}}, format="json").status_code == 400
    estructura = {"ancho": 960, "momento": "dia", "acabados": {"piso": "madera", "muro": "blanco", "paleta": "clara"}, "piezas": []}
    respuesta = cliente.put(ruta, {"map": {"structure": estructura}}, format="json")
    assert respuesta.status_code == 200
    mapa.refresh_from_db()
    assert mapa.structure == estructura


@pytest.mark.django_db(transaction=True)
def test_dos_guardados_con_la_misma_revision_no_se_pisan(cliente, usuarios, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    barrera = Barrier(2)

    def guardar(clave):
        close_old_connections()
        cliente_hilo = APIClient()
        cliente_hilo.force_authenticate(usuarios[0])
        barrera.wait()
        respuesta = cliente_hilo.put(f"/api/authoring/cases/{version_id}/world", {"revision": 0, "collisionZones": [{"key": clave}]}, format="json")
        close_old_connections()
        return respuesta.status_code

    with ThreadPoolExecutor(max_workers=2) as ejecutor:
        estados = list(ejecutor.map(guardar, ("primera", "segunda")))
    assert sorted(estados) == [200, 409]


def test_validacion_del_mundo_incluye_geometria_de_las_demas_salas(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala", width=960, height=540)
    otro_nodo = SimulationNode.objects.create(case_version_id=version_id, node_key="otra", title="Otra", narrative="")
    otra_sala = SceneMap.objects.create(case_version_id=version_id, node=otro_nodo, map_key="otra", title="Otra", width=100, height=100, spawn_x=101)
    respuesta = cliente.get(f"/api/authoring/cases/{version_id}/world?nodeId={nodo.pk}")
    errores = respuesta.data["data"]["validation"]["errors"]
    assert any(error["code"] == "SPAWN_OUT_OF_BOUNDS" and error["entityRef"] == f"map:{otra_sala.pk}" for error in errores)
    assert any(error["code"] == "NO_SAFE_EXIT" for error in errores)


def test_guardar_zonas_intercambia_claves_y_no_toca_otra_sala(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    otro_nodo = SimulationNode.objects.create(case_version_id=version_id, node_key="otra", title="Otra", narrative="")
    otro_mapa = SceneMap.objects.create(case_version_id=version_id, node=otro_nodo, map_key="otra", title="Otra")
    primera = CollisionZone.objects.create(scene_map=mapa, zone_key="primera")
    segunda = CollisionZone.objects.create(scene_map=mapa, zone_key="segunda")
    ajena = CollisionZone.objects.create(scene_map=otro_mapa, zone_key="ajena")
    ruta = f"/api/authoring/cases/{version_id}/world?nodeId={nodo.pk}"
    respuesta = cliente.put(ruta, {"collisionZones": [{"id": primera.pk, "key": "segunda"}, {"id": segunda.pk, "key": "primera"}, {"id": ajena.pk, "key": "nueva"}]}, format="json")
    assert respuesta.status_code == 200
    primera.refresh_from_db()
    segunda.refresh_from_db()
    ajena.refresh_from_db()
    assert (primera.zone_key, segunda.zone_key, ajena.zone_key) == ("segunda", "primera", "ajena")
    assert len(respuesta.data["data"]["collisionZones"]) == 3


@pytest.mark.parametrize("fondo", ["//externo.test/imagen", "http://externo.test/imagen", "/assets/%2e%2e/privado", "https://127.0.0.1/imagen", "https://externo.test:443/imagen"])
def test_fondos_no_permitidos_no_modifican_el_mundo(cliente, fondo):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    respuesta = cliente.put(f"/api/authoring/cases/{version_id}/world", {"map": {"ambient": {"backgroundImage": fondo}}, "collisionZones": [{"key": "pared"}]}, format="json")
    assert respuesta.status_code == 400
    assert not mapa.collision_zones.exists()


def test_validacion_del_mundo_incluye_grafo_y_salida_segura(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala", width=960, height=540)
    respuesta = cliente.get(f"/api/authoring/cases/{version_id}/world")
    codigos = {error["code"] for error in respuesta.data["data"]["validation"]["errors"]}
    assert {"NO_TERMINAL_NODE", "NODE_WITHOUT_OPTIONS", "NO_SAFE_EXIT"} <= codigos


def test_mundo_rechaza_dialogos_que_aun_no_puede_guardar(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    respuesta = cliente.put(f"/api/authoring/cases/{version_id}/world", {"dialogues": []}, format="json")
    assert respuesta.status_code == 400
    assert respuesta.data["success"] is False


def test_sala_por_piezas_recalcula_dimensiones_y_paredes(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    estructura = {"ancho": 1200, "momento": "dia", "acabados": {"piso": "madera", "muro": "blanco", "paleta": "clara"}, "piezas": []}
    respuesta = cliente.put(f"/api/authoring/cases/{version_id}/world", {"map": {"structure": estructura}}, format="json")
    assert respuesta.status_code == 200
    mapa.refresh_from_db()
    assert (mapa.width, mapa.height) == (1200, 528)
    assert set(mapa.collision_zones.values_list("zone_key", flat=True)) == {"pared-fondo", "pared-izquierda", "pared-derecha", "borde-delantero"}


def test_sala_por_piezas_tolera_metadatos_de_puerta_invalidos(cliente):
    version_id = crear(cliente).data["data"]["versionId"]
    nodo = SimulationNode.objects.get(case_version_id=version_id)
    mapa = SceneMap.objects.create(case_version_id=version_id, node=nodo, map_key="sala", title="Sala")
    estructura = {"ancho": 960, "momento": "dia", "acabados": {"piso": "madera", "muro": "blanco", "paleta": "clara"}, "piezas": []}
    objeto = {"key": "puerta", "label": "Puerta", "type": "EXIT", "metadata": {"muro": [], "targetNodeKey": []}}
    respuesta = cliente.put(f"/api/authoring/cases/{version_id}/world", {"map": {"structure": estructura, "ambient": {"encuadre": []}}, "objects": [objeto]}, format="json")
    assert respuesta.status_code == 200
    assert mapa.map_objects.count() == 1

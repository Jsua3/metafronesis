"""La compuerta juzga las salas por piezas (portadas de OCL-13, 14, 15 y 18 de v3) y no toca las de imagen fija."""
import copy
import json

import pytest

from apps.autoria import validacion_mundo
from apps.biblioteca.services import catalogo_piezas, lugares
from apps.simulation.models import CaseVersion, MapObject, SceneMap

LUGARES = ("casa", "comisaria", "universidad", "hospital")


@pytest.fixture(autouse=True)
def _sin_cache():
    catalogo_piezas.cargar_catalogo.cache_clear()
    yield
    catalogo_piezas.cargar_catalogo.cache_clear()


def _estructurales(version):
    return [e for e in validacion_mundo.validar(version)["errors"] if e["code"].startswith("STRUCTURE_")]


def _crear(cliente, lugar_id, salas, por_piezas=True):
    respuesta = cliente.post(
        "/api/authoring/cases",
        {"code": f"V-{lugar_id}-{len(salas)}", "title": "Validacion", "lugarId": lugar_id, "salas": salas, "porPiezas": por_piezas},
        format="json",
    )
    assert respuesta.status_code == 201, respuesta.data
    return CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])


@pytest.fixture
def hospital(cliente):
    return _crear(cliente, "hospital", [sala["id"] for sala in lugares.cargar_lugar("hospital")["salas"]])


def _mapa(version, sala):
    return SceneMap.objects.get(case_version=version, node__node_key=sala)


def _codigos(version):
    return {e["code"] for e in _estructurales(version)}


@pytest.mark.parametrize("lugar_id", LUGARES)
def test_los_lugares_reales_enteros_no_traen_errores_de_estructura(cliente, lugar_id):
    version = _crear(cliente, lugar_id, [sala["id"] for sala in lugares.cargar_lugar(lugar_id, por_piezas=True)["salas"]])
    assert _estructurales(version) == []


def test_una_sala_de_imagen_fija_no_se_juzga_por_estructura(cliente):
    version = _crear(cliente, "casa", [lugares.cargar_lugar("casa")["salas"][0]["id"]], por_piezas=False)
    assert _estructurales(version) == []


def test_una_pieza_fuera_del_catalogo_es_error(hospital):
    mapa = _mapa(hospital, "sala-espera")
    estructura = copy.deepcopy(mapa.structure)
    estructura["piezas"].append({"id": "x", "tipo": "ventana", "modelo": "inventada", "muro": "fondo", "pos": 100})
    estructura["acabados"]["piso"] = "lava"
    mapa.structure = estructura
    mapa.save()
    assert _codigos(hospital) == {"STRUCTURE_CATALOG"}


def test_una_pieza_que_se_sale_del_muro_es_error(hospital):
    mapa = _mapa(hospital, "sala-espera")
    estructura = copy.deepcopy(mapa.structure)
    estructura["piezas"][0]["pos"] = 5000
    mapa.structure = estructura
    mapa.save()
    errores = _estructurales(hospital)
    assert [e["code"] for e in errores] == ["STRUCTURE_WALL_FIT"] and errores[0]["entityRef"] == f"map:{mapa.pk}"


def test_dos_piezas_que_se_montan_son_error(hospital):
    mapa = _mapa(hospital, "sala-espera")
    estructura = copy.deepcopy(mapa.structure)
    estructura["piezas"].append(dict(estructura["piezas"][0], id="v2", pos=estructura["piezas"][0]["pos"] + 10))
    mapa.structure = estructura
    mapa.save()
    assert _codigos(hospital) == {"STRUCTURE_OVERLAP"}


def test_una_puerta_sin_regreso_es_error_salvo_sentido_unico(hospital):
    """Se le quita al pasillo toda puerta hacia la sala de espera: la puerta de la espera hacia el pasillo no tiene regreso."""
    for puerta in MapObject.objects.filter(scene_map=_mapa(hospital, "pasillo"), object_type="EXIT"):
        meta = json.loads(puerta.metadata_json)
        if meta["targetNodeKey"] in ("sala-espera", "entrada-urgencias"):
            puerta.delete()
    assert _codigos(hospital) == {"STRUCTURE_DOOR_RETURN"}
    for puerta in MapObject.objects.filter(scene_map__case_version=hospital, object_type="EXIT"):
        meta = json.loads(puerta.metadata_json)
        meta["sentidoUnico"] = True
        puerta.metadata_json = json.dumps(meta)
        puerta.save()
    assert _estructurales(hospital) == []


def test_sin_catalogo_no_se_puede_revisar_y_se_dice(hospital, settings, tmp_path):
    settings.BIBLIOTECA_PIEZAS_MANIFIESTO = str(tmp_path / "no-existe.json")
    assert _codigos(hospital) == {"STRUCTURE_CATALOG_UNAVAILABLE"}
    assert validacion_mundo.validar(hospital)["canPublish"] is False

"""Los lugares conservan el modo de imagen fija y pueden copiarse por piezas, con la estructura intacta.

La luz de la sala (ventanas, lámparas, momento del día) se calcula en el navegador desde ``estructura``: por eso la
copia, el editor y el mundo del juego tienen que devolverla igual que la plantilla.
"""
import json
from pathlib import Path

import pytest
from django.conf import settings

from apps.biblioteca.services import catalogo_piezas, lugares
from apps.simulation.models import CaseVersion, MapObject, SceneMap

CON_PLANTILLA = ("casa", "comisaria", "universidad")
TODOS = (*CON_PLANTILLA, "hospital")
CARPETA = Path(settings.BASE_DIR) / "biblioteca" / "escenarios"


@pytest.fixture(autouse=True)
def _sin_cache():
    catalogo_piezas.cargar_catalogo.cache_clear()
    yield
    catalogo_piezas.cargar_catalogo.cache_clear()


def _crear(cliente, lugar_id, salas, **extra):
    return cliente.post(
        "/api/authoring/cases",
        {"code": f"P-{lugar_id}-{len(salas)}", "title": "Caso de prueba", "lugarId": lugar_id, "salas": salas, **extra},
        format="json",
    )


def test_el_indice_incluye_el_hospital_y_la_api_lo_sirve(docente_con_permiso):
    _, cliente = docente_con_permiso
    ids = [lugar["id"] for lugar in cliente.get("/api/biblioteca/lugares").data["data"]]
    assert set(ids) == set(TODOS)
    respuesta = cliente.get("/api/biblioteca/lugares/hospital")
    assert respuesta.status_code == 200
    hospital = respuesta.data["data"]
    assert len(hospital["salas"]) == 8 and all(sala["estructura"] for sala in hospital["salas"])
    portadas = {lugar["id"]: lugar["portada"] for lugar in cliente.get("/api/biblioteca/lugares").data["data"]}
    assert portadas["hospital"] is None and portadas["casa"].startswith("/assets/biblioteca/escenarios/casa/")


@pytest.mark.parametrize("lugar_id", CON_PLANTILLA)
def test_cada_lugar_conserva_su_plantilla_fija_y_la_de_piezas(lugar_id):
    fijo, piezas = lugares.cargar_lugar(lugar_id), lugares.cargar_lugar(lugar_id, por_piezas=True)
    assert fijo["esquema"] == 2 and piezas["esquema"] == 3
    assert all("estructura" not in sala for sala in fijo["salas"])
    assert all(sala["estructura"] for sala in piezas["salas"])


def test_el_hospital_usa_el_archivo_habitual():
    assert lugares.cargar_lugar("hospital", por_piezas=True) == lugares.cargar_lugar("hospital")


@pytest.mark.parametrize("lugar_id", TODOS)
def test_la_estructura_llega_intacta_al_mapa_al_editor_y_al_juego(docente_con_permiso, lugar_id):
    docente, cliente = docente_con_permiso
    plantilla = lugares.cargar_lugar(lugar_id, por_piezas=True)
    salas = [sala["id"] for sala in plantilla["salas"]]
    respuesta = _crear(cliente, lugar_id, salas, porPiezas=True)
    assert respuesta.status_code == 201, respuesta.data
    version = CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])
    mapas = {m.node.node_key: m for m in SceneMap.objects.filter(case_version=version).select_related("node")}
    assert set(mapas) == set(salas)
    con_ventana = con_lampara = 0
    for sala in plantilla["salas"]:
        mapa = mapas[sala["id"]]
        # El mapa guarda la estructura de la plantilla, sin quitar ni renombrar un solo campo.
        assert mapa.structure == sala["estructura"], sala["id"]
        assert mapa.width == sala["estructura"]["ancho"]
        assert "backgroundImage" not in json.loads(mapa.ambient_json)
        tipos = {pieza["tipo"] for pieza in sala["estructura"]["piezas"]}
        con_ventana += "ventana" in tipos
        con_lampara += "lampara" in tipos
        # El editor la devuelve igual.
        editor = cliente.get(f"/api/authoring/cases/{version.pk}/world?nodeId={mapa.node_id}")
        assert editor.status_code == 200, editor.data
        assert editor.data["data"]["map"]["structure"] == sala["estructura"]
    assert con_ventana and con_lampara  # la prueba mira de verdad ventanas y lámparas
    # El mundo del juego (un ensayo, como el estudiante) devuelve la de la escena de inicio.
    inicio = next(m for m in mapas.values() if m.node.start_node)
    ensayo = cliente.post(f"/api/authoring/cases/{version.pk}/rehearsal", {}, format="json")
    assert ensayo.status_code == 201, ensayo.data
    datos = ensayo.data["data"]
    mundo = cliente.get(f"/api/simulation/attempts/{datos['attemptId']}/world")
    assert mundo.status_code == 200, mundo.data
    mapa_juego = mundo.data["data"]["map"]
    assert mapa_juego["structure"] == inicio.structure and mapa_juego["width"] == inicio.structure["ancho"]
    assert "backgroundImage" not in mapa_juego["ambient"]


@pytest.mark.parametrize("lugar_id", TODOS)
def test_las_puertas_de_muro_quedan_con_su_llegada_y_las_piezas_con_arte_de_piezas(docente_con_permiso, lugar_id):
    _, cliente = docente_con_permiso
    plantilla = lugares.cargar_lugar(lugar_id, por_piezas=True)
    respuesta = _crear(cliente, lugar_id, [sala["id"] for sala in plantilla["salas"]], porPiezas=True)
    assert respuesta.status_code == 201, respuesta.data
    version = CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])
    puertas = list(MapObject.objects.filter(scene_map__case_version=version, object_type="EXIT"))
    assert puertas
    for puerta in puertas:
        meta = json.loads(puerta.metadata_json)
        assert meta["muro"] in ("fondo", "izquierda", "derecha", "camara") and isinstance(meta["pos"], int)
        assert "pintada" not in meta and "entryX" in meta and "entryY" in meta
    artes = [json.loads(m.metadata_json)["arte"] for m in MapObject.objects.filter(scene_map__case_version=version, object_type="PROP")]
    assert all(arte.startswith(("/assets/biblioteca/piezas/", f"/assets/biblioteca/escenarios/{lugar_id}/arte/")) for arte in artes)
    if lugar_id == "hospital":  # el hospital solo usa el catalogo de piezas
        assert artes and all(arte.startswith("/assets/biblioteca/piezas/") for arte in artes)


@pytest.mark.parametrize("lugar_id", TODOS)
def test_la_estructura_de_cada_sala_es_valida_para_el_editor(lugar_id):
    """Lo que el editor acepta al guardar el mapa: si la copia fuera inválida, no podría volver a guardarse."""
    from apps.autoria import mundo

    esquema = mundo._esquema_estructura()
    for sala in lugares.cargar_lugar(lugar_id, por_piezas=True)["salas"]:
        assert esquema.is_valid(sala["estructura"]), sala["id"]


def test_los_ids_de_las_piezas_son_unicos_en_cada_sala():
    for lugar_id in TODOS:
        for sala in lugares.cargar_lugar(lugar_id, por_piezas=True)["salas"]:
            ids = [pieza["id"] for pieza in sala["estructura"]["piezas"]]
            assert len(ids) == len(set(ids)), (lugar_id, sala["id"])


def test_crear_sin_opcion_conserva_imagen_fija(docente_con_permiso):
    _, cliente = docente_con_permiso
    sala = lugares.cargar_lugar("casa")["salas"][0]["id"]
    respuesta = _crear(cliente, "casa", [sala])
    assert respuesta.status_code == 201, respuesta.data
    mapa = SceneMap.objects.get(case_version_id=respuesta.data["data"]["versionId"])
    assert mapa.structure is None
    assert json.loads(mapa.ambient_json)["backgroundImage"].startswith("/assets/biblioteca/escenarios/casa/")


def test_un_lugar_sin_plantilla_por_piezas_se_copia_de_imagen_fija_aunque_se_pida(docente_con_permiso, tmp_path, settings):
    carpeta = tmp_path / "biblioteca" / "escenarios"
    for nombre in ("casa",):
        (carpeta / nombre).mkdir(parents=True)
        (carpeta / nombre / "escenario.json").write_text(
            (CARPETA / nombre / "escenario.json").read_text(encoding="utf-8"), encoding="utf-8",
        )
    (carpeta / "indice.json").write_text(json.dumps({"esquema": 1, "lugares": [{"id": "casa", "nombre": "Casa"}]}), encoding="utf-8")
    settings.BIBLIOTECA_DIR = tmp_path / "biblioteca"
    _, cliente = docente_con_permiso
    sala = lugares.cargar_lugar("casa")["salas"][0]["id"]
    respuesta = _crear(cliente, "casa", [sala], porPiezas=True)
    assert respuesta.status_code == 201, respuesta.data
    assert SceneMap.objects.get(case_version_id=respuesta.data["data"]["versionId"]).structure is None

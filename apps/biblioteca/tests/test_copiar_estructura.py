"""Copiar al caso una sala armada por piezas (contrato x-siep 2.2, secciones 1.5, 3 y 7-8).

El lugar de prueba es el hospital de los ejemplos del contrato: entrada de urgencias (1200), sala de espera (1440) y
pasillo (1680). La copia guarda la ``estructura``, fija el ancho, levanta las paredes de ese ancho y calcula el umbral y la
llegada de cada puerta a partir de ``muro`` y ``pos``.
"""
import copy
import json

import pytest

from apps.autoria import geometria_salas
from apps.biblioteca.services import lugares
from apps.simulation.models import CaseVersion, CollisionZone, MapObject, SceneMap

ESPERA = {
    "ancho": 1440, "momento": "noche",
    "acabados": {"piso": "vinilo", "variante": "a", "muro": "zocalo-alto", "paleta": "hospital"},
    "piezas": [
        {"id": "v1", "tipo": "ventana", "modelo": "alta", "muro": "fondo", "pos": 520},
        {"id": "l1", "tipo": "lampara", "modelo": "tubo", "muro": "fondo", "pos": 720},
        {"id": "lp", "tipo": "lampara", "modelo": "pie", "x": 1180, "y": 300},
    ],
}
PASILLO = {
    "ancho": 1680, "momento": "noche",
    "acabados": {"piso": "vinilo", "variante": "b", "muro": "pintura", "paleta": "hospital"},
    "piezas": [{"id": "t1", "tipo": "lampara", "modelo": "tubo", "muro": "fondo", "pos": 320}],
}
ENTRADA = {
    "ancho": 1200, "momento": "noche",
    "acabados": {"piso": "baldosa", "muro": "azulejo", "paleta": "hospital"},
    "piezas": [],
}


def _sala(id_, nombre, estructura, entrada, puertas, personajes=()):
    return {
        "id": id_, "nombre": nombre, "descripcion": f"{nombre} del hospital.", "encuadre": "tres-paredes",
        "estructura": estructura, "entrada": entrada, "muebles": [], "objetos": [], "personajes": list(personajes),
        "puertas": puertas,
    }


HOSPITAL = {
    "esquema": 3, "id": "hospital", "nombre": "Hospital", "descripcion": "Urgencias de un hospital.",
    "temas": ["violencia-genero"], "completo": True, "arteProvisional": False, "nivelRiesgoPorDefecto": "SEVERE",
    "hitos": [], "recorridosSugeridos": [],
    "catalogo": {"muebles": [], "objetos": [], "herramientas": []},
    "personajes": [{"id": "abuela", "nombre": "Abuela", "rol": "Familiar", "recipeId": "abuela-1"}],
    "salas": [
        _sala("entrada-urgencias", "Entrada de urgencias", ENTRADA, [600, 440], [
            {"id": "a-espera", "hacia": "sala-espera", "muro": "fondo", "pos": 485, "modelo": "corrediza",
             "etiqueta": "Pasar a la sala de espera", "par": "a-entrada"},
            {"id": "a-pasillo", "hacia": "pasillo", "muro": "izquierda", "pos": 160, "modelo": "urgencias",
             "etiqueta": "Pasar al pasillo", "par": "a-entrada"},
        ]),
        _sala("sala-espera", "Sala de espera", ESPERA, {"x": 720, "y": 440}, [
            {"id": "a-pasillo", "hacia": "pasillo", "muro": "izquierda", "pos": 176, "modelo": "madera",
             "etiqueta": "Pasar al pasillo", "par": "a-sala-espera"},
            {"id": "a-triaje", "hacia": "triaje", "muro": "fondo", "pos": 1136, "modelo": "vidrio", "etiqueta": "Pasar a triaje"},
            {"id": "a-entrada", "hacia": "entrada-urgencias", "muro": "camara", "pos": 584, "modelo": "corrediza",
             "etiqueta": "Volver a la entrada de urgencias"},
        ], personajes=[{"ref": "abuela", "x": 560, "y": 340, "mirando": "abajo-derecha", "expresion": "triste"}]),
        _sala("pasillo", "Pasillo", PASILLO, {"x": 840, "y": 400}, [
            {"id": "a-entrada", "hacia": "entrada-urgencias", "muro": "izquierda", "pos": 160, "modelo": "urgencias",
             "etiqueta": "Volver a urgencias"},
            {"id": "a-sala-espera", "hacia": "sala-espera", "muro": "derecha", "pos": 160, "modelo": "vidrio",
             "etiqueta": "Pasar a la sala de espera", "par": "a-pasillo"},
            {"id": "a-servicio", "hacia": "entrada-urgencias", "muro": "camara", "pos": 1032, "modelo": "paso",
             "etiqueta": "Salida de servicio", "sentidoUnico": True},
        ]),
    ],
}
SALAS = ["entrada-urgencias", "sala-espera", "pasillo"]


@pytest.fixture
def biblioteca(tmp_path, settings):
    carpeta = tmp_path / "biblioteca" / "escenarios"
    (carpeta / "hospital").mkdir(parents=True)
    (carpeta / "indice.json").write_text(json.dumps({"esquema": 1, "lugares": [
        {"id": "hospital", "nombre": "Hospital", "salas": 3, "completo": True, "arteProvisional": False,
         "temas": ["violencia-genero"], "hitos": 0},
    ]}), encoding="utf-8")
    (carpeta / "hospital" / "escenario.json").write_text(json.dumps(HOSPITAL), encoding="utf-8")
    settings.BIBLIOTECA_DIR = tmp_path / "biblioteca"
    return carpeta


@pytest.fixture
def version(docente_con_permiso, biblioteca):
    _, cliente = docente_con_permiso
    respuesta = cliente.post(
        "/api/authoring/cases",
        {"code": "HOSP-PIEZAS", "title": "Hospital por piezas", "lugarId": "hospital", "salas": SALAS, "porPiezas": True},
        format="json",
    )
    assert respuesta.status_code == 201, respuesta.data
    return CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])


def test_rechaza_codigo_de_herramienta_con_arroba(docente_con_permiso, biblioteca):
    _, cliente = docente_con_permiso
    lugar = copy.deepcopy(HOSPITAL)
    lugar["catalogo"]["herramientas"] = [{"id": "pap@gloria", "nombre": "PAP"}]
    (biblioteca / "hospital" / "escenario.json").write_text(json.dumps(lugar), encoding="utf-8")
    respuesta = cliente.post(
        "/api/authoring/cases",
        {"code": "HOSP-ARROBA", "title": "Hospital", "lugarId": "hospital", "salas": SALAS, "porPiezas": True},
        format="json",
    )
    assert respuesta.status_code == 400, respuesta.content
    assert "'@' está reservado" in respuesta.json()["message"]
    assert not CaseVersion.objects.filter(simulation_case__code="HOSP-ARROBA").exists()


def _mapa(version, sala):
    return SceneMap.objects.get(case_version=version, node__node_key=sala)


def _puertas(version, sala):
    return {
        o.object_key: o
        for o in MapObject.objects.filter(scene_map__case_version=version, scene_map__node__node_key=sala, object_type="EXIT")
    }


def test_el_mapa_guarda_la_estructura_y_el_ancho(version):
    mapa = _mapa(version, "sala-espera")
    assert (mapa.width, mapa.height) == (1440, 528)
    assert mapa.structure == ESPERA
    ambiente = json.loads(mapa.ambient_json)
    assert "backgroundImage" not in ambiente
    assert ambiente == {"encuadre": "tres-paredes", "salaId": "sala-espera", "lugarId": "hospital"}
    assert (mapa.spawn_x, mapa.spawn_y) == (720, 440)
    assert (_mapa(version, "entrada-urgencias").spawn_x, _mapa(version, "entrada-urgencias").spawn_y) == (600, 440)


def test_las_paredes_son_las_del_ancho(version):
    zonas = {
        z.zone_key: (z.position_x, z.position_y, z.width, z.height)
        for z in CollisionZone.objects.filter(scene_map=_mapa(version, "sala-espera"))
    }
    assert zonas == {
        "pared-fondo": (0, 0, 1440, 236), "pared-izquierda": (0, 236, 134, 250),
        "pared-derecha": (1306, 236, 134, 250), "borde-delantero": (0, 486, 1440, 42),
    }


def _resumen(puerta):
    meta = json.loads(puerta.metadata_json)
    return (puerta.position_x, puerta.position_y, meta["entryX"], meta["entryY"])


def test_umbral_y_llegada_de_cada_puerta_salen_de_muro_y_pos(version):
    espera, pasillo, entrada = _puertas(version, "sala-espera"), _puertas(version, "pasillo"), _puertas(version, "entrada-urgencias")
    assert set(espera) == {"a-pasillo", "a-entrada"}  # la de triaje lleva a una sala no elegida
    assert _resumen(espera["a-pasillo"]) == (150, 406, 1511, 390)
    assert _resumen(espera["a-entrada"]) == (718, 476, 600, 260)
    assert _resumen(pasillo["a-sala-espera"]) == (1511, 390, 150, 406)
    assert _resumen(pasillo["a-entrada"]) == (169, 390, 131, 390)
    assert _resumen(pasillo["a-servicio"]) == (1250, 476, 131, 390)
    assert _resumen(entrada["a-espera"]) == (600, 260, 718, 476)
    assert _resumen(entrada["a-pasillo"]) == (131, 390, 169, 390)


def test_la_puerta_lleva_muro_pos_modelo_y_par_sin_pintada(version):
    meta = json.loads(_puertas(version, "pasillo")["a-sala-espera"].metadata_json)
    assert meta == {
        "targetNodeKey": "sala-espera", "entryX": 150, "entryY": 406,
        "muro": "derecha", "pos": 160, "modelo": "vidrio", "par": "a-pasillo",
    }
    servicio = json.loads(_puertas(version, "pasillo")["a-servicio"].metadata_json)
    assert servicio["sentidoUnico"] is True and "par" not in servicio
    puerta = _puertas(version, "pasillo")["a-sala-espera"]
    assert (puerta.width, puerta.height, puerta.interaction_prompt) == (24, 40, "Pasar a la sala de espera")


def test_la_persona_mira_en_diagonal(version):
    persona = MapObject.objects.get(scene_map=_mapa(version, "sala-espera"), object_type="PERSON")
    assert persona.facing == "down-right"


def test_recalcular_es_idempotente(version):
    antes = {k: _resumen(v) for k, v in _puertas(version, "pasillo").items()}
    geometria_salas.recalcular(version)
    assert {k: _resumen(v) for k, v in _puertas(version, "pasillo").items()} == antes
    assert CollisionZone.objects.filter(scene_map=_mapa(version, "pasillo")).count() == 4


def test_recalcular_corrige_lo_que_se_haya_movido_a_mano(version):
    puerta = _puertas(version, "sala-espera")["a-pasillo"]
    puerta.position_x, puerta.position_y = 5, 5
    meta = json.loads(puerta.metadata_json)
    meta.update(entryX=1, entryY=1)
    puerta.metadata_json = json.dumps(meta)
    puerta.save()
    mapa = _mapa(version, "sala-espera")
    mapa.width = 960
    mapa.save()
    geometria_salas.recalcular(version)
    assert _resumen(_puertas(version, "sala-espera")["a-pasillo"]) == (150, 406, 1511, 390)
    assert _mapa(version, "sala-espera").width == 1440


def test_un_lugar_por_piezas_se_lista_sin_portada(biblioteca):
    (resumen,) = lugares.listar_lugares()
    assert resumen["id"] == "hospital" and resumen["portada"] is None
    publico = lugares.lugar_publico(lugares.cargar_lugar("hospital"))
    assert publico["salas"][1]["estructura"] == ESPERA and "fondo" not in publico["salas"][1]


def test_la_biblioteca_no_cambia_al_copiar(version, biblioteca):
    assert json.loads((biblioteca / "hospital" / "escenario.json").read_text(encoding="utf-8")) == copy.deepcopy(HOSPITAL)


def test_sin_por_piezas_un_lugar_con_estructura_no_la_copia_como_imagen_fija_rota(docente_con_permiso, biblioteca):
    """El hospital solo existe por piezas: se copie con o sin la opción, sus salas llevan estructura."""
    _, cliente = docente_con_permiso
    respuesta = cliente.post(
        "/api/authoring/cases", {"code": "HOSP-2", "title": "Hospital", "lugarId": "hospital", "salas": SALAS}, format="json",
    )
    assert respuesta.status_code == 201, respuesta.data
    mapa = SceneMap.objects.get(case_version_id=respuesta.data["data"]["versionId"], node__node_key="sala-espera")
    assert mapa.structure == ESPERA

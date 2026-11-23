"""Contrato del traductor del documento del caso insignia."""

import json
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from apps.simulation.casedef.insignia import descongelar, traducir


RUTA_DOCUMENTO = Path(__file__).parents[1] / "data/casos/SIM-VBG-002.dsl.json"
pytestmark = pytest.mark.req("RF-07", "RF-11", "RF-17", "RF-19", "RF-21")


@pytest.fixture
def documento():
    return json.loads(RUTA_DOCUMENTO.read_text(encoding="utf-8"))


def test_traduce_el_documento_real_sin_perder_elementos(documento):
    plan = traducir(documento)
    escenas = documento["x-siep"]["escenas"]
    mapas = [escena["mapa"] for escena in escenas]
    assert len(plan.nodos) == len(escenas) == 18
    assert len(plan.opciones) == sum(len(escena["opciones"]) for escena in escenas) == 49
    assert len(plan.salas) == len(mapas) == 18
    assert len(plan.objetos) == sum(len(mapa["objetos"]) for mapa in mapas) == 223
    assert len(plan.zonas) == sum(len(mapa["colisiones"]) for mapa in mapas) == 191
    assert len(plan.dialogos) == sum(len(mapa["dialogos"]) for mapa in mapas) == 64
    assert len(plan.comentarios) == 63
    assert len(plan.personajes) == 13
    assert len(plan.herramientas) == 5
    assert not plan.no_soportado
    assert plan.nodos[0].datos["goal"] == escenas[0].get("objetivo", "")


def test_conserva_referencias_condiciones_y_reacciones(documento):
    plan = traducir(documento)
    opcion = plan.opciones[0]
    original = documento["x-siep"]["escenas"][0]["opciones"][0]
    assert opcion.origen == "c1-entrada"
    assert opcion.destino == "c1-sala-espera"
    assert opcion.datos["requires_json"] == original.get("requiere", {})
    assert opcion.datos["reaction_json"] == original["reaccion"]
    assert descongelar(plan.salas[0].datos["structure"]) == documento["x-siep"]["escenas"][0]["mapa"]["estructura"]


def test_conserva_retroalimentacion_y_clasificacion_de_cada_opcion(documento):
    plan = traducir(documento)
    fuentes = {
        opcion["clave"]: opcion
        for escena in documento["x-siep"]["escenas"]
        for opcion in escena["opciones"]
    }
    for opcion in plan.opciones:
        fuente = fuentes[opcion.clave]
        assert opcion.datos["immediate_feedback"] == fuente["retroalimentacionInmediata"]
        assert opcion.datos["response_class"] == fuente["clase"]


def test_pregunta_derivada_no_se_confunde_con_pregunta_de_autor(documento):
    plan = traducir(documento)
    assert all(not nodo.datos["decision_prompt"] for nodo in plan.nodos)
    documento["escenas"][0]["decision"]["pregunta"] = "¿Qué se debe hacer?"
    assert traducir(documento).nodos[0].datos["decision_prompt"] == "¿Qué se debe hacer?"


def test_informa_campos_desconocidos_y_el_plan_es_inmutable(documento):
    documento["x-siep"]["escenas"][0]["mapa"]["objetos"][0]["novedad"] = True
    plan = traducir(documento)
    assert any("x-siep.escenas[0].mapa.objetos[0].novedad" in aviso for aviso in plan.no_soportado)
    with pytest.raises(FrozenInstanceError):
        plan.nodos = ()
    with pytest.raises(TypeError):
        plan.objetos[0].datos["label"] = "Otro"
    with pytest.raises(TypeError):
        plan.salas[0].datos["structure"]["piezas"][0]["tipo"] = "Otro"


def test_senala_requisitos_y_reglas_desconocidos_sin_modificar_el_documento(documento):
    documento["x-siep"]["escenas"][0]["opciones"][0]["requiere"] = {"desconocido": "valor"}
    documento["x-siep"]["reglas"]["reglaNueva"] = True
    copia = json.dumps(documento, ensure_ascii=False, sort_keys=True)
    plan = traducir(documento)
    assert any("x-siep.escenas[0].opciones[0].requiere" in aviso for aviso in plan.no_soportado)
    assert any("x-siep.reglas.reglaNueva" in aviso for aviso in plan.no_soportado)
    assert json.dumps(documento, ensure_ascii=False, sort_keys=True) == copia

"""S3-4 · Las funciones puras que limpian el texto de la persona sin tocar lo demás (RNF-003).

``limpiar_json`` recibe el texto JSON de una columna y devuelve el texto limpio; si no hay nada que limpiar (o no es JSON) devuelve
el MISMO texto: así repetir la supresión no reescribe nada. Aquí se prueban sin base de datos, con entradas hostiles incluidas.
"""
import json
import secrets

import pytest

from apps.privacy import data_subject
from apps.privacy.data_subject import (
    DETALLE_SALIDA_SEGURA,
    _contexto_sin_texto_libre,
    _informe_sin_el_motivo_de_la_salida_segura,
    apellido_seudonimo,
    correo_seudonimo,
    nombre_completo_seudonimo,
)

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security]


def _informe(*entradas, **resto):
    return json.dumps({"schemaVersion": 1, "timeline": list(entradas), **resto}, ensure_ascii=False)


def _entrada(tipo, etiqueta, **resto):
    return {"type": tipo, "label": etiqueta, "atSeconds": 3, **resto}


# ── El contexto de la auditoría ──────────────────────────────────────────────────────────────────────────────────


def test_el_contexto_pierde_la_pregunta_libre_y_conserva_lo_demas():
    pregunta = f"Pregunta {secrets.token_hex(6)} con tildes áéí"
    texto = json.dumps({"taxonomy": "asistente.consultar", "question": pregunta, "question_length": 30, "node": 4})

    limpio = _contexto_sin_texto_libre(texto)

    assert json.loads(limpio) == {"taxonomy": "asistente.consultar", "question_length": 30, "node": 4}
    assert pregunta not in limpio


@pytest.mark.parametrize(
    "texto",
    [
        json.dumps({"taxonomy": "intento.iniciar", "method": "start_attempt"}),
        "{}",
        "esto no es json",
        "",
        "[1, 2, 3]",
        '"question"',
        "null",
        json.dumps({"nested": {"question": "no es de primer nivel"}}),
    ],
    ids=["sin pregunta", "vacio", "no es json", "cadena vacia", "lista", "cadena json", "null", "anidada"],
)
def test_un_contexto_sin_pregunta_o_que_no_es_un_objeto_queda_exactamente_igual(texto):
    assert _contexto_sin_texto_libre(texto) == texto


def test_limpiar_el_contexto_dos_veces_es_igual_que_una():
    texto = json.dumps({"question": "texto libre", "taxonomy": "asistente.consultar"})
    una = _contexto_sin_texto_libre(texto)

    assert _contexto_sin_texto_libre(una) == una


# ── El informe congelado ─────────────────────────────────────────────────────────────────────────────────────────


def test_el_informe_pierde_el_motivo_de_la_salida_segura_y_conserva_el_resto():
    motivo = f"Necesito pausar {secrets.token_hex(6)}"
    texto = _informe(
        _entrada("DECISION_SELECTED", "Una opción del caso", classification="ADEQUATE"),
        _entrada("SAFE_EXIT_REQUESTED", motivo),
        _entrada("TOOL_USED", "Herramienta usada"),
        counts={"adequate": 1},
    )

    limpio = _informe_sin_el_motivo_de_la_salida_segura(texto)

    assert motivo not in limpio
    esperado = json.loads(texto)
    esperado["timeline"][1]["label"] = DETALLE_SALIDA_SEGURA
    assert json.loads(limpio) == esperado


def test_limpiar_el_informe_dos_veces_es_igual_que_una_y_sin_motivo_no_reescribe():
    sin_motivo = _informe(_entrada("SAFE_EXIT_REQUESTED", DETALLE_SALIDA_SEGURA), _entrada("TOOL_USED", "x"))
    con_motivo = _informe(_entrada("SAFE_EXIT_REQUESTED", "un motivo"))

    una = _informe_sin_el_motivo_de_la_salida_segura(con_motivo)

    assert _informe_sin_el_motivo_de_la_salida_segura(una) == una
    assert _informe_sin_el_motivo_de_la_salida_segura(sin_motivo) == sin_motivo


@pytest.mark.parametrize(
    "texto",
    [
        "no es json",
        "",
        "[]",
        "null",
        json.dumps({"timeline": "no es una lista"}),
        json.dumps({"sin_linea_de_tiempo": True}),
        json.dumps({"timeline": [None, 3, "texto", ["SAFE_EXIT_REQUESTED"], {"type": "SAFE_EXIT_REQUESTED", "label": DETALLE_SALIDA_SEGURA}]}),
        json.dumps({"timeline": [{"type": "TOOL_USED", "label": "un texto que no es salida segura"}]}),
    ],
    ids=["no es json", "vacio", "lista", "null", "timeline no es lista", "sin timeline", "entradas raras", "otro tipo de evento"],
)
def test_un_informe_sin_motivo_o_malformado_queda_exactamente_igual(texto):
    assert _informe_sin_el_motivo_de_la_salida_segura(texto) == texto


def test_una_entrada_de_salida_segura_sin_etiqueta_recibe_el_texto_de_siempre():
    texto = json.dumps({"timeline": [{"type": "SAFE_EXIT_REQUESTED"}]})

    assert json.loads(_informe_sin_el_motivo_de_la_salida_segura(texto))["timeline"][0]["label"] == DETALLE_SALIDA_SEGURA


# ── Los seudónimos ───────────────────────────────────────────────────────────────────────────────────────────────


def test_los_seudonimos_son_estables_y_no_parecen_un_correo_real():
    assert correo_seudonimo(12) == "eliminada-12@invalid" == correo_seudonimo("12")
    assert apellido_seudonimo(12) == "eliminada-12"
    assert nombre_completo_seudonimo(12) == "Cuenta eliminada-12"
    assert correo_seudonimo(12) != correo_seudonimo(13)
    assert correo_seudonimo(12).endswith("@invalid") and "." not in correo_seudonimo(12).split("@")[1]


def test_el_sufijo_y_el_detalle_del_sistema_son_los_del_servidor():
    assert data_subject.SUFIJO_DE_OVERRIDE == " | Override de evidencia: "
    assert data_subject.DETALLE_SALIDA_SEGURA == "Salida segura solicitada"

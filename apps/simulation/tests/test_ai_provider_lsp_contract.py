"""L-01 — Principio de sustitución de Liskov sobre los proveedores de IA.

La vista elige un proveedor por nombre y lo usa sin saber cuál es: pide
``complete(system, question)`` y espera un texto. Esa confianza solo es legítima si **todo**
proveedor registrado cumple el mismo contrato, no solo el que se probó primero. Esta suite
recorre ``PROVIDERS``: un proveedor nuevo que se registre entra solo y tiene que pasarla.

Lo propio de cada API (la URL, las cabeceras, la forma del cuerpo) lo fijan
``test_ai_provider_contract.py`` y ``test_ai_providers_strategy.py``; aquí solo está lo que
tienen que cumplir **todos**.
"""
import inspect
import json

import pytest

from apps.simulation.services import ai_providers
from apps.simulation.services.ai_providers import MAX_TOKENS, PROVIDERS, AIProvider

API_KEY = "sk-clave-secreta-de-prueba"
MODEL = "modelo-de-prueba"
SYSTEM = "Eres un asistente de práctica clínica. Contexto: caso de prueba."
QUESTION = "¿Qué debería observar antes de decidir?"

#: Una respuesta que contiene el texto en la forma de cada API conocida. Un proveedor nuevo con
#: otra forma obliga a sumar aquí la suya: es el precio de que la suite sea la misma para todos.
KNOWN_REPLY = {
    "choices": [{"message": {"content": "  hola  "}}],
    "content": [{"text": "  hola  "}],
}

#: Respuestas vacías o incompletas, en la forma de cada API: ninguna debe romper ni dar `None`.
EMPTY_REPLIES = [
    {},
    {"unknown": 1},
    {"choices": []},
    {"choices": [{}]},
    {"choices": [{"message": {}}]},
    {"content": []},
    {"content": [{}]},
]


@pytest.fixture
def transport(monkeypatch):
    """Sustituye el transporte HTTP: anota cada llamada y devuelve la respuesta configurada."""
    state = {"calls": [], "reply": KNOWN_REPLY}

    def fake_post_json(url, payload, headers):
        state["calls"].append({"url": url, "payload": payload, "headers": headers})
        reply = state["reply"]
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(ai_providers, "post_json", fake_post_json)
    return state


NAMES = sorted(PROVIDERS)


def _provider(name):
    return PROVIDERS[name](API_KEY, MODEL)


def test_el_registro_no_esta_vacio_y_sus_nombres_son_minusculas():
    assert NAMES, "no hay proveedores registrados"
    for name in NAMES:
        assert name == name.lower() and name.strip() == name


@pytest.mark.parametrize("name", NAMES)
class TestCadaProveedorCumpleElContrato:
    def test_es_una_estrategia_concreta(self, name):
        cls = PROVIDERS[name]

        assert issubclass(cls, AIProvider)
        assert not inspect.isabstract(cls)

    def test_se_construye_con_clave_y_modelo(self, name):
        provider = _provider(name)

        assert (provider.api_key, provider.model) == (API_KEY, MODEL)

    def test_devuelve_el_texto_de_la_respuesta_recortado(self, name, transport):
        text = _provider(name).complete(SYSTEM, QUESTION)

        assert text == "hola"
        assert isinstance(text, str)

    def test_usa_el_transporte_una_vez_con_url_cuerpo_y_cabeceras(self, name, transport):
        _provider(name).complete(SYSTEM, QUESTION)

        (call,) = transport["calls"]
        assert isinstance(call["url"], str) and call["url"].startswith("https://")
        assert isinstance(call["payload"], dict)
        assert isinstance(call["headers"], dict) and call["headers"]

    def test_manda_el_modelo_el_limite_de_tokens_y_los_dos_textos(self, name, transport):
        _provider(name).complete(SYSTEM, QUESTION)

        (call,) = transport["calls"]
        assert call["payload"]["model"] == MODEL
        assert call["payload"]["max_tokens"] == MAX_TOKENS
        body = json.dumps(call["payload"], ensure_ascii=False)
        assert SYSTEM in body
        assert QUESTION in body

    def test_la_clave_viaja_en_las_cabeceras_y_en_ningun_otro_sitio(self, name, transport):
        _provider(name).complete(SYSTEM, QUESTION)

        (call,) = transport["calls"]
        assert any(API_KEY in str(value) for value in call["headers"].values())
        assert API_KEY not in call["url"]
        assert API_KEY not in json.dumps(call["payload"], ensure_ascii=False)

    @pytest.mark.parametrize("reply", EMPTY_REPLIES, ids=lambda r: json.dumps(r))
    def test_una_respuesta_vacia_o_incompleta_da_cadena_vacia(self, name, transport, reply):
        transport["reply"] = reply

        text = _provider(name).complete(SYSTEM, QUESTION)

        assert text == ""

    def test_el_error_del_transporte_no_se_traga_ni_se_cambia(self, name, transport):
        transport["reply"] = RuntimeError("provider returned 500: boom")

        with pytest.raises(RuntimeError, match="provider returned 500"):
            _provider(name).complete(SYSTEM, QUESTION)

    def test_no_guarda_estado_entre_llamadas(self, name, transport):
        provider = _provider(name)

        first = provider.complete(SYSTEM, QUESTION)
        second = provider.complete(SYSTEM, QUESTION)

        assert first == second == "hola"
        assert len(transport["calls"]) == 2
        assert transport["calls"][0] == transport["calls"][1]

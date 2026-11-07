"""Topes del registro de CSP (revisión independiente, hallazgo 13): lo que una sola petición puede hacer contar.

Cada informe deja UNA línea ``csp_violation``. Estas pruebas fijan que una petición no la puede inflar: ``blocked`` se
corta a 255 caracteres, y un ``Content-Length`` que no es solo dígitos ASCII, o que ``int()`` no convierte, nunca lleva
a un 500. La vista lo responde 411 o 413 (``_leer_cuerpo``, probada directamente) y la cadena lo rechaza antes, con
400 (``BodyLimitMiddleware``, probado de extremo a extremo). El tope de tres informes por petición está en
``test_csp_report.py``.
"""

import io
import json
import logging
from types import SimpleNamespace

import pytest
from django.test import Client

from apps.security import csp_report
from shared.exceptions import ApiError

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

RUTA = "/api/security/csp-report"
CLASICO = "application/csp-report"
REPORTES = "application/reports+json"
IP = "203.0.113.60"
DOCUMENTO = "https://siep.ejemplo.org/portal/caso/42"
ANFITRION_LARGO = "https://" + "h" * 7000 + ".ejemplo.org"
ESQUEMA_LARGO = "a" * 300 + ":algo"
# Valores de Content-Length que parecen dígitos y no son dígitos ASCII.
NO_ASCII = [pytest.param("²", id="superindice-dos"), pytest.param("١٢٣", id="digitos-arabigo-indicos")]


def _informe_clasico(**cambios):
    """Un informe en el formato clásico (``{"csp-report": {...}}``); ``cambios`` pisa campos (con guiones)."""
    informe = {
        "document-uri": DOCUMENTO,
        "referrer": "",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "original-policy": "default-src 'self'",
        "disposition": "report",
        "blocked-uri": "https://cdn.ejemplo.org/libreria.js",
        "line-number": 10,
        "column-number": 3,
        "source-file": DOCUMENTO,
        "status-code": 200,
        "script-sample": "",
    }
    informe.update(cambios)
    return {"csp-report": informe}


def _enviar(cliente, cuerpo, tipo=CLASICO, **extra):
    """POST del cuerpo tal cual, desde la IP de prueba y sin sesión."""
    return cliente.post(RUTA, cuerpo, content_type=tipo, REMOTE_ADDR=IP, **extra)


def _registrados(registros):
    """Los campos de cada línea ``csp_violation`` registrada en ``siep.security``."""
    return [
        registro.fields
        for registro in registros.records
        if registro.name == "siep.security" and getattr(registro, "fields", {}).get("event") == "csp_violation"
    ]


def _blocked_registrado(cliente, registros, bloqueado):
    """El ``blocked`` que deja un informe cuyo ``blocked-uri`` es ``bloqueado`` (exactamente una línea)."""
    _enviar(cliente, json.dumps(_informe_clasico(**{"blocked-uri": bloqueado})))

    registrado = _registrados(registros)
    assert len(registrado) == 1, registrado
    return registrado[0]["blocked"]


@pytest.fixture
def cliente():
    return Client()


@pytest.fixture
def registros(caplog):
    caplog.set_level(logging.INFO, logger="siep.security")
    return caplog


# ── blocked: se corta a 255 caracteres ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("bloqueado", "esperado"),
    [
        pytest.param(ANFITRION_LARGO + "/libreria.js", ANFITRION_LARGO[:255], id="anfitrion-de-7000"),
        pytest.param(ESQUEMA_LARGO, "a" * 255, id="esquema-de-300"),
    ],
)
def test_blocked_se_corta_a_255_caracteres(cliente, registros, bloqueado, esperado):
    assert _blocked_registrado(cliente, registros, bloqueado) == esperado


def test_control_negativo_sin_el_corte_de_blocked_la_prueba_falla(cliente, registros, monkeypatch):
    # Quitar el corte: el tope deja de aplicarse y la misma petición registra más de 255 caracteres.
    monkeypatch.setattr(csp_report, "BLOQUEADO_MAX", 10**6)

    with pytest.raises(AssertionError):
        assert _blocked_registrado(cliente, registros, ANFITRION_LARGO + "/libreria.js") == ANFITRION_LARGO[:255]


# ── Content-Length: la vista no lee un número que no es ASCII ni lo convierte int() ──────────────


def _peticion(META):
    """Lo que ``_leer_cuerpo`` necesita de una petición: sus metadatos (el flujo va dentro de ``META``)."""
    return SimpleNamespace(META=META)


@pytest.mark.parametrize("declarada", NO_ASCII)
def test_leer_cuerpo_con_digitos_no_ascii_responde_411(declarada):
    peticion = _peticion({"CONTENT_LENGTH": declarada, "wsgi.input": io.BytesIO(b"{}")})

    with pytest.raises(ApiError) as excinfo:
        csp_report._leer_cuerpo(peticion)

    assert excinfo.value.status_code == 411
    assert excinfo.value.api_code == "LENGTH_REQUIRED"


def test_leer_cuerpo_con_mas_digitos_que_el_limite_de_int_responde_413():
    # Python no convierte un número de más de 4300 dígitos (sys.get_int_max_str_digits): supera el tope de sobra.
    peticion = _peticion({"CONTENT_LENGTH": "9" * 5000, "wsgi.input": io.BytesIO(b"{}")})

    with pytest.raises(ApiError) as excinfo:
        csp_report._leer_cuerpo(peticion)

    assert excinfo.value.status_code == 413
    assert excinfo.value.api_code == "REQUEST_TOO_LARGE"


def test_leer_cuerpo_con_espacios_alrededor_lee_exactamente_los_doce_bytes_declarados():
    cuerpo = b'[{"body":1}]'  # 12 bytes
    peticion = _peticion({"CONTENT_LENGTH": " 12", "wsgi.input": io.BytesIO(cuerpo + b' "de sobra"')})

    assert csp_report._leer_cuerpo(peticion) == cuerpo


@pytest.mark.parametrize("declarada", [*NO_ASCII, pytest.param("9" * 5000, id="cinco-mil-digitos")])
def test_el_middleware_de_cuerpo_rechaza_con_400_un_content_length_que_no_es_ascii(cliente, registros, declarada):
    respuesta = _enviar(cliente, json.dumps(_informe_clasico()), CONTENT_LENGTH=declarada)

    assert respuesta.status_code == 400
    assert respuesta.json()["code"] == "REQUEST_INVALID_LENGTH"
    assert _registrados(registros) == []


def test_content_length_con_espacios_alrededor_se_acepta_de_extremo_a_extremo(cliente, registros):
    cuerpo = '[{"body":1}]'  # 12 bytes: un elemento cuyo body no es un objeto no es un informe
    assert len(cuerpo.encode()) == 12

    respuesta = _enviar(cliente, cuerpo, REPORTES, CONTENT_LENGTH=" 12")

    assert respuesta.status_code == 204
    assert _registrados(registros) == []

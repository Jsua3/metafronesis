"""Política de contenido en modo reporte (plan 03, S2-3a, RNF-002): la cabecera va en la API y en la SPA.

``SECURE_CSP_REPORT_ONLY`` lleva la política inicial y se envía como ``Content-Security-Policy-Report-Only``: el
navegador informa de lo que incumple y no bloquea nada. ``SECURE_CSP`` va vacía hasta S2-4, así que ninguna respuesta
lleva ``Content-Security-Policy``. ``SIEP_CSP_REPORT_ONLY=false`` deja los dos ajustes vacíos (interruptor de emergencia).

Cada control tiene su control negativo: con el control apagado, la misma comprobación falla.
"""
import importlib.util

import pytest
from django.conf import settings
from django.test import Client, override_settings

from psychosim.settings import base as ajustes_base

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security, pytest.mark.django_db]

CABECERA_REPORTE = "Content-Security-Policy-Report-Only"
CABECERA_APLICADA = "Content-Security-Policy"
MIDDLEWARE_CSP = "django.middleware.csp.ContentSecurityPolicyMiddleware"

# La política inicial de S2-3a, directiva por directiva.
POLITICA = (
    "default-src 'self'; "
    "script-src 'self' https://accounts.google.com/gsi/client; "
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; "
    "img-src 'self' data: blob:; "
    "font-src 'self'; "
    "media-src 'self' blob:; "
    "worker-src 'self' blob:; "
    "connect-src 'self' https://accounts.google.com/gsi/; "
    "frame-src https://accounts.google.com/gsi/; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'; "
    "report-uri /api/security/csp-report"
)


def _directivas(politica):
    """La política como ``{directiva: [valores]}``: es lo que se compara directiva por directiva."""
    mapa = {}
    for trozo in politica.split(";"):
        partes = trozo.split()
        if partes:
            assert partes[0] not in mapa, f"directiva repetida: {partes[0]}"
            mapa[partes[0]] = partes[1:]
    return mapa


def _spa(tmp_path, ruta, cadena=None):
    """GET ``ruta`` contra un SPA de prueba (un ``index.html`` de una línea); ``cadena`` sustituye al middleware activo."""
    (tmp_path / "index.html").write_text("<!doctype html><title>SPA</title>", encoding="utf-8")
    ajustes = {"SPA_DIST_DIR": tmp_path}
    if cadena is not None:
        ajustes["MIDDLEWARE"] = cadena
    with override_settings(**ajustes):
        return Client().get(ruta)


def _ajustes_base_con_bandera(monkeypatch, valor):
    """Carga ``psychosim/settings/base.py`` como módulo aparte, con ``SIEP_CSP_REPORT_ONLY`` puesta o quitada."""
    if valor is None:
        monkeypatch.delenv("SIEP_CSP_REPORT_ONLY", raising=False)
    else:
        monkeypatch.setenv("SIEP_CSP_REPORT_ONLY", valor)
    especificacion = importlib.util.spec_from_file_location("ajustes_base_csp", ajustes_base.__file__)
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo


def test_la_api_y_la_spa_llevan_la_politica_de_reporte_directiva_por_directiva(tmp_path):
    respuestas = {
        "API sin sesión": Client().get("/api/grupos"),
        "API pública": Client().get("/api/health"),
        "SPA": _spa(tmp_path, "/portal/anything"),
    }

    for nombre, respuesta in respuestas.items():
        assert CABECERA_REPORTE in respuesta, f"{nombre}: sin {CABECERA_REPORTE}"
        assert _directivas(respuesta[CABECERA_REPORTE]) == _directivas(POLITICA), nombre
        assert CABECERA_APLICADA not in respuesta, f"{nombre}: lleva {CABECERA_APLICADA} y no debe"


def test_con_la_bandera_por_defecto_el_ajuste_de_reporte_es_la_politica_pedida(monkeypatch):
    ajustes = _ajustes_base_con_bandera(monkeypatch, None)

    assert ajustes.SIEP_CSP_REPORT_ONLY is True
    assert ajustes.SECURE_CSP_REPORT_ONLY == _directivas(POLITICA)
    assert ajustes.SECURE_CSP == {}


def test_con_la_bandera_apagada_no_se_envia_ninguna_politica(tmp_path, monkeypatch):
    ajustes = _ajustes_base_con_bandera(monkeypatch, "false")

    assert ajustes.SIEP_CSP_REPORT_ONLY is False
    assert ajustes.SECURE_CSP_REPORT_ONLY == {}
    assert ajustes.SECURE_CSP == {}
    with override_settings(SECURE_CSP_REPORT_ONLY=ajustes.SECURE_CSP_REPORT_ONLY):
        respuesta = _spa(tmp_path, "/portal/anything")
    assert CABECERA_REPORTE not in respuesta
    assert CABECERA_APLICADA not in respuesta


def test_control_negativo_sin_el_middleware_csp_falla_la_cabecera_de_reporte(tmp_path):
    cadena = [middleware for middleware in settings.MIDDLEWARE if middleware != MIDDLEWARE_CSP]

    respuesta = _spa(tmp_path, "/portal/anything", cadena)

    with pytest.raises(AssertionError, match="Report-Only"):
        assert CABECERA_REPORTE in respuesta, f"sin {CABECERA_REPORTE}"

"""S2-2 · HTTPS forzado y HSTS escalonado: la redirección a https, la exención de /api/health y la cabecera HSTS.

Los ajustes que se fuerzan aquí son los que produce ``psychosim.settings.production`` (sus valores exactos los fija
``test_production_settings.py``). Un ``Client`` nuevo dentro de ``override_settings`` carga el middleware con esos
valores. Cada control tiene su control negativo: sin la exención el healthcheck recibe 301; sin el redirect el login
llega a la vista; con HSTS a 0 Django no emite la cabecera.
"""
import json
import secrets

import pytest
from django.test import Client, override_settings

pytestmark = [pytest.mark.req("RNF-02"), pytest.mark.security, pytest.mark.django_db]

# Railway sondea /api/health por HTTP plano con este Host (ver production.py): tiene que pasar el filtro de hosts.
HOST_HEALTHCHECK = "healthcheck.railway.app"

AJUSTES_DE_PRODUCCION = {
    "SECURE_SSL_REDIRECT": True,
    "SECURE_REDIRECT_EXEMPT": [r"^api/health$"],
    "SECURE_PROXY_SSL_HEADER": ("HTTP_X_FORWARDED_PROTO", "https"),
    "ALLOWED_HOSTS": ["testserver", HOST_HEALTHCHECK],
}


def _login(cliente, **cabeceras):
    """POST /api/auth/login por HTTP plano con una cuenta que no existe y una contraseña al azar: la vista responde 401."""
    cuerpo = {"email": f"nadie-{secrets.token_hex(6)}@example.com", "password": secrets.token_urlsafe(24)}
    return cliente.post(
        "/api/auth/login",
        data=json.dumps(cuerpo),
        content_type="application/json",
        secure=False,
        **cabeceras,
    )


def test_el_login_por_http_redirige_a_https():
    with override_settings(**AJUSTES_DE_PRODUCCION):
        respuesta = _login(Client())

    assert respuesta.status_code == 301
    assert respuesta["Location"].startswith("https://")


def test_el_login_con_x_forwarded_proto_https_llega_a_la_vista():
    # El borde de Railway termina TLS y lo declara en la cabecera: la petición es segura y se atiende (401 por credenciales).
    with override_settings(**AJUSTES_DE_PRODUCCION):
        respuesta = _login(Client(), HTTP_X_FORWARDED_PROTO="https")

    assert respuesta.status_code == 401


def test_el_healthcheck_de_railway_por_http_responde_200_sin_redirigir():
    with override_settings(**AJUSTES_DE_PRODUCCION):
        respuesta = Client().get("/api/health", HTTP_HOST=HOST_HEALTHCHECK, secure=False)

    assert respuesta.status_code == 200


def test_hsts_viaja_por_https_con_el_max_age_configurado_sin_subdominios_ni_preload():
    with override_settings(**AJUSTES_DE_PRODUCCION, SECURE_HSTS_SECONDS=3600):
        respuesta = Client().get("/api/health", HTTP_HOST=HOST_HEALTHCHECK, secure=True)

    assert respuesta["Strict-Transport-Security"] == "max-age=3600"


def test_la_redireccion_por_http_no_lleva_hsts():
    with override_settings(**AJUSTES_DE_PRODUCCION, SECURE_HSTS_SECONDS=3600):
        respuesta = _login(Client())

    assert respuesta.status_code == 301
    assert "Strict-Transport-Security" not in respuesta


# ── Controles negativos: con el control apagado, la comprobación cambia ─────────────────────────


def test_control_negativo_sin_exencion_el_healthcheck_por_http_recibe_301():
    # Sin la exención, el sondeo de Railway recibe 301 y el despliegue nunca se promueve: la exención es lo que mantiene el 200.
    with override_settings(**{**AJUSTES_DE_PRODUCCION, "SECURE_REDIRECT_EXEMPT": []}):
        respuesta = Client().get("/api/health", HTTP_HOST=HOST_HEALTHCHECK, secure=False)

    assert respuesta.status_code == 301


def test_control_negativo_sin_redirect_el_login_por_http_llega_a_la_vista():
    with override_settings(**{**AJUSTES_DE_PRODUCCION, "SECURE_SSL_REDIRECT": False}):
        respuesta = _login(Client())

    assert respuesta.status_code == 401


def test_control_negativo_con_hsts_cero_no_hay_cabecera():
    # Con SIEP_HSTS_SECONDS=0 Django no emite la cabecera, y check --deploy vuelve a avisar security.W004.
    with override_settings(**AJUSTES_DE_PRODUCCION, SECURE_HSTS_SECONDS=0):
        respuesta = Client().get("/api/health", HTTP_HOST=HOST_HEALTHCHECK, secure=True)

    assert "Strict-Transport-Security" not in respuesta

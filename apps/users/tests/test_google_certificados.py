"""R1c · La verificación de Google no retiene hilos (SIEP-RNF-02).

google-auth baja los certificados públicos de Google en cada llamada, ANTES de mirar la credencial, con 120 s de
espera por defecto. Estas pruebas sustituyen el transporte por uno falso que cuenta las llamadas (nunca hay red) y
comprueban: una credencial sin forma de JWT no llega a la red; los certificados se guardan con su vigencia; toda
llamada lleva un tope de 5 s; y un fallo de Google responde 503 definido sin filtrar la excepción.
"""
import logging
import secrets
import sys
import types
from unittest.mock import call, patch

import pytest
from django.test import override_settings
from google.auth import transport as google_transport
from google.auth.exceptions import TransportError
from rest_framework.test import APIClient

from apps.users import google_verification

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security]

URL = "/api/auth/google"
CLIENT_ID = "google-client-id.apps.googleusercontent.com"
CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"
MENSAJE_401 = "No fue posible validar la cuenta de Google"
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
MENSAJE_503 = "No pudimos validar con Google en este momento. Inténtalo de nuevo en unos minutos."

CREDENCIALES_SIN_FORMA = [
    pytest.param("", 400, id="vacia"),
    pytest.param("   ", 400, id="solo-espacios"),
    pytest.param("sin-puntos", 401, id="un-segmento"),
    pytest.param("dos.segmentos", 401, id="dos-segmentos"),
    pytest.param("con espacios.en.medio", 401, id="con-espacios"),
    pytest.param("a.b.c.d", 401, id="cuatro-segmentos"),
    pytest.param("a..c", 401, id="segmento-vacio"),
    pytest.param("a.b.c=", 401, id="relleno-fuera-de-base64url"),
    pytest.param("a" * 5000, 400, id="de-5000-caracteres"),
    pytest.param("a.b." + "c" * 4100, 400, id="de-mas-de-4096"),
]


class TransportePrueba:
    """El transporte de google-auth, falso: anota cada llamada y responde lo que la prueba configura.

    Su tiempo de espera por defecto es el de ``google.auth.transport.requests`` (120 s).
    """

    def __init__(self):
        self.llamadas = []
        self.estado = 200
        self.cabeceras = {}
        self.certificados = b"{}"
        self.error = None

    def __call__(self, url, method="GET", body=None, headers=None, timeout=120, **kwargs):
        self.llamadas.append({"url": url, "method": method, "timeout": timeout})
        if self.error is not None:
            raise self.error
        return types.SimpleNamespace(status=self.estado, headers=self.cabeceras, data=self.certificados)

    def pedidos_de_certificados(self):
        return sum(1 for llamada in self.llamadas if llamada["url"] == CERTS_URL)


class RelojPrueba:
    """Reloj monotónico a mano: la prueba avanza el tiempo sin esperar."""

    def __init__(self):
        self.ahora = 1000.0

    def __call__(self):
        return self.ahora

    def avanzar(self, segundos):
        self.ahora += segundos


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def transporte(monkeypatch):
    """El `google.auth.transport.requests` falso: su `Request()` entrega el transporte que cuenta las llamadas.

    Se sustituye con `monkeypatch` y no con `patch.dict(sys.modules)`: ese restaura TODO `sys.modules` al salir y
    descarta los módulos cargados dentro de la prueba (p. ej. `apps.users.views`); el parche de la prueba siguiente
    apuntaría entonces a un módulo que la vista ya no usa.
    """
    recorder = TransportePrueba()
    falso = types.ModuleType("google.auth.transport.requests")
    falso.Request = lambda: recorder
    monkeypatch.setitem(sys.modules, "google.auth.transport.requests", falso)
    monkeypatch.setattr(google_transport, "requests", falso, raising=False)
    yield recorder


@pytest.fixture
def reloj():
    falso = RelojPrueba()
    with patch.object(google_verification, "reloj", falso):
        yield falso


@pytest.fixture(autouse=True)
def cache_limpia():
    google_verification.clear_certs_cache()
    yield
    google_verification.clear_certs_cache()


def _jwt_falso():
    """Tres segmentos base64url al azar: forma de JWT, firma que Google no reconoce. Nunca es un token real."""
    return ".".join(secrets.token_urlsafe(12) for _ in range(3))


def _post(client, credencial):
    return client.post(URL, {"credential": credencial}, format="json")


def test_la_forma_de_jwt_acota_la_longitud_a_4096():
    assert google_verification.tiene_forma_de_jwt("a.b." + "c" * 4092)  # 4096 exactos
    assert not google_verification.tiene_forma_de_jwt("a.b." + "c" * 4093)  # 4097


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
@pytest.mark.parametrize(("credencial", "estado"), CREDENCIALES_SIN_FORMA)
def test_una_credencial_sin_forma_de_jwt_no_llega_a_la_red(client, transporte, credencial, estado):
    resp = _post(client, credencial)

    assert resp.status_code == estado
    assert transporte.llamadas == []


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_diez_jwt_falsos_piden_los_certificados_una_sola_vez(client, transporte):
    for _ in range(10):
        resp = _post(client, _jwt_falso())

        assert resp.status_code == 401
        assert resp.data["message"] == MENSAJE_401

    assert transporte.pedidos_de_certificados() == 1


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_pasada_la_vigencia_los_certificados_se_vuelven_a_bajar(client, transporte, reloj):
    _post(client, _jwt_falso())
    reloj.avanzar(3599)
    _post(client, _jwt_falso())
    assert transporte.pedidos_de_certificados() == 1  # sin Cache-Control: 3600 s de vigencia

    reloj.avanzar(2)
    _post(client, _jwt_falso())
    assert transporte.pedidos_de_certificados() == 2


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_una_respuesta_de_error_de_google_no_se_guarda(client, transporte):
    transporte.estado = 500

    assert _post(client, _jwt_falso()).status_code == 503
    assert _post(client, _jwt_falso()).status_code == 503

    assert transporte.pedidos_de_certificados() == 2  # la segunda también fue a Google


def test_cada_llamada_al_transporte_lleva_como_mucho_cinco_segundos(transporte):
    envoltorio = google_verification.CachedCertsRequest(transporte)

    for pedido in (120, None, 2):
        envoltorio("https://www.googleapis.com/oauth2/v1/otra", method="GET", timeout=pedido)

    assert [llamada["timeout"] for llamada in transporte.llamadas] == [5, 5, 2]


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_el_tiempo_de_espera_de_los_certificados_es_de_cinco_segundos(client, transporte):
    _post(client, _jwt_falso())

    assert [llamada["timeout"] for llamada in transporte.llamadas] == [5]


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
@pytest.mark.parametrize(
    "fallo",
    [
        pytest.param(TransportError("detalle interno del transporte"), id="transporte"),
        pytest.param(ConnectionError("detalle interno de la red"), id="os-error"),
    ],
)
def test_un_fallo_de_google_responde_503_definido_y_registra_una_linea(client, transporte, fallo):
    transporte.error = fallo

    with patch("apps.users.views.log_security_event") as registro:
        resp = _post(client, _jwt_falso())

    assert resp.status_code == 503
    assert resp.data == {"success": False, "code": "GOOGLE_UNAVAILABLE", "message": MENSAJE_503}
    assert "detalle interno" not in resp.content.decode()
    assert registro.call_args_list == [call("google_unavailable", level=logging.WARNING)]


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
@pytest.mark.parametrize(
    ("nombre", "cabecera", "vigencia"),
    [
        pytest.param("Cache-Control", "public, max-age=999999", 3600, id="tope-superior"),
        pytest.param("cache-control", "public, max-age=1", 60, id="tope-inferior-sin-mayusculas"),
    ],
)
def test_la_vigencia_de_los_certificados_se_acota_entre_60_s_y_1_h(
    client, transporte, reloj, nombre, cabecera, vigencia
):
    transporte.cabeceras = {nombre: cabecera}
    _post(client, _jwt_falso())
    reloj.avanzar(vigencia - 1)
    _post(client, _jwt_falso())
    assert transporte.pedidos_de_certificados() == 1

    reloj.avanzar(2)
    _post(client, _jwt_falso())
    assert transporte.pedidos_de_certificados() == 2


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_un_rechazo_de_google_auth_que_no_es_de_transporte_responde_401_y_no_500(client, transporte):
    # google-auth lanza GoogleAuthError (no ValueError) p. ej. con un emisor que no es de Google: no es un fallo del servidor.
    from google.auth.exceptions import GoogleAuthError

    with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=GoogleAuthError("Wrong issuer")):
        resp = _post(client, _jwt_falso())

    assert resp.status_code == 401
    assert resp.data["message"] == MENSAJE_401
    assert "Wrong issuer" not in resp.content.decode()

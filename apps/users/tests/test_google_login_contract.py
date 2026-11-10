"""A-04 — GoogleLoginView: qué responde cada fallo del inicio de sesión con Google.

La verificación con Google se simula: casi siempre en ``verify_google_credential``;
las dos pruebas que ejercitan su traducción de errores sustituyen el transporte de
Google por uno falso (el real exige el paquete ``requests``, que no está en
requirements.txt) y hacen fallar ``verify_oauth2_token``. La búsqueda del usuario va
contra la base real de pruebas.
"""
import sys
import types
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import OperationalError
from django.test import override_settings
from rest_framework.test import APIClient

from apps.users import views

User = get_user_model()

URL = "/api/auth/google"
CLIENT_ID = "google-client-id.apps.googleusercontent.com"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="google_a04@x.com", password="Passw0rd!", nombre="Goo", apellido="Gle", role="ESTUDIANTE"
    )


@pytest.fixture
def transporte_de_google():
    """Un `google.auth.transport.requests` mínimo, para no depender del paquete `requests`: su `Request` es una clase
    invocable que responde como el transporte real (`.status`, `.headers`, `.data`), sin red."""

    class Request:
        def __call__(self, url, method="GET", body=None, headers=None, timeout=120, **kwargs):
            return types.SimpleNamespace(status=200, headers={}, data=b"{}")

    fake = types.ModuleType("google.auth.transport.requests")
    fake.Request = Request
    with patch.dict(sys.modules, {"google.auth.transport.requests": fake}):
        yield


def _verified(email, **extra):
    return {"email": email, "email_verified": True, "sub": "google-sub", **extra}


def _login(client, payload):
    with patch("apps.users.views.verify_google_credential", return_value=payload):
        return client.post(URL, {"credential": "token-de-google"}, format="json")


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_un_usuario_inactivo_recibe_401_como_uno_que_no_existe(client, estudiante):
    estudiante.activo = False
    estudiante.save()

    resp = _login(client, _verified(estudiante.email))

    assert resp.status_code == 401
    assert resp.data["message"] == "La cuenta de Google no está asociada a un usuario activo"


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_una_cuenta_sin_correo_recibe_401(client):
    resp = _login(client, _verified(""))

    assert resp.status_code == 401
    assert resp.data["message"] == "La cuenta de Google no entregó un correo válido"


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_una_credencial_que_google_rechaza_recibe_401(client, transporte_de_google):
    with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("Token expirado")):
        resp = client.post(URL, {"credential": "vencido.token.firma"}, format="json")

    assert resp.status_code == 401
    assert resp.data["message"] == "No fue posible validar la cuenta de Google"


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_sin_el_proveedor_de_google_instalado_recibe_400(client):
    with patch.dict(sys.modules, {"google.auth.transport.requests": None}):
        resp = client.post(URL, {"credential": "token-de-google"}, format="json")

    assert resp.status_code == 400
    assert resp.data["message"] == "El proveedor de Google no está instalado en el backend"


@override_settings(GOOGLE_OAUTH_CLIENT_ID="")
def test_sin_client_id_configurado_responde_400_y_lo_dice(client):
    """La prueba de test_auth solo pide que el mensaje nombre a Google; sin ella, quitar la guarda pasaba
    desapercibido (sin `requests` instalado el flujo cae igual en un 400 que también nombra a Google)."""
    resp = client.post(URL, {"credential": "token-de-google"}, format="json")

    assert resp.status_code == 400
    assert resp.data["message"] == "El inicio de sesión con Google no está configurado"


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_sin_credencial_en_el_cuerpo_recibe_400(client):
    resp = client.post(URL, {}, format="json")

    assert resp.status_code == 400


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID)
def test_un_fallo_de_la_base_de_datos_al_buscar_al_usuario_es_un_error_del_servidor(client, estudiante):
    """A-04, cambio deliberado: antes la caída de la base se disfrazaba de 401 «cuenta no asociada»."""
    with patch.object(views.User.objects, "filter", side_effect=OperationalError("la base no responde")):
        resp = _login(client, _verified(estudiante.email))

    assert resp.status_code == 500
    assert resp.data["message"] == "Error interno del servidor"

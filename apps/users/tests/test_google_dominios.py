"""S1-3 (B.7) · ``GOOGLE_ALLOWED_DOMAINS``: un dominio fuera de la lista recibe el mismo error que una cuenta
inexistente, para no revelar la restricción. Con la lista vacía no hay restricción (SD-14 pendiente)."""
import secrets
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = [pytest.mark.req("D-14"), pytest.mark.security]

URL = "/api/auth/google"
CLIENT_ID = "s13-client.apps.googleusercontent.com"
User = get_user_model()


def _verificado(email):
    return {"email": email, "email_verified": True, "sub": "sub-de-prueba"}


def _login(payload):
    with patch("apps.users.views.verify_google_credential", return_value=payload):
        return APIClient().post(URL, {"credential": "token-de-prueba"}, format="json")


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID, GOOGLE_ALLOWED_DOMAINS=["inst.test"])
def test_un_dominio_fuera_de_la_lista_recibe_el_mismo_error_que_una_cuenta_inexistente(db):
    fuera = _login(_verificado("persona.s13@otro.test"))
    inexistente = _login(_verificado("nadie.s13@inst.test"))

    assert fuera.status_code == inexistente.status_code == 401
    assert fuera.data == inexistente.data
    assert fuera.data["message"] == "La cuenta de Google no está asociada a un usuario activo"


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID, GOOGLE_ALLOWED_DOMAINS=["inst.test"])
def test_una_cuenta_activa_de_otro_dominio_no_entra(db):
    User.objects.create_user(
        email="externa.s13@otro.test",
        password=secrets.token_urlsafe(32),
        nombre="Ex",
        apellido="Terna",
        role="ESTUDIANTE",
    )

    resp = _login(_verificado("externa.s13@otro.test"))

    assert resp.status_code == 401


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID, GOOGLE_ALLOWED_DOMAINS=["inst.test"])
def test_una_cuenta_activa_del_dominio_permitido_entra(db):
    User.objects.create_user(
        email="ana.s13@inst.test",
        password=secrets.token_urlsafe(32),
        nombre="Ana",
        apellido="Inst",
        role="ESTUDIANTE",
    )

    resp = _login(_verificado("ana.s13@inst.test"))

    assert resp.status_code == 200


@override_settings(GOOGLE_OAUTH_CLIENT_ID=CLIENT_ID, GOOGLE_ALLOWED_DOMAINS=[])
def test_con_la_lista_vacia_no_hay_restriccion_de_dominio(db):
    User.objects.create_user(
        email="libre.s13@otro.test",
        password=secrets.token_urlsafe(32),
        nombre="Li",
        apellido="Bre",
        role="ESTUDIANTE",
    )

    resp = _login(_verificado("libre.s13@otro.test"))

    assert resp.status_code == 200

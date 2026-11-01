"""SIEP-RNF-03 · Una contraseña con espacios al final se guarda y se compara tal cual (plan 03, R1b punto 5).

Antes, el cambio de clave guardaba los espacios finales pero el inicio de sesión los recortaba: quien cambiaba su clave
a una terminada en espacios ya no podía entrar, ni con la clave exacta ni con la recortada, y no había recuperación.
"""
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

pytestmark = [pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]

User = get_user_model()


def _clave():
    """Contraseña de prueba generada en ejecución: nunca un literal en el código."""
    return secrets.token_urlsafe(24)


def _entrar(clave, correo):
    return APIClient().post("/api/auth/login", {"email": correo, "password": clave}, format="json")


def test_cambiar_a_una_clave_con_espacios_al_final_solo_deja_entrar_con_la_exacta(db):
    antigua = _clave()
    nueva = _clave() + "  "
    cuenta = User.objects.create_user(
        email="espacios_cambio@inst.test", password=antigua, nombre="Cambio", apellido="Clave", role="ESTUDIANTE"
    )
    cliente = APIClient()
    cliente.force_authenticate(user=cuenta)

    cambio = cliente.post(
        "/api/auth/change-password", {"currentPassword": antigua, "newPassword": nueva}, format="json"
    )
    assert cambio.status_code == 200

    assert _entrar(nueva, cuenta.email).status_code == 200
    assert _entrar(nueva.strip(), cuenta.email).status_code == 401


def test_la_clave_de_un_alta_de_admin_con_espacios_al_final_se_guarda_exacta(db):
    admin = User.objects.create_user(
        email="admin_espacios@inst.test", password=_clave(), nombre="Ad", apellido="Min", role="ADMIN"
    )
    cliente = APIClient()
    cliente.force_authenticate(user=admin)
    correo = "alta_espacios@inst.test"
    clave = _clave() + " "

    alta = cliente.post(
        "/api/admin/users",
        {"email": correo, "password": clave, "nombre": "Nueva", "apellido": "Persona", "role": "ESTUDIANTE",
         "activo": True},
        format="json",
    )
    assert alta.status_code == 200

    assert _entrar(clave, correo).status_code == 200
    assert _entrar(clave.strip(), correo).status_code == 401

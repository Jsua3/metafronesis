"""SIEP-RNF-03 · La ruta de registro directo se retira (plan 03, S1-5).

``POST /api/auth/register`` creaba cuentas con la clave del ADMIN como PERMANENTE: sin cambio obligatorio, sin fecha de
caducidad, sin auditoría ni aviso (evadía SF-21). La ruta canónica es ``POST /api/admin/users``, que cumple todo eso.
Las intenciones de las pruebas de la ruta retirada que siguen valiendo se comprueban aquí contra la canónica.
"""
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

pytestmark = [pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]

User = get_user_model()
RUTA_RETIRADA = "/api/auth/register"
RUTA_CANONICA = "/api/admin/users"


def _clave():
    """Contraseña de prueba generada en ejecución: nunca un literal en el código."""
    return secrets.token_urlsafe(24)


def _alta(correo):
    return {
        "email": correo,
        "password": _clave(),
        "nombre": "Nueva",
        "apellido": "Persona",
        "role": "ESTUDIANTE",
        "activo": True,
    }


@pytest.fixture
def admin(db):
    cuenta = User.objects.create_user(
        email="admin_registro@inst.test", password=_clave(), nombre="Ad", apellido="Min", role="ADMIN"
    )
    cliente = APIClient()
    cliente.force_authenticate(user=cuenta)
    return cliente, cuenta


@pytest.mark.parametrize("autenticado", [False, True])
def test_la_ruta_de_registro_retirada_responde_404_y_no_crea_nada(autenticado, admin):
    cliente, _ = admin
    if not autenticado:
        cliente = APIClient()
    correo = "registro_retirado@inst.test"

    resp = cliente.post(RUTA_RETIRADA, _alta(correo), format="json")

    assert resp.status_code == 404
    assert not User.objects.filter(email=correo).exists()


def test_un_estudiante_no_puede_dar_de_alta_cuentas_por_la_ruta_canonica(db):
    estudiante = User.objects.create_user(
        email="estudiante_registro@inst.test", password=_clave(), nombre="Es", apellido="Tu", role="ESTUDIANTE"
    )
    cliente = APIClient()
    cliente.force_authenticate(user=estudiante)
    correo = "alta_denegada@inst.test"

    resp = cliente.post(RUTA_CANONICA, _alta(correo), format="json")

    assert resp.status_code == 403
    assert resp.data["message"] == "No tiene permisos para realizar esta acción"
    assert not User.objects.filter(email=correo).exists()


def test_el_alta_canonica_con_correo_repetido_no_toca_la_cuenta(admin):
    cliente, cuenta = admin
    clave_antes = cuenta.password

    resp = cliente.post(RUTA_CANONICA, _alta(cuenta.email), format="json")

    assert resp.status_code == 400
    assert "El email ya está registrado" in str(resp.data["message"])
    cuenta.refresh_from_db()
    assert cuenta.password == clave_antes
    assert cuenta.role == "ADMIN"

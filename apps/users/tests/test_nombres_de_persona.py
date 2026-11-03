"""SIEP-RNF-02 · Nombre y apellido que van a un correo: texto de persona en la solicitud de acceso y en el alta (R1b).

La regla pura está en ``shared/tests/test_texto_de_persona.py``. Aquí se comprueba que los dos sitios que aceptan nombres
de persona la aplican: la solicitud pública de acceso y el alta que hace el ADMIN.
"""
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.users.models import AccessRequest

pytestmark = [pytest.mark.req("SIEP-RNF-02"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
RUTA_SOLICITUD = "/api/auth/access-request"
#: Nombres que una regla de persona debe rechazar: un signo, una cifra, un dominio desnudo y un invisible de dirección.
NO_DE_PERSONA = ["Ana@Lopez", "Ana2", "login.siep.co", "Ana" + chr(0x202E) + "Lopez"]


@pytest.fixture(autouse=True)
def correo_en_memoria(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


def _clave():
    """Contraseña de prueba generada en ejecución: nunca un literal en el código."""
    return secrets.token_urlsafe(24)


@pytest.mark.parametrize("nombre", NO_DE_PERSONA)
def test_una_solicitud_de_acceso_rechaza_el_nombre_que_no_es_de_persona(nombre):
    resp = APIClient().post(
        RUTA_SOLICITUD,
        {"nombre": nombre, "apellido": "Gil", "email": "solicitud_persona@inst.test"},
        format="json",
        REMOTE_ADDR="198.51.100.120",
    )

    assert resp.status_code == 400
    assert not AccessRequest.objects.exists()


@pytest.mark.parametrize("campo", ["nombre", "apellido"])
@pytest.mark.parametrize("valor", NO_DE_PERSONA)
def test_el_alta_de_admin_rechaza_el_nombre_o_apellido_que_no_es_de_persona(campo, valor):
    admin = User.objects.create_user(
        email="admin_persona@inst.test", password=_clave(), nombre="Ad", apellido="Min", role="ADMIN"
    )
    cliente = APIClient()
    cliente.force_authenticate(user=admin)
    correo = "alta_persona@inst.test"
    datos = {
        "email": correo,
        "password": _clave(),
        "nombre": "Nueva",
        "apellido": "Persona",
        "role": "ESTUDIANTE",
        "activo": True,
    }
    datos[campo] = valor

    resp = cliente.post("/api/admin/users", datos, format="json")

    assert resp.status_code == 400
    assert not User.objects.filter(email=correo).exists()


def test_una_solicitud_con_nombre_de_persona_valido_se_guarda():
    resp = APIClient().post(
        RUTA_SOLICITUD,
        {"nombre": "María José", "apellido": "O'Connor", "email": "solicitud_valida@inst.test"},
        format="json",
        REMOTE_ADDR="198.51.100.121",
    )

    assert resp.status_code == 201
    assert AccessRequest.objects.filter(email="solicitud_valida@inst.test").exists()

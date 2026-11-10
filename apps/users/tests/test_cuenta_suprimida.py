"""Una cuenta suprimida (S3-4) no se reactiva ni se edita: la supresión no se deshace desde el panel (RNF-003).

Suprimir seudonimiza la cuenta y deja sus intentos, eventos y decisiones enlazados a ella. Si un ADMIN pudiera reactivarla o
ponerle un nombre y un correo nuevos, ese historial volvería a tener dueño: justo lo que la supresión deshizo.
"""
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.privacy.data_subject import NOMBRE_SEUDONIMO, apellido_seudonimo, correo_seudonimo
from apps.users.services import account_service
from shared.policies import ADMIN, ESTUDIANTE

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security]

User = get_user_model()


def _cuenta(rol, etiqueta):
    return User.objects.create_user(
        email=f"{etiqueta}.{secrets.token_hex(4)}@example.com",
        password=secrets.token_urlsafe(24),
        nombre="Prueba",
        apellido=etiqueta.capitalize(),
        role=rol,
    )


def _como(cuenta):
    cliente = APIClient()
    cliente.force_authenticate(user=cuenta)
    return cliente


@pytest.fixture
def escenario(db):
    admin = _cuenta(ADMIN, "admin")
    estudiante = _cuenta(ESTUDIANTE, "estudiante")
    otra = _cuenta(ESTUDIANTE, "otra")
    otra.activo = False
    otra.save(update_fields=["activo"])
    estudiante.email = correo_seudonimo(estudiante.pk)
    estudiante.nombre = NOMBRE_SEUDONIMO
    estudiante.apellido = apellido_seudonimo(estudiante.pk)
    estudiante.activo = False
    estudiante.set_password(None)
    estudiante.save()
    assert estudiante.email == correo_seudonimo(estudiante.pk) and not estudiante.activo
    return admin, estudiante, otra


def _reactivar(admin, cuenta):
    return _como(admin).patch(f"/api/admin/users/{cuenta.pk}/status", {"activo": True}, format="json")


def _editar(admin, cuenta, **cambios):
    datos = {"email": cuenta.email, "nombre": cuenta.nombre, "apellido": cuenta.apellido, "role": cuenta.role, **cambios}
    return _como(admin).put(f"/api/admin/users/{cuenta.pk}", datos, format="json")


def test_el_admin_no_reactiva_una_cuenta_suprimida(escenario):
    admin, suprimida, _ = escenario

    respuesta = _reactivar(admin, suprimida)

    assert respuesta.status_code == 409, respuesta.data
    assert respuesta.data["code"] == "ACCOUNT_ERASED"
    suprimida.refresh_from_db()
    assert not suprimida.activo, "la cuenta suprimida sigue inactiva"


def test_el_admin_no_edita_una_cuenta_suprimida_ni_le_pone_un_nombre_nuevo(escenario):
    admin, suprimida, _ = escenario
    clave = secrets.token_urlsafe(24)

    respuesta = _editar(admin, suprimida, email=f"nueva.{secrets.token_hex(4)}@example.com", nombre="Ana", password=clave)

    assert respuesta.status_code == 409, respuesta.data
    assert respuesta.data["code"] == "ACCOUNT_ERASED"
    suprimida.refresh_from_db()
    assert suprimida.email == correo_seudonimo(suprimida.pk), "el correo seudonimo no se reemplaza"
    assert suprimida.nombre != "Ana"
    assert not suprimida.has_usable_password(), "ni se le pone una clave: no puede volver a entrar"


def test_control_negativo_una_cuenta_inactiva_normal_si_se_reactiva_y_se_edita(escenario):
    admin, _, inactiva = escenario

    assert _reactivar(admin, inactiva).status_code == 200
    inactiva.refresh_from_db()
    assert inactiva.activo
    assert _editar(admin, inactiva, nombre="Marta").status_code == 200


def test_control_negativo_sin_la_guarda_la_cuenta_suprimida_se_reactivaria(escenario, monkeypatch):
    admin, suprimida, _ = escenario
    monkeypatch.setattr(account_service, "ensure_not_erased", lambda user: None)

    respuesta = _reactivar(admin, suprimida)

    assert respuesta.status_code == 200, "sin la guarda el panel deshace la supresión: la prueba de arriba sí la vigila"
    suprimida.refresh_from_db()
    assert suprimida.activo

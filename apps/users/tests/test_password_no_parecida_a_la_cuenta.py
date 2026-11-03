"""S1-5 · La contraseña no puede parecerse a la cuenta.

``NotSimilarToAccountValidator`` rechaza una clave IGUAL al correo, a su parte local, al nombre, al apellido, a
«nombre+apellido» o a «apellido+nombre», sin distinguir mayúsculas ni espacios. Se prueba el validador suelto, la
cadena de ``AUTH_PASSWORD_VALIDATORS`` y los sitios donde se fija una clave, que deben pasarle la cuenta (la que existe
o la que va a quedar tras guardar).
"""
import secrets
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError

from apps.users import password_validators
from apps.users.serializers import AdminUserWriteSerializer
from apps.users.services import account_service
from rest_framework.test import APIClient
from shared.exceptions import ApiError

pytestmark = [pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]

User = get_user_model()
NOMBRE = "Valentina"
APELLIDO = "Restrepo"
CORREO = "valentina.restrepo@inst.test"

#: Claves parecidas a la cuenta de arriba: deben rechazarse todas.
PARECIDAS = [
    CORREO,
    "VALENTINA.RESTREPO@INST.TEST",
    " valentina.restrepo@inst.test ",
    "valentina.restrepo",
    "Valentina",
    "RESTREPO",
    "ValentinaRestrepo",
    "restrepo valentina",
    "VALENTINA RESTREPO",
]


def _cuenta():
    """Los datos de la cuenta que mira el validador (sin tocar la base)."""
    return SimpleNamespace(email=CORREO, nombre=NOMBRE, apellido=APELLIDO)


def _clave():
    """Contraseña de prueba generada en ejecución: nunca un literal en el código."""
    return secrets.token_urlsafe(24)


@pytest.mark.parametrize("clave", PARECIDAS)
def test_el_validador_rechaza_lo_parecido_a_la_cuenta(clave):
    with pytest.raises(ValidationError) as caught:
        password_validators.NotSimilarToAccountValidator().validate(clave, _cuenta())

    assert caught.value.code == "password_too_similar"


def test_una_clave_distinta_pasa_el_validador():
    password_validators.NotSimilarToAccountValidator().validate(_clave(), _cuenta())


def test_sin_cuenta_el_validador_no_rechaza_nada():
    password_validators.NotSimilarToAccountValidator().validate(CORREO, None)


@pytest.mark.parametrize("clave", ["valentinarestrepo", "Valentina Restrepo", "restrepovalentina", CORREO])
def test_la_cadena_de_validadores_de_django_rechaza_la_clave_parecida(clave):
    with pytest.raises(ValidationError) as caught:
        password_validation.validate_password(clave, _cuenta())

    assert "password_too_similar" in [error.code for error in caught.value.error_list]


def test_la_cadena_de_validadores_acepta_una_clave_distinta():
    password_validation.validate_password(_clave(), _cuenta())


def test_el_alta_por_la_ruta_canonica_rechaza_la_clave_igual_a_nombre_y_apellido(db):
    admin = User.objects.create_user(
        email="admin_parecida@inst.test", password=_clave(), nombre="Ad", apellido="Min", role="ADMIN"
    )
    cliente = APIClient()
    cliente.force_authenticate(user=admin)

    resp = cliente.post(
        "/api/admin/users",
        {
            "email": CORREO,
            "password": "Valentina Restrepo",
            "nombre": NOMBRE,
            "apellido": APELLIDO,
            "role": "ESTUDIANTE",
            "activo": True,
        },
        format="json",
    )

    assert resp.status_code == 400
    assert not User.objects.filter(email=CORREO).exists()


def test_el_alta_de_un_admin_rechaza_la_clave_igual_al_correo(db):
    ser = AdminUserWriteSerializer(
        data={"email": CORREO, "password": CORREO, "nombre": NOMBRE, "apellido": APELLIDO, "role": "ESTUDIANTE"}
    )

    assert not ser.is_valid()
    assert "password" in ser.errors


def test_el_cambio_por_un_admin_compara_con_los_datos_que_van_a_quedar(db):
    cuenta = User.objects.create_user(
        email="ana.vieja@inst.test", password=_clave(), nombre="Ana", apellido="Vieja", role="ESTUDIANTE"
    )

    # La clave es el nombre NUEVO: la cuenta lo tendrá tras guardar, aunque hoy diga «Ana».
    ser = AdminUserWriteSerializer(
        instance=cuenta,
        data={
            "email": "ana.vieja@inst.test",
            "password": "Valentina Restrepo",
            "nombre": NOMBRE,
            "apellido": APELLIDO,
            "role": "ESTUDIANTE",
            "activo": True,
        },
    )

    assert not ser.is_valid()
    assert "password" in ser.errors


def test_el_cambio_propio_rechaza_la_clave_parecida_a_la_cuenta(db):
    actual = _clave()
    cuenta = User.objects.create_user(
        email=CORREO, password=actual, nombre=NOMBRE, apellido=APELLIDO, role="ESTUDIANTE"
    )

    with pytest.raises(ApiError) as caught:
        account_service.change_password(cuenta, actual, "valentinarestrepo")

    assert caught.value.api_code == "VALIDATION_ERROR"
    assert caught.value.extra.get("field") == "newPassword"

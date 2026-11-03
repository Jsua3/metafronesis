"""S1-5 · Contraseñas temporales con caducidad.

Pasados ``SIEP_TEMP_PASSWORD_DAYS`` días (7 por defecto) desde que se fijó la temporal, esa clave deja de servir. Una
cuenta de estudiante vuelve a «pendiente» (espera al ADMIN); la de un ADMIN no se desactiva por caducidad. Un intento
con clave caducada responde lo mismo que una clave mala y gasta exactamente un ``bcrypt.checkpw``.
"""
import io
import os
import re
import secrets
import subprocess
import sys
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

import apps.users.models as modelos

pytestmark = [pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]

User = get_user_model()
LOGIN = "/api/auth/login"
ME = "/api/auth/me"
CAMBIAR_CLAVE = "/api/auth/change-password"
APROBAR = "/api/admin/users/approve"
USUARIOS = "/api/admin/users"


@pytest.fixture(autouse=True)
def locmem_email(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


@pytest.fixture
def cuenta_bcrypt(monkeypatch):
    """Lista de las llamadas a ``bcrypt.checkpw``: el trabajo que cuesta un intento de inicio de sesión."""
    llamadas = []
    original = modelos.bcrypt.checkpw

    def contar(*args, **kwargs):
        llamadas.append(args)
        return original(*args, **kwargs)

    monkeypatch.setattr(modelos.bcrypt, "checkpw", contar)
    return llamadas


def _clave():
    """Contraseña de prueba generada en ejecución: nunca un literal en el código."""
    return secrets.token_urlsafe(24)


def _hace(**delta):
    """El instante de hace ``delta``: la fecha con la que se fijó la temporal."""
    return timezone.now() - timedelta(**delta)


def _persona(clave, temp_desde, role="ESTUDIANTE", activo=True, must=True):
    """Cuenta con contraseña fijada en ``temp_desde`` (temporal si ``must``). ``None`` = sin fecha de temporal."""
    return User.objects.create_user(
        email=f"temp.{secrets.token_hex(6)}@inst.test",
        password=clave,
        nombre="Lucía",
        apellido="Ortiz",
        role=role,
        activo=activo,
        must_change_password=must,
        temp_password_set_at=temp_desde,
    )


def _admin():
    return User.objects.create_user(
        email=f"admin.{secrets.token_hex(6)}@inst.test",
        password=_clave(),
        nombre="Ad",
        apellido="Min",
        role="ADMIN",
    )


def _login(email, clave):
    return APIClient().post(LOGIN, {"email": email, "password": clave}, format="json", REMOTE_ADDR="198.51.100.20")


def _como(token):
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return cliente


def _como_admin(admin):
    cliente = APIClient()
    cliente.force_authenticate(user=admin)
    return cliente


def _estado(cuentas):
    """Lo que cambia en una cuenta cuando caduca o se reinicia. Recarga desde la base."""
    filas = []
    for cuenta in cuentas:
        cuenta.refresh_from_db()
        filas.append((cuenta.activo, cuenta.temp_password_set_at, cuenta.must_change_password, cuenta.password))
    return filas


def test_temporal_de_hace_6_dias_23_horas_entra_y_obliga_a_cambiarla(db):
    clave = _clave()
    cuenta = _persona(clave, _hace(days=6, hours=23))

    resp = _login(cuenta.email, clave)

    assert resp.status_code == 200
    assert resp.data["data"]["user"]["mustChangePassword"] is True
    cuenta.refresh_from_db()
    assert cuenta.activo is True
    assert cuenta.temp_password_set_at is not None


def test_temporal_de_hace_7_dias_y_un_minuto_responde_como_una_clave_mala(db):
    clave = _clave()
    cuenta = _persona(clave, _hace(days=7, minutes=1))
    referencia = _persona(_clave(), None, must=False)
    epoca_antes = cuenta.session_epoch

    caducada = _login(cuenta.email, clave)
    mala = _login(referencia.email, _clave())

    assert caducada.status_code == 401
    assert caducada.json() == mala.json()
    cuenta.refresh_from_db()
    assert cuenta.activo is False
    assert cuenta.must_change_password is True
    assert cuenta.temp_password_set_at is None
    assert not cuenta.has_usable_password()
    assert cuenta.session_epoch > epoca_antes
    assert cuenta.is_pending_approval is True


def test_la_cuenta_caducada_aparece_como_pendiente_y_el_admin_la_reaprueba(db):
    clave = _clave()
    cuenta = _persona(clave, _hace(days=8))
    admin = _admin()
    assert _login(cuenta.email, clave).status_code == 401

    listado = _como_admin(admin).get(USUARIOS)
    fila = next(fila for fila in listado.data["data"] if fila["id"] == cuenta.id)
    assert fila["pendingApproval"] is True

    aprobacion = _como_admin(admin).post(APROBAR, {"userIds": [cuenta.id]}, format="json")
    assert aprobacion.status_code == 200
    nueva = re.search(r"Contraseña temporal: (\S+)", mail.outbox[-1].body).group(1)
    assert _login(cuenta.email, nueva).status_code == 200


def test_admin_con_temporal_caducada_recibe_401_y_no_se_desactiva(db):
    clave = _clave()
    admin = User.objects.create_user(
        email=f"admin.caducada.{secrets.token_hex(6)}@inst.test",
        password=clave,
        nombre="Ad",
        apellido="Min",
        role="ADMIN",
        must_change_password=True,
        temp_password_set_at=_hace(days=8),
    )

    resp = _login(admin.email, clave)

    assert resp.status_code == 401
    admin.refresh_from_db()
    assert admin.activo is True
    assert admin.has_usable_password() is True
    assert admin.must_change_password is True
    assert admin.temp_password_set_at is not None


@pytest.mark.parametrize("clave_correcta", [True, False])
def test_temporal_caducada_gasta_exactamente_un_checkpw(db, cuenta_bcrypt, clave_correcta):
    clave = _clave()
    cuenta = _persona(clave, _hace(days=8))

    resp = _login(cuenta.email, clave if clave_correcta else _clave())

    assert resp.status_code == 401
    assert len(cuenta_bcrypt) == 1, f"{len(cuenta_bcrypt)} llamadas a checkpw (se esperaba 1)"


def test_comando_dry_run_no_cambia_nada_y_sin_el_deja_pendientes_solo_las_caducadas(db):
    clave = _clave()
    vencida_a = _persona(clave, _hace(days=8))
    vencida_b = _persona(clave, _hace(days=30))
    vigente = _persona(clave, _hace(days=6, hours=23))
    admin = User.objects.create_user(
        email=f"admin.cmd.{secrets.token_hex(6)}@inst.test",
        password=clave,
        nombre="Ad",
        apellido="Min",
        role="ADMIN",
        must_change_password=True,
        temp_password_set_at=_hace(days=20),
    )
    cuentas = [vencida_a, vencida_b, vigente, admin]
    antes = _estado(cuentas)

    simulacro = io.StringIO()
    call_command("expire_temporary_passwords", "--dry-run", stdout=simulacro)

    assert _estado(cuentas) == antes
    assert "2" in simulacro.getvalue()
    assert vencida_a.email not in simulacro.getvalue()

    real = io.StringIO()
    call_command("expire_temporary_passwords", stdout=real)

    assert real.getvalue()
    assert vencida_a.email not in real.getvalue()
    for vencida in (vencida_a, vencida_b):
        vencida.refresh_from_db()
        assert (vencida.activo, vencida.temp_password_set_at, vencida.is_pending_approval) == (False, None, True)
    vigente.refresh_from_db()
    assert vigente.activo is True
    assert vigente.temp_password_set_at is not None
    admin.refresh_from_db()
    assert admin.activo is True
    assert admin.temp_password_set_at is not None


def test_cambiar_la_contrasena_quita_la_temporal(db):
    clave = _clave()
    cuenta = _persona(clave, _hace(days=1))
    token = _login(cuenta.email, clave).data["data"]["token"]
    nueva = _clave()

    resp = _como(token).post(CAMBIAR_CLAVE, {"currentPassword": clave, "newPassword": nueva}, format="json")

    assert resp.status_code == 200
    cuenta.refresh_from_db()
    assert cuenta.must_change_password is False
    assert cuenta.temp_password_set_at is None


def test_entrar_con_google_quita_la_temporal(db, settings):
    settings.GOOGLE_OAUTH_CLIENT_ID = "google-client-id.apps.googleusercontent.com"
    cuenta = _persona(_clave(), _hace(days=1))
    payload = {"email": cuenta.email, "email_verified": True, "sub": "google-sub"}

    with patch("apps.users.views.verify_google_credential", return_value=payload):
        resp = APIClient().post("/api/auth/google", {"credential": "valid-id-token"}, format="json")

    assert resp.status_code == 200
    cuenta.refresh_from_db()
    assert cuenta.must_change_password is False
    assert cuenta.temp_password_set_at is None


_PROCESO_BASE = "from psychosim.settings.base import SIEP_TEMP_PASSWORD_DAYS as d; print(d)"


def _arrancar_settings(valor):
    entorno = {clave: valor for clave, valor in os.environ.items() if clave != "DATABASE_URL"}
    if valor is None:
        entorno.pop("SIEP_TEMP_PASSWORD_DAYS", None)
    else:
        entorno["SIEP_TEMP_PASSWORD_DAYS"] = valor
    return subprocess.run(
        [sys.executable, "-c", _PROCESO_BASE],
        cwd=Path(django_settings.BASE_DIR),
        env=entorno,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_los_dias_de_la_temporal_por_defecto_son_siete():
    resultado = _arrancar_settings(None)

    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.strip() == "7"


def test_los_dias_de_la_temporal_se_leen_del_entorno():
    resultado = _arrancar_settings("3")

    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.strip() == "3"


@pytest.mark.parametrize("valor", ["0", "-3", "1.5", "siete"])
def test_un_valor_invalido_detiene_el_arranque_con_un_error_claro(valor):
    resultado = _arrancar_settings(valor)

    assert resultado.returncode != 0
    assert "SIEP_TEMP_PASSWORD_DAYS" in resultado.stderr
    assert "ImproperlyConfigured" in resultado.stderr

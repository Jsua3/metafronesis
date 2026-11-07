"""El bloqueo por fallos de inicio de sesión deja rastro y se puede levantar (S1-2; revisión de la ola A, hallazgo #2).

Cualquiera puede bloquear una cuenta real desde otra IP (30 fallos en 15 min). Por eso el bloqueo deja una línea
``account_throttled`` con el id de la cuenta cuando existe y ``None`` cuando no (nunca el correo), y el comando
``unblock_login`` lo levanta sin tocar a nadie más.
"""
import io
import logging
import secrets

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient

import apps.users.models as modelos
from apps.security import limiter

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
LOGIN = "/api/auth/login"
INSTANTE = 1_800_000_000.0


@pytest.fixture
def reloj(monkeypatch):
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


@pytest.fixture
def limitador(settings):
    settings.SIEP_THROTTLE_ENABLED = True
    return settings


def _cuenta(correo):
    clave = secrets.token_urlsafe(24)
    cuenta = User.objects.create_user(email=correo, password=clave, nombre="Prueba", apellido="Bloqueo", role="ESTUDIANTE")
    return cuenta, clave


def _login(cliente, correo, clave, ip):
    return cliente.post(LOGIN, {"email": correo, "password": clave}, format="json", REMOTE_ADDR=ip)


def _cinco_fallos(cliente, correo, ip):
    return [_login(cliente, correo, secrets.token_urlsafe(16), ip).status_code for _ in range(5)]


def _eventos(caplog, evento):
    return [
        registro
        for registro in caplog.records
        if registro.name == "siep.security" and getattr(registro, "fields", {}).get("event") == evento
    ]


def test_el_bloqueo_de_una_cuenta_existente_deja_su_id_y_no_su_correo(reloj, limitador, caplog, monkeypatch):
    cuenta, _ = _cuenta("bloqueo.existente@ejemplo.org")
    cliente = APIClient()
    assert _cinco_fallos(cliente, cuenta.email, "198.51.100.210") == [401] * 5
    llamadas_a_bcrypt = []
    original = modelos.bcrypt.checkpw

    def contar(*args, **kwargs):
        llamadas_a_bcrypt.append(args)
        return original(*args, **kwargs)

    monkeypatch.setattr(modelos.bcrypt, "checkpw", contar)

    with caplog.at_level(logging.INFO, logger="siep.security"):
        respuesta = _login(cliente, cuenta.email, secrets.token_urlsafe(16), "198.51.100.210")

    assert respuesta.status_code == 429
    assert llamadas_a_bcrypt == []  # un bloqueo no gasta trabajo bcrypt
    eventos = _eventos(caplog, "account_throttled")
    assert [evento.fields for evento in eventos] == [
        {"event": "account_throttled", "scope": "login_fail_account_ip", "actor_id": cuenta.pk}
    ]
    assert cuenta.email not in str([evento.fields for evento in eventos])


def test_el_bloqueo_de_un_correo_inexistente_deja_el_id_vacio(reloj, limitador, caplog):
    cliente = APIClient()
    correo = "nadie.bloqueo@ejemplo.org"
    assert _cinco_fallos(cliente, correo, "198.51.100.211") == [401] * 5

    with caplog.at_level(logging.INFO, logger="siep.security"):
        respuesta = _login(cliente, correo, secrets.token_urlsafe(16), "198.51.100.211")

    assert respuesta.status_code == 429
    eventos = _eventos(caplog, "account_throttled")
    assert [evento.fields for evento in eventos] == [{"event": "account_throttled", "scope": "login_fail_account_ip"}]
    assert correo not in str([evento.fields for evento in eventos])


def test_un_correo_inexistente_se_bloquea_igual_que_una_cuenta_real(reloj, limitador):
    """Si el contador solo contara cuentas que existen, el 429 sería un oráculo de existencia (hallazgo #9)."""
    cuenta, _ = _cuenta("oraculo.bloqueo@ejemplo.org")
    cliente = APIClient()

    real = [_login(cliente, cuenta.email, secrets.token_urlsafe(16), "198.51.100.240").status_code for _ in range(6)]
    inexistente = [
        _login(cliente, "nadie.oraculo@ejemplo.org", secrets.token_urlsafe(16), "198.51.100.241").status_code
        for _ in range(6)
    ]

    assert real == inexistente == [401, 401, 401, 401, 401, 429]


def test_unblock_login_levanta_el_bloqueo_y_no_toca_otra_cuenta(reloj, limitador):
    cuenta, clave = _cuenta("desbloqueo@ejemplo.org")
    otra, clave_otra = _cuenta("otra.bloqueada@ejemplo.org")
    cliente = APIClient()
    _cinco_fallos(cliente, cuenta.email, "198.51.100.220")
    _cinco_fallos(cliente, otra.email, "198.51.100.220")
    assert _login(cliente, cuenta.email, clave, "198.51.100.220").status_code == 429

    salida = io.StringIO()
    call_command("unblock_login", "--email", cuenta.email, "--ip", "198.51.100.220", stdout=salida)

    assert _login(cliente, cuenta.email, clave, "198.51.100.220").status_code == 200
    assert _login(cliente, otra.email, clave_otra, "198.51.100.220").status_code == 429
    assert cuenta.email not in salida.getvalue()


def test_unblock_login_sin_ip_deja_el_contador_de_la_pareja(reloj, limitador):
    """Sin ``--ip`` se borran los fallos de la cuenta, no los de la pareja cuenta + IP desde esa IP."""
    cuenta, clave = _cuenta("sin.ip@ejemplo.org")
    cliente = APIClient()
    _cinco_fallos(cliente, cuenta.email, "198.51.100.230")

    call_command("unblock_login", "--email", cuenta.email, stdout=io.StringIO())

    assert _login(cliente, cuenta.email, clave, "198.51.100.230").status_code == 429
    assert _login(cliente, cuenta.email, clave, "198.51.100.231").status_code == 200

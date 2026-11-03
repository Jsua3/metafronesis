"""E2-12 · Correo transaccional: ``MAILERS`` sale de variables y producción lo exige (DJA-3).

El correo lleva avisos (solicitud de acceso, invitación) y la contraseña temporal de una
cuenta aprobada. Por eso en producción el backend **no** puede ser la consola (la contraseña
iría al registro de la plataforma) y el aviso de solicitudes necesita un destino real o una
declaración explícita de que no lo hay.
"""
import importlib
import runpy
import secrets
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured

from psychosim.settings import base as base_settings

pytestmark = pytest.mark.req("DJA-3")

BACKEND = Path(__file__).resolve().parents[2]
SMTP = "django.core.mail.backends.smtp.EmailBackend"
CONSOLE = "django.core.mail.backends.console.EmailBackend"

PROD_ENV = {
    # S5-1: las llaves de prueba se generan en cada ejecución; ninguna es un literal.
    "DJANGO_SECRET_KEY": secrets.token_urlsafe(48),
    "DJANGO_ALLOWED_HOSTS": "siep.example.edu.co",
    "DATABASE_URL": "postgres://usuario:clave@bd.example:5432/siep",
    # S5-3: producción exige la llave que firma las sesiones (distinta de las demás).
    "JWT_SIGNING_KEY": secrets.token_urlsafe(48),
    "REFLECTION_ENCRYPTION_KEY": secrets.token_urlsafe(32),
    # S5-2: producción exige la llave activa versionada (REFLECTION_ACTIVE_KEY y su secreto en REFLECTION_KEYS).
    "REFLECTION_ACTIVE_KEY": "k1",
    "REFLECTION_KEYS": f"k1={secrets.token_urlsafe(48)}",
    "EMAIL_BACKEND": SMTP,
    "ACCESS_REQUEST_NOTIFY_EMAILS": "admin@siep.example.edu.co, secretaria@siep.example.edu.co",
    # S1-1: producción exige SIEP_TRUSTED_PROXIES (sin valor por defecto).
    "SIEP_TRUSTED_PROXIES": "1",
}
MAIL_VARS = (
    "EMAIL_BACKEND", "EMAIL_HOST", "EMAIL_PORT", "EMAIL_HOST_USER", "EMAIL_HOST_PASSWORD",
    "EMAIL_USE_TLS", "EMAIL_USE_SSL", "EMAIL_TIMEOUT", "ACCESS_REQUEST_NOTIFY_EMAILS",
    "ACCESS_REQUEST_NOTIFY_DISABLED", "SIEP_ALLOW_CONSOLE_EMAIL",
)


@pytest.fixture(autouse=True)
def _restore_base_settings():
    """``production`` hace ``from .base import *``: se recarga ``base`` con el entorno de la prueba
    y, al terminar (con el entorno ya restaurado), se vuelve a su estado normal."""
    yield
    importlib.reload(base_settings)


def _clean(monkeypatch):
    for name in (*MAIL_VARS, "RAILWAY_PUBLIC_DOMAIN", "DJANGO_ALLOWED_HOSTS", "DATABASE_URL"):
        monkeypatch.delenv(name, raising=False)


def _base(monkeypatch, **env):
    _clean(monkeypatch)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return runpy.run_path(str(BACKEND / "psychosim" / "settings" / "base.py"), run_name="base_bajo_prueba")


def _production(monkeypatch, **overrides):
    _clean(monkeypatch)
    for name, value in {**PROD_ENV, **overrides}.items():
        if value is not None:
            monkeypatch.setenv(name, value)
    importlib.reload(base_settings)
    return runpy.run_module("psychosim.settings.production", run_name="production_bajo_prueba")


# ─── base: MAILERS desde variables ───────────────────────────────────────────────────────
def test_the_default_backend_is_the_console_without_options(monkeypatch):
    settings = _base(monkeypatch)

    assert settings["MAILERS"]["default"] == {"BACKEND": CONSOLE}


def test_smtp_options_come_from_the_environment(monkeypatch):
    settings = _base(
        monkeypatch,
        EMAIL_BACKEND=SMTP,
        EMAIL_HOST="smtp.example.edu.co",
        EMAIL_PORT="587",
        EMAIL_HOST_USER="siep",
        EMAIL_HOST_PASSWORD="s3cr3t",
        EMAIL_USE_TLS="true",
        EMAIL_TIMEOUT="10",
    )

    mailer = settings["MAILERS"]["default"]
    assert mailer["BACKEND"] == SMTP
    assert mailer["OPTIONS"] == {
        "host": "smtp.example.edu.co", "port": 587, "username": "siep", "password": "s3cr3t",
        "use_tls": True, "timeout": 10,
    }


def test_an_unset_option_is_not_passed(monkeypatch):
    """Una variable sin definir no se pasa al backend; la única con valor propio es el tiempo de
    espera (``timeout`` = 10 s) para que un SMTP colgado no retenga la petición."""
    settings = _base(monkeypatch, EMAIL_BACKEND=SMTP, EMAIL_HOST="smtp.example.edu.co")

    assert settings["MAILERS"]["default"]["OPTIONS"] == {"host": "smtp.example.edu.co", "timeout": 10}


def test_smtp_gets_a_bounded_timeout_when_none_is_given(monkeypatch):
    """Sin tiempo de espera, un servidor de correo colgado retiene la petición indefinidamente."""
    settings = _base(monkeypatch, EMAIL_BACKEND=SMTP, EMAIL_HOST="smtp.example.edu.co")

    assert settings["MAILERS"]["default"]["OPTIONS"]["timeout"] == 10


def test_an_explicit_timeout_wins_over_the_default(monkeypatch):
    settings = _base(monkeypatch, EMAIL_BACKEND=SMTP, EMAIL_HOST="smtp.example.edu.co", EMAIL_TIMEOUT="30")

    assert settings["MAILERS"]["default"]["OPTIONS"]["timeout"] == 30


# ─── producción ──────────────────────────────────────────────────────────────────────────
def test_production_with_a_real_backend_and_a_destination_starts(monkeypatch):
    settings = _production(monkeypatch)

    assert settings["MAILERS"]["default"]["BACKEND"] == SMTP
    assert settings["ACCESS_REQUEST_NOTIFY_EMAILS"] == [
        "admin@siep.example.edu.co", "secretaria@siep.example.edu.co",
    ]


def test_production_refuses_the_console_backend(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="EMAIL_BACKEND"):
        _production(monkeypatch, EMAIL_BACKEND=None)


def test_production_allows_the_console_backend_only_if_declared(monkeypatch):
    settings = _production(monkeypatch, EMAIL_BACKEND=None, SIEP_ALLOW_CONSOLE_EMAIL="true")

    assert settings["MAILERS"]["default"]["BACKEND"] == CONSOLE


def test_production_requires_a_destination_for_the_access_request_notice(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="ACCESS_REQUEST_NOTIFY_EMAILS"):
        _production(monkeypatch, ACCESS_REQUEST_NOTIFY_EMAILS=None)


def test_production_accepts_declaring_that_there_is_no_destination(monkeypatch):
    settings = _production(
        monkeypatch, ACCESS_REQUEST_NOTIFY_EMAILS=None, ACCESS_REQUEST_NOTIFY_DISABLED="true"
    )

    assert settings["ACCESS_REQUEST_NOTIFY_EMAILS"] == []


def test_the_development_defaults_are_unchanged(monkeypatch):
    settings = _base(monkeypatch)

    assert settings["ACCESS_REQUEST_NOTIFY_EMAILS"] == [
        "admin@psychosim.edu.co", "secretariapsicologia@cue.edu.co",
    ]

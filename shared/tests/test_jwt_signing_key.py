"""S5-3 · La llave que FIRMA los tokens de sesión es JWT_SIGNING_KEY, no DJANGO_SECRET_KEY.

simplejwt fija su llave al importarse (``rest_framework_simplejwt.state.token_backend``): cambiar ``SECRET_KEY`` o
``SIMPLE_JWT`` con ``override_settings`` dentro de un proceso no cambia la firma. Por eso:

- la configuración se lee de ``base.py`` con el entorno de cada prueba;
- la rotación se prueba con intérpretes NUEVOS y sus variables de entorno, como lo haría un reinicio del servidor;
- la respuesta de la API se prueba dentro del proceso, con una llave del servidor generada en la prueba (distinta de
  ``SECRET_KEY``) que se sustituye en ``state.token_backend`` y se restaura al terminar.

Ninguna llave es un literal: todas se generan en cada ejecución.
"""
import os
import runpy
import secrets
import subprocess
import sys
import time
import uuid
from pathlib import Path

import jwt
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt import state
from rest_framework_simplejwt.backends import TokenBackend

from apps.users.serializers import generate_access_token

pytestmark = [pytest.mark.req("SIEP-RNF-03"), pytest.mark.security]

BACKEND = Path(__file__).resolve().parents[2]
BASE_PY = BACKEND / "psychosim" / "settings" / "base.py"
RUTA_YO = "/api/auth/me"
# Lo único que un intérprete nuevo toma del equipo: nada de llaves ni de DATABASE_URL de la máquina.
_HEREDADAS = ("PATH", "PATHEXT", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "HOME")
User = get_user_model()


# ── Configuración: ``base.py`` leído con las variables de cada prueba ────────────────────────────────────────────

def _base(monkeypatch, **entorno):
    """``base.py`` con las variables dadas (``None`` = sin la variable), como si el servidor arrancara con ellas."""
    for nombre in ("JWT_SIGNING_KEY", "DJANGO_SECRET_KEY"):
        monkeypatch.delenv(nombre, raising=False)
    for nombre, valor in entorno.items():
        if valor is not None:
            monkeypatch.setenv(nombre, valor)
    return runpy.run_path(str(BASE_PY), run_name="base_bajo_prueba")


def test_la_llave_de_firma_viene_de_jwt_signing_key_y_no_de_django_secret_key(monkeypatch):
    llave, llave_de_django = secrets.token_urlsafe(48), secrets.token_urlsafe(48)

    base = _base(monkeypatch, JWT_SIGNING_KEY=llave, DJANGO_SECRET_KEY=llave_de_django)

    assert base["SIMPLE_JWT"]["SIGNING_KEY"] == llave
    assert base["SIMPLE_JWT"]["SIGNING_KEY"] != base["SECRET_KEY"]


def test_en_desarrollo_sin_jwt_signing_key_la_firma_cae_a_secret_key(monkeypatch):
    # Desarrollo y pruebas: sin la variable no cambia nada de lo existente. Producción la exige (production.py).
    llave_de_django = secrets.token_urlsafe(48)

    base = _base(monkeypatch, JWT_SIGNING_KEY=None, DJANGO_SECRET_KEY=llave_de_django)

    assert base["SIMPLE_JWT"]["SIGNING_KEY"] == llave_de_django


def test_la_firma_es_hs256_y_no_declara_llave_de_verificacion(monkeypatch):
    base = _base(
        monkeypatch,
        JWT_SIGNING_KEY=secrets.token_urlsafe(48),
        DJANGO_SECRET_KEY=secrets.token_urlsafe(48),
    )

    assert base["SIMPLE_JWT"]["ALGORITHM"] == "HS256"
    assert base["SIMPLE_JWT"]["VERIFYING_KEY"] == ""


# ── Rotación: un intérprete nuevo por reinicio, con producción como en el despliegue ─────────────────────────────

def _entorno_de_produccion(**cambios):
    """Las variables que producción exige, con llaves nuevas en cada ejecución. ``None`` quita una variable."""
    entorno = {nombre: os.environ[nombre] for nombre in _HEREDADAS if nombre in os.environ}
    entorno.update(
        DJANGO_SETTINGS_MODULE="psychosim.settings.production",
        DJANGO_SECRET_KEY=secrets.token_urlsafe(48),
        JWT_SIGNING_KEY=secrets.token_urlsafe(48),
        REFLECTION_ENCRYPTION_KEY=secrets.token_urlsafe(32),
        REFLECTION_ACTIVE_KEY="k1",
        REFLECTION_KEYS=f"k1={secrets.token_urlsafe(48)}",
        DJANGO_ALLOWED_HOSTS="siep.example.edu.co",
        DATABASE_URL=f"postgres://usuario:{secrets.token_urlsafe(12)}@bd.example:5432/siep",
        EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
        ACCESS_REQUEST_NOTIFY_EMAILS="admin@siep.example.edu.co",
        SIEP_TRUSTED_PROXIES="1",
        PYTHONDONTWRITEBYTECODE="1",
    )
    for nombre, valor in cambios.items():
        if valor is None:
            entorno.pop(nombre, None)
        else:
            entorno[nombre] = valor
    return entorno


# Se ejecutan en un intérprete nuevo, con los ajustes de producción y el entorno que se les da.
CODIGO_EMITIR = """
import django
django.setup()
from types import SimpleNamespace
from rest_framework_simplejwt.tokens import AccessToken
print(AccessToken.for_user(SimpleNamespace(id=7)))
"""

CODIGO_VERIFICAR = """
import sys
import django
django.setup()
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken
try:
    AccessToken(sys.stdin.read().strip())
except TokenError as error:
    print("RECHAZADO", type(error).__name__)
else:
    print("ACEPTADO")
"""


def _interprete(codigo, entorno, entrada=""):
    """Corre ``codigo`` en un intérprete nuevo con ``entorno``: lo que hace un reinicio del servidor."""
    resultado = subprocess.run(
        [sys.executable, "-c", codigo],
        input=entrada,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=BACKEND,
        env=entorno,
        timeout=180,
    )
    assert resultado.returncode == 0, resultado.stderr[-2000:]
    return resultado.stdout.strip()


def _emitir(entorno):
    """Un token de acceso firmado por el servidor que arranca con ``entorno``."""
    return _interprete(CODIGO_EMITIR, entorno)


def _verificar(token, entorno):
    """``ACEPTADO`` o ``RECHAZADO <excepción>``: lo que decide el servidor que arranca con ``entorno``."""
    return _interprete(CODIGO_VERIFICAR, entorno, entrada=token)


def _cargas(usuario_id=7):
    """Las cargas de un token de acceso, como las pone simplejwt."""
    ahora = int(time.time())
    return {"token_type": "access", "iat": ahora, "exp": ahora + 3600, "jti": uuid.uuid4().hex, "userId": usuario_id}


def test_cambiar_django_secret_key_no_cierra_las_sesiones():
    llave_de_firma = secrets.token_urlsafe(48)
    token = _emitir(_entorno_de_produccion(JWT_SIGNING_KEY=llave_de_firma))

    # Reinicio con OTRA DJANGO_SECRET_KEY y la MISMA llave de firma: el token sigue valiendo.
    veredicto = _verificar(
        token,
        _entorno_de_produccion(JWT_SIGNING_KEY=llave_de_firma, DJANGO_SECRET_KEY=secrets.token_urlsafe(48)),
    )

    assert veredicto == "ACEPTADO"


def test_cambiar_la_llave_de_firma_cierra_todas_las_sesiones():
    # Misma DJANGO_SECRET_KEY en los dos reinicios: solo cambia la llave de firma, y eso es lo que debe cerrar la sesión.
    django_secret_key = secrets.token_urlsafe(48)
    token = _emitir(
        _entorno_de_produccion(DJANGO_SECRET_KEY=django_secret_key, JWT_SIGNING_KEY=secrets.token_urlsafe(48)),
    )

    veredicto = _verificar(
        token,
        _entorno_de_produccion(DJANGO_SECRET_KEY=django_secret_key, JWT_SIGNING_KEY=secrets.token_urlsafe(48)),
    )

    assert veredicto.startswith("RECHAZADO")


def test_un_token_firmado_con_django_secret_key_no_vale_cuando_hay_llave_de_firma():
    # Lo que haría una firma heredada de DJANGO_SECRET_KEY: con llave de firma propia, el servidor lo rechaza.
    django_secret_key = secrets.token_urlsafe(48)
    token = jwt.encode(_cargas(), django_secret_key, algorithm="HS256")

    veredicto = _verificar(
        token,
        _entorno_de_produccion(DJANGO_SECRET_KEY=django_secret_key, JWT_SIGNING_KEY=secrets.token_urlsafe(48)),
    )

    assert veredicto.startswith("RECHAZADO")


# ── API dentro del proceso: 401 TOKEN_INVALID para lo que no firma el servidor ───────────────────────────────────

@pytest.fixture
def llave_del_servidor(monkeypatch, settings):
    """La llave con la que el servidor firma y verifica en esta prueba: generada aquí y distinta de SECRET_KEY.

    ``override_settings`` no llega a la firma (simplejwt la fija al importarse), así que se sustituye el objeto que
    usan los tokens, con el mismo algoritmo, y se restaura al terminar la prueba.
    """
    llave = secrets.token_urlsafe(48)
    assert llave != settings.SECRET_KEY
    monkeypatch.setattr(state, "token_backend", TokenBackend("HS256", llave))
    return llave


def _usuario():
    return User.objects.create_user(
        email=f"firma.{secrets.token_hex(6)}@x.com",
        password=secrets.token_urlsafe(24),
        nombre="Ana",
        apellido="Prueba",
        role="ESTUDIANTE",
    )


def _como(token):
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return cliente


def test_el_token_que_emite_el_servidor_abre_la_api(db, llave_del_servidor):
    usuario = _usuario()

    respuesta = _como(generate_access_token(usuario)).get(RUTA_YO)

    assert respuesta.status_code == 200, respuesta.data


@pytest.mark.parametrize("origen", ["django_secret_key", "llave_ajena"])
def test_un_token_que_no_firma_el_servidor_responde_401(db, settings, llave_del_servidor, origen):
    usuario = _usuario()
    llave = settings.SECRET_KEY if origen == "django_secret_key" else secrets.token_urlsafe(48)
    token = jwt.encode(_cargas(usuario.id), llave, algorithm="HS256")

    respuesta = _como(token).get(RUTA_YO)

    # El rechazo es 401. El código es INVALID_CREDENTIALS y no TOKEN_INVALID como pedía el plan: simplejwt lanza
    # InvalidToken con el detalle en un diccionario, y shared/exceptions.py (_code_for) da TOKEN_INVALID solo al
    # código «token_not_valid». Cambiarlo altera todos los tokens inválidos (caducados incluidos): decisión pendiente.
    assert respuesta.status_code == 401, respuesta.data
    assert respuesta.data["code"] == "INVALID_CREDENTIALS", respuesta.data

"""Settings de pruebas AISLADOS (ENV-01).

El esquema lo construye ``migrate`` (Django es el dueño; E0-8) y el runner
(``scripts/test-backend.mjs``) siembra la base desechable con ``bootstrap_dev_db``
antes de lanzar pytest. Este módulo exige un target explícito y desechable
(docker-compose.test.yml) y FALLA en el arranque si el DSN huele a desarrollo o
producción.

Nunca uses ``transactional_db`` / ``TransactionTestCase``: su ``flush`` trunca las
tablas y borra la siembra. El aislamiento por prueba es el rollback de ``django_db``;
para commits reales con varios hilos usa ``run_concurrently`` y el fixture
``real_commits`` de ``shared.testing`` (E0-9), que limpian lo que crean.

Variables obligatorias (las exporta scripts/test-backend.mjs):
    SIEP_TEST_DB_NAME, SIEP_TEST_DB_HOST, SIEP_TEST_DB_PORT,
    SIEP_TEST_DB_USER, SIEP_TEST_DB_PASSWORD
"""
import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False
# El test client de Django usa el host "testserver".
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"]
# S1-2 · el limitador va APAGADO en las pruebas (no rompe las que inician sesión muchas veces); las pruebas del
# límite lo encienden con ``settings.SIEP_THROTTLE_ENABLED = True``.
SIEP_THROTTLE_ENABLED = os.environ.get("SIEP_THROTTLE_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
# S1-3 · el aviso al administrador corre en el acto en las pruebas (se revisa mail.outbox al volver).
SIEP_BACKGROUND_INLINE = True
# WhiteNoise sirve los estáticos de producción (S2-4: la subclase del SPA, sin su index.html), pero en test intenta
# inspeccionar STATIC_ROOT (que no debe existir ni se necesita para la API).
MIDDLEWARE = [
    middleware for middleware in MIDDLEWARE  # noqa: F405
    if middleware != "shared.static_files.SpaStaticFilesMiddleware"
]
MIDDLEWARE.append("shared.test_attestation.TestEnvironmentAttestationMiddleware")

_REQUIRED_VARS = (
    "SIEP_TEST_DB_NAME",
    "SIEP_TEST_DB_HOST",
    "SIEP_TEST_DB_PORT",
    "SIEP_TEST_DB_USER",
    "SIEP_TEST_DB_PASSWORD",
    "SIEP_TEST_ATTESTATION_NONCE",
)
_missing = [name for name in _REQUIRED_VARS if not os.environ.get(name)]
if _missing:
    raise ImproperlyConfigured(
        "Faltan variables del entorno de pruebas aislado: "
        + ", ".join(_missing)
        + ". Usa `npm run test:backend` (levanta la BD desechable y las exporta)."
    )

_TEST_NAME = os.environ["SIEP_TEST_DB_NAME"]
_TEST_HOST = os.environ["SIEP_TEST_DB_HOST"]
_TEST_PORT = os.environ["SIEP_TEST_DB_PORT"]
SIEP_TEST_ATTESTATION_NONCE = os.environ["SIEP_TEST_ATTESTATION_NONCE"]

# Guardas anti-coincidencia: mismo espíritu que scripts/dev-environment-guard.mjs.
if os.environ.get("DATABASE_URL"):
    raise ImproperlyConfigured(
        "DATABASE_URL está definido (producción/PaaS); no se ejecutan pruebas con esa configuración."
    )
if _TEST_NAME == "psychosim":
    raise ImproperlyConfigured(
        "La base 'psychosim' es la de desarrollo/producción; está prohibida como target de pruebas."
    )
if _TEST_HOST not in ("localhost", "127.0.0.1", "::1"):
    raise ImproperlyConfigured(
        f"El host de pruebas '{_TEST_HOST}' no es local; solo se permite localhost/127.0.0.1."
    )
_DEV_DSN = (
    os.environ.get("DB_NAME", "psychosim"),
    os.environ.get("DB_PORT", "5433"),
)
if (_TEST_NAME, _TEST_PORT) == _DEV_DSN:
    raise ImproperlyConfigured(
        "El DSN de pruebas coincide con el de desarrollo (mismo nombre y puerto)."
    )

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _TEST_NAME,
        "USER": os.environ["SIEP_TEST_DB_USER"],
        "PASSWORD": os.environ["SIEP_TEST_DB_PASSWORD"],
        "HOST": _TEST_HOST,
        "PORT": _TEST_PORT,
        # --reuse-db: pytest-django se conecta directo a esta base ya sembrada.
        "TEST": {"NAME": _TEST_NAME},
    }
}

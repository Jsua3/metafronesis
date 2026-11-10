"""Production settings.

Everything sensitive (SECRET_KEY, DB credentials, reflection encryption key) is
read from environment variables in ``base.py``; this module turns off DEBUG,
locks down ALLOWED_HOSTS/CORS, and fails fast if a critical secret is missing,
too short, too repetitive, a placeholder from the repository, or a copy of
another secret (S5-1: ``_validate_secret``; el error nombra la variable, nunca su valor).

Required environment variables:
    DJANGO_SECRET_KEY (≥ 50 caracteres, ≥ 20 distintos), REFLECTION_ENCRYPTION_KEY
    (≥ 32 caracteres, ≥ 20 distintos, distinta de DJANGO_SECRET_KEY), DJANGO_ALLOWED_HOSTS,
    DB_PASSWORD, SIEP_TRUSTED_PROXIES (entero ≥ 0: proxies de confianza delante de Django;
    sin valor por defecto), REFLECTION_ACTIVE_KEY (id de una llave de REFLECTION_KEYS, nunca
    local-aes-gcm-v1) y REFLECTION_KEYS (id=secreto separados por comas; cada secreto ≥ 32
    caracteres, ≥ 20 distintos y distinto de DJANGO_SECRET_KEY; S5-2), JWT_SIGNING_KEY (≥ 50 caracteres, ≥ 20 distintos,
    distinta de DJANGO_SECRET_KEY y de las llaves de reflexiones; S5-3).
Optional:
    CORS_ALLOWED_ORIGINS (comma-separated), DB_NAME/DB_USER/DB_HOST/DB_PORT,
    DJANGO_SECURE_SSL_REDIRECT (default "true": solo "false" lo apaga),
    SIEP_HSTS_SECONDS (default 3600: entero entre 0 y 63072000).
JWT_SECRET está obsoleto (S5-3): no firma nada y no se exige. La firma de sesión es JWT_SIGNING_KEY.
"""
import os
import re

from django.core.exceptions import ImproperlyConfigured


def _require_env(name):
    value = os.environ.get(name)
    if not value:
        raise ImproperlyConfigured(
            f"Environment variable {name} is required when DJANGO_SETTINGS_MODULE="
            "psychosim.settings.production"
        )
    return value


# S5-1 · Marcadores de los valores de ejemplo del repositorio (plantillas y desarrollo). Un secreto que contenga
# cualquiera de ellos, sin distinguir mayúsculas, es una plantilla sin cambiar: producción lo rechaza.
EXAMPLE_SECRET_MARKERS = (
    "cambia-esto",
    "change-in-production",
    "django-insecure",
    "psychosim-jwt-secret",
    "dev-only",
    "changeme",
    "tu-secreto",
)


# S5-1 · Un secreto de producción se comprueba al arrancar. El error NOMBRA la variable y la causa, pero NUNCA muestra
# el valor leído ni parte de él: el mensaje va a los registros de la plataforma.
def _validate_secret(name, value, *, min_length, distinct_from=()):
    """``distinct_from`` son pares ``(nombre, valor)`` de otros secretos que este no puede repetir."""
    if len(value) < min_length:
        raise ImproperlyConfigured(
            # BORRADOR
            f"{name} es demasiado corta (mínimo {min_length} caracteres)."
        )
    if len(set(value)) < 20:
        raise ImproperlyConfigured(
            # BORRADOR
            f"{name} tiene muy pocos caracteres distintos (mínimo 20)."
        )
    if any(marker in value.lower() for marker in EXAMPLE_SECRET_MARKERS):
        raise ImproperlyConfigured(
            # BORRADOR
            f"{name} es un valor de ejemplo del repositorio: genera uno propio."
        )
    for other_name, other_value in distinct_from:
        if value == other_value:
            raise ImproperlyConfigured(
                # BORRADOR
                f"{name} debe ser distinta de {other_name}."
            )


#: R1b · variables que Railway inyecta en sus servicios: basta una con valor para saber que el arranque es en Railway.
RAILWAY_VARIABLES = ("RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "RAILWAY_PUBLIC_DOMAIN")


def _en_railway():
    return any(os.environ.get(name, "").strip() for name in RAILWAY_VARIABLES)


# S1-1 · base.py convierte SIEP_TRUSTED_PROXIES con int() al importarse: un valor que no sea un entero ≥ 0 se
# rechaza AQUÍ, antes del ``from .base import *``, para que la causa salga como ImproperlyConfigured.
def _validate_trusted_proxies():
    value = _require_env("SIEP_TRUSTED_PROXIES").strip()
    try:
        valid = int(value) >= 0
    except ValueError:
        valid = False
    if not valid:
        raise ImproperlyConfigured(
            # BORRADOR
            "SIEP_TRUSTED_PROXIES debe ser un entero ≥ 0: número de proxies de confianza delante de Django "
            "(0 = ninguno)."
        )
    # R1b · en Railway siempre hay un proxy delante de Django. Con 0, Django toma la IP del borde como la de todos los
    # clientes y los límites por IP se vuelven un cierre global. El mensaje explica la causa y no muestra el valor.
    if int(value) == 0 and _en_railway():
        raise ImproperlyConfigured(
            # BORRADOR
            "SIEP_TRUSTED_PROXIES no puede ser 0 en Railway: hay un proxy delante de Django. Con 0, todos los clientes "
            "comparten una sola IP y los límites por IP se vuelven un cierre global. Mide el número de proxies en el "
            "primer despliegue (en Railway suele ser 1)."
        )


_validate_trusted_proxies()

from .base import *  # noqa

DEBUG = False


def _split_csv(value):
    return [item.strip() for item in (value or "").split(",") if item.strip()]


# Hosts permitidos: lo configurado en DJANGO_ALLOWED_HOSTS MÁS el dominio público
# que Railway inyecta automáticamente (RAILWAY_PUBLIC_DOMAIN). Así el deploy
# funciona aunque la variable esté vacía o desactualizada tras generar el dominio.
_railway_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip()
ALLOWED_HOSTS = _split_csv(os.environ.get("DJANGO_ALLOWED_HOSTS"))
if _railway_domain and _railway_domain not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_railway_domain)
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "Define DJANGO_ALLOWED_HOSTS (o despliega en Railway, que provee "
        "RAILWAY_PUBLIC_DOMAIN) para psychosim.settings.production"
    )
if "*" in ALLOWED_HOSTS:
    # R1b · un comodín deja pasar cualquier cabecera Host: se listan los dominios exactos. El valor no entra en el mensaje.
    raise ImproperlyConfigured(
        # BORRADOR
        "DJANGO_ALLOWED_HOSTS no admite comodines: lista los dominios exactos (valor no mostrado)."
    )

# CSRF: confía en el origen https del dominio público (por si algún flujo usa CSRF).
CSRF_TRUSTED_ORIGINS = [f"https://{h}" for h in ALLOWED_HOSTS if h and h != "*"]

# Railway sondea el healthcheck (/api/health) con «Host: healthcheck.railway.app»: sin este
# host Django responde 400 (DisallowedHost) y el despliegue nunca se promueve. Va DESPUÉS de
# calcular CSRF_TRUSTED_ORIGINS: es un host de sondeo, no un origen de navegador.
ALLOWED_HOSTS.append("healthcheck.railway.app")

# base.py already read SECRET_KEY from DJANGO_SECRET_KEY; require it explicitly
# and refuse the insecure development default.
SECRET_KEY = _require_env("DJANGO_SECRET_KEY")  # noqa: F811
if SECRET_KEY == "django-insecure-change-in-production":
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must not be the insecure default in production")
_validate_secret("DJANGO_SECRET_KEY", SECRET_KEY, min_length=50)
# S5-1 · La llave de las reflexiones es OBLIGATORIA y propia: ya no cae a JWT_SECRET.
REFLECTION_ENCRYPTION_KEY = _require_env("REFLECTION_ENCRYPTION_KEY")
_validate_secret(
    "REFLECTION_ENCRYPTION_KEY",
    REFLECTION_ENCRYPTION_KEY,
    min_length=32,
    distinct_from=(("DJANGO_SECRET_KEY", SECRET_KEY),),
)
# S5-2 · Llaves versionadas: la ACTIVA cifra todo lo nuevo, así que es obligatoria, debe estar en REFLECTION_KEYS y no puede
# ser la heredada (producción no cifra sin datos asociados). Cada secreto cumple S5-1. REFLECTION_ENCRYPTION_KEY sigue exigida
# para leer las filas viejas. Los errores nombran la variable y la causa, nunca el valor (ni el id de la activa).
REFLECTION_ACTIVE_KEY = _require_env("REFLECTION_ACTIVE_KEY").strip()
if not REFLECTION_ACTIVE_KEY:
    raise ImproperlyConfigured(
        # BORRADOR
        "REFLECTION_ACTIVE_KEY es obligatoria: el id de la llave con la que se cifran las reflexiones nuevas."
    )
if REFLECTION_ACTIVE_KEY == "local-aes-gcm-v1":
    raise ImproperlyConfigured(
        # BORRADOR
        "REFLECTION_ACTIVE_KEY no puede ser local-aes-gcm-v1 en producción: cifra con una llave de REFLECTION_KEYS."
    )
if REFLECTION_ACTIVE_KEY not in REFLECTION_KEYS:
    raise ImproperlyConfigured(
        # BORRADOR
        "REFLECTION_ACTIVE_KEY debe ser el id de una llave de REFLECTION_KEYS (valor no mostrado)."
    )
for _posicion, _secreto_reflexion in enumerate(REFLECTION_KEYS.values(), start=1):
    _validate_secret(
        f"REFLECTION_KEYS (par {_posicion})",
        _secreto_reflexion,
        min_length=32,
        distinct_from=(("DJANGO_SECRET_KEY", SECRET_KEY),),
    )

# La base de datos llega como DATABASE_URL (Railway) o como variables DB_*.
# Solo exigimos DB_PASSWORD cuando NO se usa DATABASE_URL.
if not os.environ.get("DATABASE_URL"):
    _require_env("DB_PASSWORD")
# S5-3 · La llave que firma las sesiones es OBLIGATORIA y propia: con las reglas de S5-1 y distinta de DJANGO_SECRET_KEY y
# de toda llave de cifrado de las reflexiones. base.py la lee de la misma variable, así que lo que aquí se valida es lo que firma.
JWT_SIGNING_KEY = _require_env("JWT_SIGNING_KEY").strip()
if not JWT_SIGNING_KEY:
    raise ImproperlyConfigured(
        # BORRADOR
        "JWT_SIGNING_KEY es obligatoria: la llave con la que se firman las sesiones (valor no mostrado)."
    )
_validate_secret(
    "JWT_SIGNING_KEY",
    JWT_SIGNING_KEY,
    min_length=50,
    distinct_from=(
        ("DJANGO_SECRET_KEY", SECRET_KEY),
        ("REFLECTION_ENCRYPTION_KEY", REFLECTION_ENCRYPTION_KEY),
        *(
            (f"REFLECTION_KEYS (par {_posicion})", _secreto_reflexion)
            for _posicion, _secreto_reflexion in enumerate(REFLECTION_KEYS.values(), start=1)
        ),
    ),
)
# S5-1 · JWT_SECRET ya no es obligatorio: no firma nada. La firma de sesión es JWT_SIGNING_KEY (S5-3).

# CORS — al servir el SPA desde el mismo servicio Django el origen es el mismo y
# no hace falta CORS; si el frontend vive en otro dominio, se listan aquí.
CORS_ALLOWED_ORIGINS = _split_csv(os.environ.get("CORS_ALLOWED_ORIGINS"))

# ── Correo (E2-12) ─────────────────────────────────────────────────────────────────────────────
# El correo lleva avisos y la contraseña temporal de las cuentas aprobadas: con el backend de
# consola esa contraseña iría al registro de la plataforma, así que producción exige un backend
# real (o declararlo explícitamente con SIEP_ALLOW_CONSOLE_EMAIL=true) y un destino para el aviso
# de solicitudes de acceso (o declarar que no lo hay con ACCESS_REQUEST_NOTIFY_DISABLED=true).
def _declared(name):
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


if MAILERS["default"]["BACKEND"].endswith("console.EmailBackend") and not _declared("SIEP_ALLOW_CONSOLE_EMAIL"):
    raise ImproperlyConfigured(
        "Define EMAIL_BACKEND (y EMAIL_HOST…) para el correo en producción, o declara "
        "SIEP_ALLOW_CONSOLE_EMAIL=true: el backend de consola escribe en el registro la "
        "contraseña temporal de las cuentas aprobadas."
    )
_notify = _split_csv(os.environ.get("ACCESS_REQUEST_NOTIFY_EMAILS"))
if _declared("ACCESS_REQUEST_NOTIFY_DISABLED"):
    ACCESS_REQUEST_NOTIFY_EMAILS = []
elif not _notify:
    raise ImproperlyConfigured(
        "Define ACCESS_REQUEST_NOTIFY_EMAILS (correos separados por comas que reciben el aviso de "
        "una solicitud de acceso) o declara ACCESS_REQUEST_NOTIFY_DISABLED=true."
    )
else:
    ACCESS_REQUEST_NOTIFY_EMAILS = _notify

# HTTPS forzado (S2-2). Railway termina TLS en el borde y declara el esquema en X-Forwarded-Proto, así que Django
# redirige a https por defecto: solo DJANGO_SECURE_SSL_REDIRECT=false lo apaga. /api/health queda exento a propósito:
# Railway lo sondea por HTTP plano con Host: healthcheck.railway.app, y un 301 ahí impediría promover el despliegue.
SECURE_SSL_REDIRECT = os.environ.get("DJANGO_SECURE_SSL_REDIRECT", "true").strip().lower() != "false"
SECURE_REDIRECT_EXEMPT = [r"^api/health$"]

# HSTS escalonado (S2-2): SIEP_HSTS_SECONDS sube por la escalera 3600 → 86400 → 604800 → 15552000, y cada subida
# se hace solo tras comprobar la redirección y una semana sin problemas (docs/operacion/despliegue-railway.md).
_HSTS_MAX_SECONDS = 63072000  # 2 años: el tope que admite SIEP_HSTS_SECONDS.


def _hsts_seconds():
    raw = os.environ.get("SIEP_HSTS_SECONDS", "3600").strip()
    # Solo un entero decimal. El valor leído no entra en el mensaje ni como excepción encadenada.
    if not re.fullmatch(r"-?[0-9]{1,20}", raw):
        raise ImproperlyConfigured(
            # BORRADOR
            "SIEP_HSTS_SECONDS no es un entero (valor no mostrado): debe ser un número de segundos entre 0 y 63072000."
        )
    segundos = int(raw)
    if not 0 <= segundos <= _HSTS_MAX_SECONDS:
        raise ImproperlyConfigured(
            # BORRADOR
            "SIEP_HSTS_SECONDS está fuera del rango 0-63072000 (valor no mostrado)."
        )
    return segundos


SECURE_HSTS_SECONDS = _hsts_seconds()
# No se activan hasta fijar el dominio definitivo (decisión SD-5): ver docs/operacion/despliegue-railway.md.
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False

# HTTPS hardening (assumes a TLS-terminating reverse proxy in front).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

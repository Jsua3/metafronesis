"""Shared Django settings for the PsychoSim (SIEP) backend.

Django owns the PostgreSQL schema: every table is created and evolved by the
migrations of each app (E0-8); the constraints that production enforces live in
the models' ``Meta`` and are pinned by ``test_schema_contract.py``.
"""
import logging
import os
import re
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import CSP

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY", "django-insecure-change-in-production"
)

INSTALLED_APPS = [
    # auth + contenttypes are required by djangorestframework-simplejwt (it
    # imports django.contrib.auth.models at load time). Our user model is custom
    # (no PermissionsMixin); these apps only add Django's small housekeeping
    # tables (content_type/permission). The running server never auto-creates
    # tables (only migrate does).
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "drf_spectacular",
    "apps.users",
    "apps.grupos",
    "apps.simulation",
    "apps.progression",
    "apps.security",
    "apps.privacy",
    "apps.biblioteca",

    # Ola 1 · autoria
    "apps.autoria",

    # Ola 1 · publicacion
    "apps.publicacion",

    # Ola 1 · reportes
    "apps.reportes",

    # Ola 1 · revision
    "apps.revision",

    # Ola 2 · notificaciones
    "apps.notificaciones",

    # Ola 2 · ia
    "apps.ia",

    # Ola 2 · auditoria
    "apps.auditoria",

    # Ola 2 · sesiones
]

MIDDLEWARE = [
    # Primero: cubre toda la cadena para medir la duración y fijar X-Request-Id.
    "shared.middleware.RequestContextMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # S2-6a · tope del cuerpo ANTES de leerlo. Va encima de las cabeceras y de WhiteNoise, así que su 413 no lleva
    # las cabeceras de S2-1 ni las de CORS (sale antes de llegar a esos middleware).
    "shared.body_limit.BodyLimitMiddleware",
    # S2-1 · cabeceras base. Van ENCIMA de WhiteNoise: WhiteNoise responde los estáticos y corta la cadena,
    # así que lo que quede debajo no llega a esas respuestas.
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "shared.security_headers.SecurityHeadersMiddleware",
    # S2-3a / S2-4 · política de contenido (RNF-002). Pone ``Content-Security-Policy-Report-Only`` (SECURE_CSP_REPORT_ONLY,
    # la inicial) y, con SIEP_CSP_ENFORCE, ``Content-Security-Policy`` (SECURE_CSP, la que se aplica, con nonce). Va encima
    # de WhiteNoise.
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
    # WhiteNoise sirve los estáticos del SPA (Angular) y del backend en producción sin necesidad de un servidor web
    # aparte. S2-4: la subclase del SPA NUNCA sirve index.html (ni «/» ni «/index.html»): el HTML lo sirve siempre la vista
    # shared.spa.spa_index, que escribe el nonce de la petición.
    "shared.static_files.SpaStaticFilesMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    # S7-1a · un NUL (0x00) en la ruta o la consulta es un 400, no un 500 de PostgreSQL (el cuerpo JSON lo revisa su parser).
    "shared.text_guard.NulByteMiddleware",
    # Binds the request to a thread-local for audit-trail actor/IP capture.
    "apps.simulation.middleware.AuditContextMiddleware",
]

# S2-1 · cabeceras base (plan 03). Django las pone en SecurityMiddleware y XFrameOptionsMiddleware; las de la API
# y del portal (Permissions-Policy, no-store, X-Robots-Tag) en shared.security_headers.
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
# El valor por defecto de Django (same-origin) puede cortar la ventana emergente de Google Identity Services con FedCM apagado.
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups"

ROOT_URLCONF = "psychosim.urls"
WSGI_APPLICATION = "psychosim.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        # S2-4 · ``csp`` expone el nonce de la petición a las plantillas. SIEP no renderiza plantillas (el HTML del SPA lo
        # escribe shared.spa.spa_index), pero Django avisa (security.W027) si la política lleva nonce y falta el procesador.
        "OPTIONS": {"context_processors": ["django.template.context_processors.csp"]},
    }
]
AUTH_USER_MODEL = "users.CustomUser"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# En Railway (y otros PaaS) la base de datos se inyecta como DATABASE_URL.
# Si existe, se usa; si no, se arma con las variables DB_* (desarrollo local).
_DATABASE_URL = os.environ.get("DATABASE_URL")
if _DATABASE_URL:
    import dj_database_url

    DATABASES = {
        "default": dj_database_url.parse(
            _DATABASE_URL, conn_max_age=600, conn_health_checks=True
        ),
    }
    # Sin tope, una BD inalcanzable bloquea /api/health ~130 s (el valor por defecto de
    # psycopg) y gunicorn mata el worker a los 120 s.
    DATABASES["default"].setdefault("OPTIONS", {}).setdefault("connect_timeout", 5)
    DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DB_NAME", "psychosim"),
            "USER": os.environ.get("DB_USER", "psychosim"),
            "PASSWORD": os.environ.get("DB_PASSWORD", "psychosim_secret"),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5433"),
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"connect_timeout": 5},
        }
    }

# Spring uses BCrypt ($2a/$2b). Keep BCrypt first so newly created users are
# written in a format Spring can also verify; CustomUser.check_password also
# handles raw BCrypt hashes already present in the Flyway-seeded ``users`` table.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.BCryptPasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # JWT + el cambio de contraseña obligatorio de las cuentas aprobadas (E2-9).
        "apps.users.authentication.SiepJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # JSON solo como objeto (``request.data.get`` es la norma de las vistas) + formularios.
    "DEFAULT_PARSER_CLASSES": [
        "shared.parsers.ObjectJSONParser",
        "shared.parsers.ObjectFormParser",
        "shared.parsers.ObjectMultiPartParser",
    ],
    # S2-4 · Solo JSON: la API navegable de DRF devuelve HTML con <script> y <style> en línea, que la política de
    # contenido en vigor degrada, y ninguna parte de SIEP la usa (el SPA, las pruebas y curl hablan JSON).
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_SCHEMA_CLASS": "shared.openapi.SiepAutoSchema",
    "EXCEPTION_HANDLER": "shared.exceptions.custom_exception_handler",
}

# La revisión del caso puede viajar en la cabecera ``X-Case-Revision`` (E2-6): con el frontend en
# otro origen el navegador hace antes una consulta de verificación (preflight) y debe constar.
from corsheaders.defaults import default_headers  # noqa: E402

CORS_ALLOW_HEADERS = (*default_headers, "x-case-revision")

# S5-3 · Llave que FIRMA los tokens de sesión (simplejwt). Va aparte de DJANGO_SECRET_KEY: rotar esta última no cierra las
# sesiones de SIEP, y rotar JWT_SIGNING_KEY sí las cierra todas. Producción la exige (production.py); en desarrollo y
# pruebas, sin ella, cae a SECRET_KEY para no cambiar nada de lo existente.
JWT_SIGNING_KEY = os.environ.get("JWT_SIGNING_KEY", "").strip() or SECRET_KEY

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        hours=int(os.environ.get("JWT_EXPIRATION_HOURS", "8"))
    ),
    "TOKEN_OBTAIN_SERIALIZER": "apps.users.serializers.PsychoSimTokenObtainSerializer",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "userId",
    # S5-3 · Firma explícita: un cambio de algoritmo o de llave tiene que verse aquí y no ser silencioso.
    "ALGORITHM": "HS256",
    "SIGNING_KEY": JWT_SIGNING_KEY,
    "VERIFYING_KEY": "",
}

# S5-3 · JWT_SECRET está obsoleto: ya no firma nada ni lo exige producción. Se conserva el nombre por compatibilidad de
# entorno y no lleva valor por defecto (el literal público que tuvo se retiró en S5-1).
JWT_SECRET = os.environ.get("JWT_SECRET", "")
# S5-1 · Llave de cifrado en reposo de las reflexiones. Producción la exige (production.py) y NO la hereda de
# JWT_SECRET. Aquí solo hay una llave de DESARROLLO inconfundible: el marcador «dev-only» hace que producción la rechace.
REFLECTION_ENCRYPTION_KEY = os.environ.get(
    "REFLECTION_ENCRYPTION_KEY", "dev-only-reflection-key-never-use-in-production"
)
# S5-2 · Llaves versionadas de las reflexiones (rotación sin perder bitácoras). REFLECTION_KEYS es ``id1=secreto1,id2=secreto2``
# (ids ``[A-Za-z0-9_.-]{1,40}``); REFLECTION_ACTIVE_KEY es el id con el que se CIFRA. ``local-aes-gcm-v1`` es la llave heredada
# (REFLECTION_ENCRYPTION_KEY): siempre se puede LEER con ella y es la activa por defecto en desarrollo y pruebas.
# Producción (production.py) exige una activa versionada.
_REFLECTION_KEY_ID = re.compile(r"[A-Za-z0-9_.-]{1,40}")


def _parse_reflection_keys(raw):
    """``id1=secreto1,id2=secreto2`` → dict. Ignora espacios y trozos vacíos. Un par mal formado detiene el arranque
    nombrando su POSICIÓN: ni su id ni su secreto aparecen en el mensaje (el trozo entero puede ser un secreto pegado)."""
    claves = {}
    for posicion, trozo in enumerate(raw.split(","), start=1):
        par = trozo.strip()
        if not par:
            continue
        id_, separador, secreto = par.partition("=")
        id_, secreto = id_.strip(), secreto.strip()
        if not separador or not _REFLECTION_KEY_ID.fullmatch(id_) or not secreto:
            raise ImproperlyConfigured(
                # BORRADOR
                f"REFLECTION_KEYS: el par {posicion} no tiene la forma id=secreto (valor no mostrado)."
            )
        if id_ in claves:
            raise ImproperlyConfigured(
                # BORRADOR
                f"REFLECTION_KEYS: el par {posicion} repite un id ya declarado (valor no mostrado)."
            )
        claves[id_] = secreto
    return claves


REFLECTION_KEYS = _parse_reflection_keys(os.environ.get("REFLECTION_KEYS", ""))
# Vacía o solo con espacios cuenta como ausente: la activa es la heredada.
REFLECTION_ACTIVE_KEY = os.environ.get("REFLECTION_ACTIVE_KEY", "").strip() or "local-aes-gcm-v1"
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
# S1-3 · dominios de correo que pueden entrar con Google, separados por comas. Vacía = sin restricción (SD-14).
GOOGLE_ALLOWED_DOMAINS = [
    dominio.strip().lower()
    for dominio in os.environ.get("GOOGLE_ALLOWED_DOMAINS", "").split(",")
    if dominio.strip()
]
# E2-9 · Contraseñas: longitud mínima y lista de contraseñas comunes (LS-16). Se aplican donde
# alguien fija una (alta por el ADMIN, registro, cambio de contraseña); las cuentas que importa
# el docente ya no llevan contraseña: nacen pendientes de aprobación (RN-10, D-5).
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    # S1-5 · la clave no puede parecerse a la cuenta (correo, parte local, nombre, apellido y sus combinaciones).
    {"NAME": "apps.users.password_validators.NotSimilarToAccountValidator"},
    # BCrypt solo admite 72 bytes: más largo es un 400 con su campo, no un 500.
    {"NAME": "apps.users.password_validators.MaximumLengthBytesValidator"},
]

# E2-9 · Límites de la importación de estudiantes (.xlsx): se comprueban ANTES de leer el
# libro (tamaño, firma ZIP, tamaño descomprimido, filas y tiempo).
IMPORT_MAX_BYTES = int(os.environ.get("SIEP_IMPORT_MAX_BYTES", str(2 * 1024 * 1024)))
IMPORT_MAX_UNCOMPRESSED_BYTES = int(os.environ.get("SIEP_IMPORT_MAX_UNCOMPRESSED_BYTES", str(8 * 1024 * 1024)))
IMPORT_MAX_ZIP_MEMBERS = 64
IMPORT_MAX_ROWS = int(os.environ.get("SIEP_IMPORT_MAX_ROWS", "1000"))
IMPORT_MAX_COLUMNS = int(os.environ.get("SIEP_IMPORT_MAX_COLUMNS", "32"))
IMPORT_MAX_SECONDS = float(os.environ.get("SIEP_IMPORT_MAX_SECONDS", "5"))
# Asistente de IA (RF-027): APAGADO por defecto. Enviaría la pregunta y el contexto
# del caso a un proveedor externo (privacidad, Ley 1581/2012); solo se enciende con
# un valor explícito en AI_ASSISTANT_ENABLED. Apagado, la vista responde 404.
def _env_flag(name, default=False):
    """Bandera booleana por variable de entorno: 1/true/yes/on la encienden; ausente, ``default``."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


AI_ASSISTANT_ENABLED = _env_flag("AI_ASSISTANT_ENABLED")
AI_ASSISTANT_PROVIDER = os.environ.get("AI_ASSISTANT_PROVIDER", "")
AI_ASSISTANT_API_KEY = os.environ.get("AI_ASSISTANT_API_KEY", "")
AI_ASSISTANT_MODEL = os.environ.get("AI_ASSISTANT_MODEL", "gpt-4o-mini")
AI_AUTHORING_ENABLED = _env_flag("AI_AUTHORING_ENABLED")
AI_AUTHORING_PROVIDER = os.environ.get("AI_AUTHORING_PROVIDER", "")
AI_AUTHORING_API_KEY = os.environ.get("AI_AUTHORING_API_KEY", "")
AI_AUTHORING_MODEL = os.environ.get("AI_AUTHORING_MODEL", "claude-haiku-5-5")
AI_AUTHORING_DAILY_LIMIT_PER_USER = int(os.environ.get("AI_AUTHORING_DAILY_LIMIT_PER_USER", "200"))


#: Valores que APAGAN un interruptor de seguridad «cerrado» (sin mayúsculas ni espacios). Cualquier otro valor lo enciende.
_VALORES_DE_APAGADO = frozenset({"0", "false", "no", "off"})
_VALORES_DE_ENCENDIDO = frozenset({"1", "true", "yes", "on"})


def _env_flag_cerrada(name, default=True):
    """Interruptor de seguridad que falla CERRADO (R1b, S1-2 y S1-4): ausente o vacío → ``default``; ``0/false/no/off`` →
    apagado; cualquier otro valor → encendido, y se avisa UNA vez en el registro sin mostrar el valor. Un error de tecleo
    («ture») no apaga nada."""
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    if raw in _VALORES_DE_APAGADO:
        return False
    if raw not in _VALORES_DE_ENCENDIDO:
        logging.getLogger("siep.security").warning(
            "valor_de_interruptor_no_reconocido",
            extra={"fields": {"event": "valor_de_interruptor_no_reconocido", "variable": name}},
        )
    return True


def _entero_env(name, default, minimo):
    """Entero por variable de entorno (S1-5). Ausente o vacía, ``default``; un valor que no sea un entero ≥ ``minimo``
    detiene el arranque. El valor recibido no entra en el mensaje: puede ser un secreto puesto en la variable equivocada."""
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    if not re.fullmatch(r"[0-9]{1,9}", raw) or int(raw) < minimo:
        raise ImproperlyConfigured(
            # BORRADOR
            f"{name} debe ser un entero ≥ {minimo} (valor no mostrado)."
        )
    return int(raw)


# ─── Banderas del contrato expand → migrate → contract (plan estructural §2.8, E5-10) ────
# Lo nuevo ya está en el servidor y `test_contract_closure.py` recorre el ciclo completo con todas en su valor final.
# Una bandera arranca en su valor FINAL cuando el cliente visual ya migró (F9-10: REVIEW_WORKFLOW_STRICT y
# REVISION_REQUIRED) y en su valor HEREDADO mientras algo del cliente todavía depende de lo viejo (ATTEMPT_START_STRICT
# espera a F10-9). Cada una dice abajo qué hace en cada estado; `CONTRACT_FLAGS_REGISTRY`
# dice a qué valor van, qué las bloquea hoy y quién las retira. Una variable `SIEP_<BANDERA>=0` apaga una encendida
# (interruptor de emergencia: el camino heredado sigue en el servidor hasta que el usuario decida borrarlo).
#: E1-1 · ATTEMPT_START_STRICT. Encendida: con un intento abierto, `forceNew` de un ESTUDIANTE → 409
#: ATTEMPT_ALREADY_OPEN con el id del abierto (RN-07: el estudiante reanuda; solo el docente lo reemplaza).
#: Apagada: `forceNew` cierra el abierto como REPLACED y empieza otro (la ruta heredada de «Reintentar caso»).
ATTEMPT_START_STRICT = _env_flag("SIEP_ATTEMPT_START_STRICT")
#: E2-5 · REVIEW_WORKFLOW_STRICT. Encendida: la publicación pasa por revisión: solo se publica desde `IN_REVIEW`
#: (`POST …/publish` sobre un borrador → 409 REVIEW_REQUIRED), con la lista completa de siete ítems y la constancia de
#: revisión de contenido de Psicología (409 CASE_NOT_PUBLISHABLE con ETHICS.NO_CONTENT_REVIEW si falta; 400
#: CONTENT_REVIEW_REQUIRED si viene incompleta, S3-3). Apagada: `/publish` del ADMIN sigue publicando un borrador, la
#: constancia es opcional y solo los seis ítems originales son obligatorios.
#: ENCENDIDA POR DEFECTO desde F9-10 (valor final): el cliente publica por el ciclo de vida con la constancia.
REVIEW_WORKFLOW_STRICT = _env_flag("SIEP_REVIEW_WORKFLOW_STRICT", default=True)
#: E2-6 · REVISION_REQUIRED. Encendida: `revision` es obligatoria en toda mutación de autoría (400 REVISION_REQUIRED
#: si falta). Apagada: es opcional pero, cuando viene y está vencida, el servidor responde 409 REVISION_CONFLICT.
#: ENCENDIDA POR DEFECTO desde F9-10 (valor final): el editor y los fixtures e2e mandan la revisión en cada mutación.
REVISION_REQUIRED = _env_flag("SIEP_REVISION_REQUIRED", default=True)
#: E2-10 · INVITATIONS_AUTO_ACCEPT: PUENTE transitorio. Encendida: invitar a un estudiante lo une al grupo de una vez
#: (`ACTIVE`), sin aceptación ni correo, como hasta E1. Apagada (valor final, decisión 22): la invitación queda
#: `INVITED` hasta que el estudiante responde.
INVITATIONS_AUTO_ACCEPT = _env_flag("SIEP_INVITATIONS_AUTO_ACCEPT")

#: Una entrada por bandera: `target_contract` es el valor al que va; `retirement_gate` el hito que la retira;
#: `blocked_by` qué impide encenderla HOY (vacío si ya está en su valor final) y `owner` quién la retira. Lo medido
#: lo fue el 2026-10-17 corriendo el subconjunto e2e de CI con la bandera encendida; lo vuelve a comprobar quien la
#: encienda. `test_contract_closure.py` exige las cuatro entradas completas.
CONTRACT_FLAGS_REGISTRY = {
    "ATTEMPT_START_STRICT": {
        "env": "SIEP_ATTEMPT_START_STRICT",
        "target_contract": True,
        "retirement_gate": "F9-10 (retiro de forceNew en cliente)",
        "blocked_by": (
            "El juego manda `forceNew` en «Reintentar caso» e «Iniciar nuevo intento» (`SimulationService.startAttempt`): "
            "encendida, el subconjunto e2e de CI recibe 41 respuestas 409 de `POST /api/simulation/attempts` y falla en "
            "unas treinta pruebas; la carga nocturna (`scripts/load/aula.mjs`) también abre cada ciclo con `forceNew`."
        ),
        "owner": "sesión visual (F9-10); la carga nocturna, estructural",
    },
    "REVIEW_WORKFLOW_STRICT": {
        "env": "SIEP_REVIEW_WORKFLOW_STRICT",
        "target_contract": True,
        "retirement_gate": "F9-10 (cierre de F10-6† en e2e) — ENCENDIDA por defecto",
        "blocked_by": None,
        "owner": "sesión visual (F9-10); borrar el camino heredado del servidor lo decide el usuario",
    },
    "REVISION_REQUIRED": {
        "env": "SIEP_REVISION_REQUIRED",
        "target_contract": True,
        "retirement_gate": "F9-10 (cabecera X-Case-Revision obligatoria en todos los clientes) — ENCENDIDA por defecto",
        "blocked_by": None,
        "owner": "sesión visual (F9-10); borrar el camino heredado del servidor lo decide el usuario",
    },
    "INVITATIONS_AUTO_ACCEPT": {
        "env": "SIEP_INVITATIONS_AUTO_ACCEPT",
        "target_contract": False,
        "retirement_gate": "Apagada desde E2-10; el puente se borra con F10-8†",
        "blocked_by": None,
        "owner": "estructural (el puente se borra cuando el visual tenga la bandeja de invitaciones, F10-8†)",
    },
}
#: R16 · máximo de avisos de invitación que sale de UNA importación (el resto queda invitado y lo
#: ve en su bandeja): acota el tiempo de la petición y el volumen de correo.
INVITATION_EMAIL_LIMIT = int(os.environ.get("SIEP_INVITATION_EMAIL_LIMIT", "25"))

#: E5-7 · retención mínima de auditoría (≥ 12 meses = 360 días por defecto, RNF-007).
AUDIT_RETENTION_DAYS = max(360, int(os.environ.get("AUDIT_RETENTION_DAYS", "360")))

# ── Analítica de aprendizaje (E6-5) ──────────────────────────────────────────────────────────────────
# Definiciones operativas en BORRADOR hasta que Psicología las confirme (mesa §A20, `docs/operacion/analitica-de-
# aprendizaje.md`). `apps.simulation.assessment.definitions` las lee al llamar y normaliza lo inválido.
#: Nivel formativo desde el que un desempeño cuenta como «Aceptable» (EN_INICIO, EN_PROCESO, LOGRADO o DESTACADO).
ACCEPTABLE_LEVEL = os.environ.get("SIEP_ACCEPTABLE_LEVEL", "LOGRADO")
#: Estudiantes distintos mínimos para publicar un agregado; nunca baja de 5 (piso de privacidad).
MIN_CELL_SIZE = os.environ.get("SIEP_MIN_CELL_SIZE", "5")
#: Qué cuenta como reflexión en un cierre: `ANY` (≥ 1 nota) o `PER_DECISION_SCENE` (una por escena con decisión).
REFLECTION_DEFINITION = os.environ.get("SIEP_REFLECTION_DEFINITION", "ANY")
#: Encuesta breve opcional al terminar un intento (RQ-NEG-004): APAGADA hasta que Psicología la apruebe; apagada,
#: sus endpoints responden 404 y la analítica no calcula la satisfacción.
ATTEMPT_FEEDBACK_SURVEY = _env_flag("SIEP_ATTEMPT_FEEDBACK_SURVEY")

#: S1-1 · proxies de confianza delante de Django (SIEP-RNF-02). 0 = no se confía en ninguna cabecera
#: ``X-Forwarded-For``: la IP de la auditoría y de los límites es ``REMOTE_ADDR``. Producción la exige y no tiene
#: valor por defecto (psychosim/settings/production.py la valida antes de importar este módulo).
SIEP_TRUSTED_PROXIES = int(os.environ.get("SIEP_TRUSTED_PROXIES", "0"))

#: S1-2 · limitador compartido de peticiones (DJA-2). Interruptor de emergencia: por defecto encendido; con él
#: apagado, ``apps.security.limiter`` no toca la base y ninguna petición recibe 429. Las pruebas lo apagan en
#: ``psychosim/settings/test.py``.
SIEP_THROTTLE_ENABLED = _env_flag_cerrada("SIEP_THROTTLE_ENABLED", default=True)

#: S1-4 · sesión revocable: cada token lleva la época de sesión de su dueño (claim ``ep``) y el servidor rechaza los
#: anteriores a la época actual. Encendida por defecto; apagada, la época se emite pero no se exige (interruptor de
#: emergencia: no lo apagues en producción).
SIEP_SESSION_EPOCH_ENFORCE = _env_flag_cerrada("SIEP_SESSION_EPOCH_ENFORCE", default=True)

#: P6 · Carpeta de la biblioteca de lugares (``<BIBLIOTECA_DIR>/escenarios/indice.json`` y un ``escenario.json`` por
#: lugar). Sin ``SIEP_BIBLIOTECA_DIR`` es ``biblioteca/`` junto a ``backend_django/``; la imagen de producción la copia a
#: ``/app/biblioteca`` y fija la variable. Solo se leen los JSON: el arte lo sirve el frontend bajo ``/assets/biblioteca/``.
BIBLIOTECA_DIR = Path(os.environ.get("SIEP_BIBLIOTECA_DIR") or BASE_DIR / "biblioteca")

#: S2-6b · hosts ``https://`` de los que el fondo de sala puede cargar su imagen (separados por comas). Vacía = solo
#: rutas propias de ``/assets/``. Cada estudiante descarga la imagen desde su navegador: no añadas hosts ajenos.
SIEP_ALLOWED_ASSET_HOSTS = [
    host.strip().lower() for host in os.environ.get("SIEP_ALLOWED_ASSET_HOSTS", "").split(",") if host.strip()
]
# S2-4 · cada host entra tal cual a ``img-src`` de la política de contenido: un nombre de host y nada más (sin esquema,
# puerto, ruta ni comodín). Un valor mal escrito impide arrancar, sin imprimirlo.
for _host_de_fondo in SIEP_ALLOWED_ASSET_HOSTS:
    if not re.fullmatch(r"[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+", _host_de_fondo):
        raise ImproperlyConfigured(
            # BORRADOR
            "SIEP_ALLOWED_ASSET_HOSTS: cada elemento debe ser un nombre de host (sin esquema, puerto, ruta ni comodín; "
            "valor no mostrado)."
        )

#: S1-5 · días que vive una contraseña temporal (la de una aprobación o la que fija un ADMIN) antes de caducar. Entero ≥ 1.
#: Pasado el plazo la clave deja de servir y la cuenta de estudiante vuelve a «pendiente» (``account_service``).
SIEP_TEMP_PASSWORD_DAYS = _entero_env("SIEP_TEMP_PASSWORD_DAYS", default=7, minimo=1)

#: S3-4 · días que se conservan las solicitudes de acceso YA RESUELTAS antes de que ``manage.py purge_expired_data`` las
#: borre. Entero ≥ 0. Vacía o 0 = no se borra ninguna: el plazo lo define la INSTITUCIÓN (SD-9, pendiente) y este repositorio
#: no inventa obligaciones legales. Una solicitud pendiente nunca se borra por esta vía.
SIEP_RETENTION_ACCESS_REQUEST_DAYS = _entero_env("SIEP_RETENTION_ACCESS_REQUEST_DAYS", default=0, minimo=0)

#: S2-6a · tope del cuerpo de una petición, en bytes: por encima, 413 sin leerla (shared/body_limit.py).
SIEP_MAX_BODY_BYTES = _entero_env("SIEP_MAX_BODY_BYTES", default=1024 * 1024, minimo=1)
#: S2-6a · tope del sobre de la importación de estudiantes: el archivo (IMPORT_MAX_BYTES, 2 MiB) más el multipart.
SIEP_MAX_IMPORT_BODY_BYTES = _entero_env("SIEP_MAX_IMPORT_BODY_BYTES", default=3 * 1024 * 1024, minimo=1)
#: S2-6a · tope del cuerpo de la importación de CASOS (JSON). El importador tiene su propio límite de 1 MiB (``casedef`` ``MAX_BYTES``)
#: y responde con un 400 estructurado (``DSL.LIMIT_EXCEEDED``) que el autor entiende: esta ruta tiene un tope más holgado para
#: que ese mensaje llegue hasta 2 MiB; por encima de eso, 413 en el borde (E4, ``test_import_hostile``).
SIEP_MAX_CASE_IMPORT_BODY_BYTES = _entero_env("SIEP_MAX_CASE_IMPORT_BODY_BYTES", default=2 * 1024 * 1024, minimo=1)
# Django: lo que lee en memoria (``request.body``) y los campos de un formulario. Explícitos: el mayor de los topes JSON
# (el middleware es quien recorta por ruta, antes de llegar aquí).
DATA_UPLOAD_MAX_MEMORY_SIZE = max(SIEP_MAX_BODY_BYTES, SIEP_MAX_CASE_IMPORT_BODY_BYTES)
DATA_UPLOAD_MAX_NUMBER_FIELDS = 200

# ─── S3-2 · Consentimiento al aviso de contenido sensible (ETH-01, SIEP-RF-05, RNF-010; ADR-S4) ────────────────────────────
#: Una versión de aviso es un texto corto sin espacios (cabe en ``consent_records.notice_version``, 40 caracteres).
_VERSION_DE_AVISO = re.compile(r"[^\s\x00-\x1f\x7f]{1,40}")


def _version_de_aviso_env(name, default, *, vacia_vale=False):
    """Versión de un aviso por variable de entorno (S3-2). Ausente, ``default``; presente, un texto de 1 a 40 caracteres sin
    espacios ni caracteres de control, o el arranque se detiene. ``vacia_vale`` admite la cadena vacía (= «sin aviso aún»);
    una variable con solo espacios nunca vale. El valor recibido no entra en el mensaje."""
    raw = os.environ.get(name)
    if raw is None or (vacia_vale and raw == ""):
        return default
    if not _VERSION_DE_AVISO.fullmatch(raw):
        raise ImproperlyConfigured(
            # BORRADOR
            f"{name} debe ser un texto de 1 a 40 caracteres sin espacios (valor no mostrado)."
        )
    return raw


#: La versión VIGENTE del aviso de contenido. El servidor es su dueño: el cliente envía la que mostró y, si no coincide, 409
#: NOTICE_VERSION_STALE con ésta. Cambiarla hace que todas las personas vuelvan a aceptar (las aceptaciones viejas se conservan
#: como evidencia). El cliente repite el valor (consent-recorder.ts; una prueba de contrato compara los dos): cambiarla exige
#: cambiar a la vez el texto del aviso, esa constante y este valor por defecto. Es un BORRADOR hasta que Psicología apruebe el texto.
SIEP_CONTENT_NOTICE_VERSION = _version_de_aviso_env("SIEP_CONTENT_NOTICE_VERSION", "2026-10-borrador")
#: El cliente ya usa el servidor (S3-2b), pero sigue APAGADA hasta desplegarlo, medir su costo y que la institución entregue
#: el texto. Encendida: cargar el mundo de un
#: intento y las órdenes de juego responden 403 CONSENT_REQUIRED sin un consentimiento vigente de ese caso y de la versión
#: actual del aviso. La pausa, la salida segura, reanudar, abandonar y consultar el intento abierto NUNCA lo exigen.
SIEP_CONSENT_REQUIRED = _env_flag("SIEP_CONSENT_REQUIRED")
#: Autorización de tratamiento de datos (sin caso). APAGADA hasta que la institución entregue el texto y su versión (SD-8).
SIEP_DATA_TREATMENT_CONSENT_REQUIRED = _env_flag("SIEP_DATA_TREATMENT_CONSENT_REQUIRED")
#: Versión vigente de ese aviso; vacía mientras la institución no la entregue.
SIEP_DATA_TREATMENT_NOTICE_VERSION = _version_de_aviso_env("SIEP_DATA_TREATMENT_NOTICE_VERSION", "", vacia_vale=True)
if SIEP_DATA_TREATMENT_CONSENT_REQUIRED and not SIEP_DATA_TREATMENT_NOTICE_VERSION:
    raise ImproperlyConfigured(
        # BORRADOR
        "SIEP_DATA_TREATMENT_CONSENT_REQUIRED exige SIEP_DATA_TREATMENT_NOTICE_VERSION: sin la versión del aviso no hay a qué "
        "aceptar."
    )

ACCESS_REQUEST_NOTIFY_EMAILS = [
    email.strip()
    for email in os.environ.get(
        "ACCESS_REQUEST_NOTIFY_EMAILS",
        "admin@psychosim.edu.co,secretariapsicologia@cue.edu.co",
    ).split(",")
    if email.strip()
]
# Django 6.1: MAILERS reemplaza a EMAIL_BACKEND/EMAIL_HOST/... (deprecados, se
# retiran en Django 7.0). Por defecto el correo sale por consola; en producción
# se fija EMAIL_BACKEND (p. ej. el backend SMTP) y sus OPTIONS salen de variables
# (E2-12): EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS,
# EMAIL_USE_SSL y EMAIL_TIMEOUT. Una opción sin definir no se pasa al backend.
def _mailer_options():
    options = {}
    text = {"EMAIL_HOST": "host", "EMAIL_HOST_USER": "username", "EMAIL_HOST_PASSWORD": "password"}
    for variable, option in text.items():
        value = os.environ.get(variable, "")
        if value.strip():
            options[option] = value.strip() if option != "password" else value
    for variable, option in {"EMAIL_PORT": "port", "EMAIL_TIMEOUT": "timeout"}.items():
        value = os.environ.get(variable, "").strip()
        if value:
            options[option] = int(value)
    for variable, option in {"EMAIL_USE_TLS": "use_tls", "EMAIL_USE_SSL": "use_ssl"}.items():
        if os.environ.get(variable, "").strip():
            options[option] = _env_flag(variable)
    if "host" in options:
        # Sin tiempo de espera un servidor SMTP colgado retiene la petición indefinidamente.
        options.setdefault("timeout", 10)
    return options


MAILERS = {
    "default": {
        "BACKEND": os.environ.get(
            "EMAIL_BACKEND",
            "django.core.mail.backends.console.EmailBackend",
        ),
        **({"OPTIONS": _mailer_options()} if _mailer_options() else {}),
    },
}
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "siep@psychosim.edu.co")
SIEP_PUBLIC_URL = os.environ.get("SIEP_PUBLIC_URL", "")

SPECTACULAR_SETTINGS = {
    "TITLE": "PsychoSim / SIEP API",
    "DESCRIPTION": "Backend Django para el simulador SIEP (contrato idéntico a Spring).",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "DEFAULT_SCHEMA_CLASS": "shared.openapi.SiepAutoSchema",
    "PREPROCESSING_HOOKS": [
        "shared.openapi.preprocess_canonical_api_endpoints",
    ],
    "ENUM_GENERATE_CHOICE_DESCRIPTION": False,  # sin el listado en inglés de las etiquetas de Django
    # Un nombre estable por conjunto de valores: dos campos `status` con opciones distintas ya no chocan.
    "ENUM_NAME_OVERRIDES": {
        "AttemptStatusEnum": "apps.simulation.models.AttemptStatus",
        "CaseVersionStatusEnum": "apps.simulation.models.CaseVersionStatus",
        "AccessReasonEnum": "apps.grupos.access.REASONS",
        "AssignmentStateEnum": "apps.grupos.contracts.ASSIGNMENT_STATES",
        "AssignmentTargetTypeEnum": "apps.grupos.contracts.ASSIGNMENT_TARGETS",
        "IssueSeverityEnum": "apps.simulation.serializers.contracts.ISSUE_SEVERITIES",
        "AssistantStatusModeEnum": "apps.simulation.serializers.contracts.ASSISTANT_STATUS_MODES",
        "AssistantGuideModeEnum": "apps.simulation.serializers.contracts.ASSISTANT_GUIDE_MODES",
        "HintReasonEnum": "apps.simulation.serializers.contracts.HINT_REASONS",
        "LifecycleActionEnum": "apps.simulation.serializers.contracts.LIFECYCLE_ACTIONS",
        "MembershipStatusEnum": "apps.grupos.models.MembershipStatus",
        "ReviewDecisionEnum": "apps.simulation.models.case.ReviewDecision",
        "ReviewReasonEnum": "apps.simulation.models.case.ReviewReason",
        "HealthStatusEnum": "shared.health_docs.HEALTH_STATUS",
        "HealthDbEnum": "shared.health_docs.HEALTH_DB",
    },
}

# S2-5 · Esquema OpenAPI y su visor (/schema/, /swagger-ui.html): APAGADOS por defecto y también en producción. Encendida
# la bandera, exigen sesión JWT y rol ADMIN; apagada, responden 404 antes de mirar credenciales. Se evalúa en cada petición
# (psychosim/urls.py, _docs_gate). Solo para desarrollo.
SIEP_EXPOSE_API_DOCS = _env_flag("SIEP_EXPOSE_API_DOCS")

# S2-3a / S2-4 · política de contenido (RNF-002, ADR-S3 en docs/seguridad/adr-s3-csp.md). Los informes de violaciones
# llegan a CSP_REPORT_PATH (ruta pública, anónima y limitada por IP).
#
# - MODO REPORTE (por defecto): ``Content-Security-Policy-Report-Only`` con la política INICIAL; el navegador informa de lo
#   que incumple y no bloquea nada. SIEP_CSP_REPORT_ONLY=false (interruptor de emergencia) quita esa cabecera.
# - EN VIGOR (SIEP_CSP_ENFORCE=true, apagada por defecto hasta que la sonda ``npm run test:csp`` no halle violaciones):
#   ``Content-Security-Policy`` con la política EN VIGOR, que lleva el nonce de la petición en ``script-src`` y
#   ``style-src`` (``spa_index`` lo escribe en el HTML) y NO lleva 'unsafe-inline' en los scripts ni en los ``<style>``
#   (solo, con el acceso con Google, en los atributos de estilo: ver CSP_ENFORCED_POLICY). Encendida, la cabecera de reporte
#   se omite: con la misma política en las dos, cada violación se informaría dos veces.
CSP_REPORT_PATH = "/api/security/csp-report"
SIEP_CSP_REPORT_ONLY = _env_flag("SIEP_CSP_REPORT_ONLY", default=True)
SIEP_CSP_ENFORCE = _env_flag("SIEP_CSP_ENFORCE")

#: Las imágenes que la política deja cargar: las propias, ``data:`` y ``blob:`` (Phaser y el kit del personaje; los midió la
#: sonda) y los hosts https que el servidor permite para el fondo de sala (SIEP_ALLOWED_ASSET_HOSTS, S2-6b; vacía = solo propias).
_CSP_IMG_SRC = [CSP.SELF, "data:", "blob:", *(f"https://{host}" for host in SIEP_ALLOWED_ASSET_HOSTS)]

#: La política inicial (S2-3a, modo reporte): ni nonce ni restricciones de scripts en línea.
CSP_INITIAL_POLICY = {
    "default-src": [CSP.SELF],
    "script-src": [CSP.SELF, "https://accounts.google.com/gsi/client"],
    "style-src": [CSP.SELF, CSP.UNSAFE_INLINE, "https://accounts.google.com/gsi/style"],
    "img-src": _CSP_IMG_SRC,
    "font-src": [CSP.SELF],
    "media-src": [CSP.SELF, "blob:"],
    "worker-src": [CSP.SELF, "blob:"],
    "connect-src": [CSP.SELF, "https://accounts.google.com/gsi/"],
    "frame-src": ["https://accounts.google.com/gsi/"],
    "frame-ancestors": [CSP.NONE],
    "base-uri": [CSP.SELF],
    "form-action": [CSP.SELF],
    "object-src": [CSP.NONE],
    "report-uri": [CSP_REPORT_PATH],
}
#: La política en vigor (S2-4, ajustada con lo que midió la sonda ``npm run test:csp``; docs/seguridad/adr-s3-csp.md):
#: el nonce de la petición en scripts y estilos, sin 'unsafe-inline' en ninguno de los dos, y SIN ``blob:`` en ``media-src`` ni
#: ``worker-src`` (la sonda no los usó; ``data:`` y ``blob:`` en ``img-src`` SÍ: Phaser y el kit del personaje).
#: Un único permiso excepcional: con el acceso con Google configurado (GOOGLE_OAUTH_CLIENT_ID), ``style-src-attr 'unsafe-inline'``.
#: Google Identity Services escribe atributos ``style=`` con ``innerHTML`` y un atributo no puede llevar nonce (medido con la
#: sonda y un client id falso: ``style-src-attr`` en /gsi/client). Solo atributos; los ``<style>`` siguen exigiendo el nonce
#: (el cliente se lo pasa al script de Google, que lo copia a su hoja). Sin Google, no hay excepción.
CSP_ENFORCED_POLICY = {
    "default-src": [CSP.SELF],
    "script-src": [CSP.SELF, CSP.NONCE, "https://accounts.google.com/gsi/client"],
    "style-src": [CSP.SELF, CSP.NONCE, "https://accounts.google.com/gsi/style"],
    **({"style-src-attr": [CSP.UNSAFE_INLINE]} if GOOGLE_OAUTH_CLIENT_ID else {}),
    "img-src": _CSP_IMG_SRC,
    "font-src": [CSP.SELF],
    "media-src": [CSP.SELF],
    "worker-src": [CSP.SELF],
    "connect-src": [CSP.SELF, "https://accounts.google.com/gsi/"],
    "frame-src": ["https://accounts.google.com/gsi/"],
    "frame-ancestors": [CSP.NONE],
    "base-uri": [CSP.SELF],
    "form-action": [CSP.SELF],
    "object-src": [CSP.NONE],
    "report-uri": [CSP_REPORT_PATH],
}
SECURE_CSP = CSP_ENFORCED_POLICY if SIEP_CSP_ENFORCE else {}
SECURE_CSP_REPORT_ONLY = CSP_INITIAL_POLICY if SIEP_CSP_REPORT_ONLY and not SIEP_CSP_ENFORCE else {}

# Logs: una línea JSON por registro, con el id de la request (RNF-06, TD-10).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "shared.jsonlog.RequestIdFilter"}},
    "formatters": {"json": {"()": "shared.jsonlog.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "filters": ["request_id"],
        },
    },
    "root": {"handlers": ["console"], "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO")},
}

LANGUAGE_CODE = "es"
TIME_ZONE = "America/Bogota"
USE_I18N = True
# Spring uses LocalDateTime and the columns are "timestamp without time zone";
# keep datetimes naive so the JSON contract matches Spring exactly.
USE_TZ = False

# ── Archivos estáticos / SPA (Angular) servidos por WhiteNoise ───────────────
# Los estáticos propios de Django (p. ej. swagger) se recogen en STATIC_ROOT.
STATIC_URL = "/django-static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# El build de Angular se copia a backend_django/frontend_dist en el contenedor.
# Si existe, WhiteNoise sirve en la raíz sus archivos (bundles, assets, fuentes), PERO NO el index.html (S2-4): ni
# «/» ni «/index.html». El HTML lo sirve siempre la vista shared.spa.spa_index (catch-all de urls.py), que escribe el
# nonce de la política de contenido en cada petición; shared.static_files.SpaStaticFilesMiddleware lo garantiza aunque
# alguien vuelva a encender WHITENOISE_INDEX_FILE.
SPA_DIST_DIR = BASE_DIR / "frontend_dist"
if SPA_DIST_DIR.exists():
    WHITENOISE_ROOT = str(SPA_DIST_DIR)
WHITENOISE_INDEX_FILE = False

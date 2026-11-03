Borrador generado a partir del código; verificar antes de publicar

# Ejecución local y entornos

## Requisitos que aparecen en las fuentes

- Python 3.12–3.14 según `README.md:23`; imagen y CI fijan 3.14 (`Dockerfile:17`, `.github/workflows/ci.yml:25`). `requirements.txt:3` contiene pins declarados para Python 3.14. Compatibilidad exacta en el repo nuevo: **sin verificar**.
- PostgreSQL: `docker-compose.yml:11` define `postgres:18-alpine`, base `psychosim` y puerto local 5433 por defecto (`docker-compose.yml:17`). README aún menciona PostgreSQL 16 para desarrollo y 18 para pruebas (`README.md:209`): discrepancia documental; revisar versión antes de publicar.
- Dependencias: Django 6.1.2, DRF 3.18.3, SimpleJWT, psycopg 3, entre otras (`requirements.txt:3`). Tests/desarrollo añade pytest, pytest-django y factory-boy (`requirements-dev.txt:4`).
- Docker Desktop solo hace falta para el flujo Compose descrito en README.md:22; el backend también documenta arranque manual contra una PostgreSQL disponible.

## Variables de entorno

`.env.example` es plantilla explicativa: no copiar sus valores de ejemplo a producción. Las referencias indican dónde se declaran o validan los nombres; ningún valor sensible se reproduce aquí.

| Grupo | Variables (nombres) | Requisito/uso visible |
|---|---|---|
| Django y hosts | `DJANGO_SETTINGS_MODULE`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_SECURE_SSL_REDIRECT` | Producción exige secreto propio y hosts concretos (`psychosim/settings/production.py:152`; `.env.example:8`). |
| Base de datos | `DATABASE_URL` o `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | URL prevalece; en producción se exige password si no hay URL (`psychosim/settings/base.py:101`, `psychosim/settings/production.py:194`). |
| Proxy y CORS | `SIEP_TRUSTED_PROXIES`, `CORS_ALLOWED_ORIGINS` | Número de proxies confiables y lista de orígenes (`.env.example:18`, `psychosim/settings/production.py:220`). |
| Sesión y reflexión | `JWT_SIGNING_KEY`, `JWT_EXPIRATION_HOURS`, `SIEP_SESSION_EPOCH_ENFORCE`, `REFLECTION_ENCRYPTION_KEY`, `REFLECTION_KEYS`, `REFLECTION_ACTIVE_KEY` | Firma JWT, duración y claves de cifrado; las llaves de producción se validan (`.env.example:32`, `psychosim/settings/base.py:163, :183`, `psychosim/settings/production.py:157, :197`). `JWT_SECRET` está obsoleta (`.env.example:26`). |
| Google | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_ALLOWED_DOMAINS` | Cliente OAuth y allowlist opcional (`.env.example:39`, `psychosim/settings/base.py:220`). |
| Correo | `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_TIMEOUT`, `DEFAULT_FROM_EMAIL`, `ACCESS_REQUEST_NOTIFY_EMAILS`, `SIEP_ALLOW_CONSOLE_EMAIL`, `ACCESS_REQUEST_NOTIFY_DISABLED` | Backend SMTP y destino de avisos; producción valida explícitamente la salida de correo (`.env.example:58`, `psychosim/settings/production.py:233`). |
| Importación y retención | `SIEP_IMPORT_MAX_BYTES`, `SIEP_IMPORT_MAX_UNCOMPRESSED_BYTES`, `SIEP_IMPORT_MAX_ROWS`, `SIEP_IMPORT_MAX_COLUMNS`, `SIEP_IMPORT_MAX_SECONDS`, `SIEP_RETENTION_ACCESS_REQUEST_DAYS` | Topes para Excel y retención de solicitudes (`.env.example:47`, `.env.example:69`). |
| Flags de funciones | `SIEP_REVIEW_WORKFLOW_STRICT`, `SIEP_REVISION_REQUIRED`, `SIEP_ATTEMPT_START_STRICT`, `SIEP_INVITATIONS_AUTO_ACCEPT`, `SIEP_INVITATION_EMAIL_LIMIT`, `SIEP_ACCEPTABLE_LEVEL`, `SIEP_MIN_CELL_SIZE`, `SIEP_REFLECTION_DEFINITION`, `SIEP_ATTEMPT_FEEDBACK_SURVEY`, `SIEP_CONTENT_NOTICE_VERSION`, `SIEP_CONSENT_REQUIRED`, `SIEP_DATA_TREATMENT_CONSENT_REQUIRED`, `SIEP_DATA_TREATMENT_NOTICE_VERSION` | Interruptores/definiciones con valores documentados en comentarios de `.env.example:78` y `:87, :93`; confirmar qué se activa en el corte nuevo. |
| IA | `AI_ASSISTANT_ENABLED`, `AI_ASSISTANT_PROVIDER`, `AI_ASSISTANT_API_KEY`, `AI_ASSISTANT_MODEL` | Integración apagada por defecto, con clave externa (`.env.example:113`). |
| Tests aislados | `SIEP_TEST_DB_NAME`, `SIEP_TEST_DB_HOST`, `SIEP_TEST_DB_PORT`, `SIEP_TEST_DB_USER`, `SIEP_TEST_DB_PASSWORD`, `SIEP_TEST_ATTESTATION_NONCE` | Obligatorias en `psychosim/settings/test.py:40`; su exportación la realiza el runner de test de la raíz del repo.

La lista anterior cubre variables nombradas en el `.env.example` y settings de entorno. No equivale a una especificación exhaustiva de cada flag del backend completo.

## Instalación y arranque

Desde la raíz del repo nuevo (que contiene `manage.py`, `requirements*.txt` y `psychosim/`; receta manual original en `README.md:54`):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item psychosim\settings\local.example.py psychosim\settings\local.py
docker compose up -d db
$env:DJANGO_SETTINGS_MODULE = "psychosim.settings.local"
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver 8091
```

Las instrucciones manuales equivalentes aparecen en `README.md:54`–`:60`; la copia de ejemplo se desprende de `psychosim/settings/local.example.py:1` y debe confirmarse con responsables. Ese archivo generado no está en la extracción: su creación en el repo nuevo es **sin verificar**. Dockerfile aplica `manage.py migrate --noinput` antes de gunicorn (`Dockerfile:47`); el comando local se incluye por esa evidencia y por el rol de Django en schema (`psychosim/settings/base.py:4`). No se ejecutó aquí. Arranque real **sin verificar**.

## Migraciones por sprint

Seguir la nota [settings-urls-por-sprint.md](../settings-urls-por-sprint.md): en S1 fijar `AUTH_USER_MODEL` antes de crear FKs; S2 registrar privacy/grupos, manteniendo diferidas asignaciones a `CaseVersion`; S3 generar una inicial recortada de simulation y asignaciones; S4 añadir migraciones aditivas para motor/evaluación. La migración `apps/simulation/migrations/0001_initial.py` del corte no debe asumirse compatible con el recorte: la nota recomienda regenerar una migración limpia. Orden y SQL resultante **sin verificar** porque no se aplicaron migraciones.

## Pruebas

`pytest.ini:2` selecciona `psychosim.settings.test`, `pytest.ini:3` configura `test_*.py`, y `pytest.ini:6` activa `--reuse-db`. El settings de test exige variables de DB desechable y nonce; evita DSN de desarrollo/producción (`psychosim/settings/test.py:40`). CI fija Python 3.14 (`.github/workflows/ci.yml:25`), instala `requirements-dev.txt` y ejecuta `npm run check:backend`/`npm run test:backend` (`.github/workflows/ci.yml:119`, `:120`). README documenta ejecución manual desde backend (`README.md:149`).

Para limitar por app desde la raíz equivalente al backend, el patrón de pytest es `python -m pytest apps/users/tests -q` (cambiar el directorio por `apps/<app>/tests`). Ejemplos: `apps/privacy/tests`, `apps/grupos/tests`, `apps/simulation/tests`, `apps/security/tests`, `apps/progression/tests`, `apps/biblioteca/tests`, `shared/tests`. Estos comandos siguen el patrón indicado por `pytest.ini`; correrlos app por app, el resultado, la preparación automática de DB y la disponibilidad de tests aislados en el repo nuevo: **sin verificar**. No se ejecutó ninguna prueba.

## Settings

| Módulo | Papel visible | Evidencia |
|---|---|---|
| `psychosim.settings.base` | Configuración compartida: apps, middleware, DB, autenticación/DRF. | `psychosim/settings/base.py:4`, `:22`, `:44`, `:79`, `:101`, `:133` |
| `psychosim.settings.production` | Hereda base; exige secretos/hosts y endurece HTTPS/cookies. | `psychosim/settings/production.py:1`, `:60`, `:75`, `:181` |
| `psychosim.settings.test` | Aislamiento de DB para tests; falla si faltan credenciales/nonce. | `psychosim/settings/test.py:1`, `:34`, `:77` |
| `psychosim.settings.local` | Copia local de `local.example.py`; el archivo generado no está en la extracción. | `psychosim/settings/local.example.py:1`; existencia en destino: **sin verificar** |

La CI actual también levanta matrices E2E e infraestructura del monorepo; esos runners necesitan `scripts/` y Compose externos a esta extracción. Adaptarlos al repo nuevo queda **sin verificar**.

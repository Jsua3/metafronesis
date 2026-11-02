"""Configuración local de integración S3; no usar en producción."""
import os
from pathlib import Path
BASE_DIR=Path(__file__).resolve().parent.parent
SECRET_KEY=os.environ.get("DJANGO_SECRET_KEY", "local-s3-development-only")
DEBUG=False
ALLOWED_HOSTS=["localhost", "127.0.0.1", "testserver"]
INSTALLED_APPS=["django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "rest_framework", "psychosim.s3_apps.S3UsersConfig", "apps.simulation", "apps.grupos"]
DATABASES={"default":{"ENGINE":"django.db.backends.sqlite3","NAME":BASE_DIR/"db.sqlite3"}}
AUTH_USER_MODEL="users.CustomUser"
DEFAULT_AUTO_FIELD="django.db.models.BigAutoField"
ROOT_URLCONF="psychosim.urls_s3"
USE_TZ=True
TIME_ZONE="America/Bogota"
MIDDLEWARE=["django.contrib.sessions.middleware.SessionMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware"]
REST_FRAMEWORK={"DEFAULT_AUTHENTICATION_CLASSES":["rest_framework.authentication.SessionAuthentication"], "DEFAULT_PERMISSION_CLASSES":["rest_framework.permissions.IsAuthenticated"], "DEFAULT_RENDERER_CLASSES":["rest_framework.renderers.JSONRenderer"]}

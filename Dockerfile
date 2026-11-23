# Metafronesis — imagen única: build de Angular + backend Django (gunicorn). SIEP-237.
# Django sirve la API en /api y el SPA de Angular en el resto de rutas (WhiteNoise para los archivos y la vista
# shared.spa.spa_index para el index.html con el nonce de la CSP): todo vive en un solo dominio, sin CORS.
# Se despliega en Google Cloud Run (docs/despliegue-gcp.md), pero no depende de Google: cualquier plataforma que
# ejecute un contenedor y le pase las variables de producción (.env.example) la sirve.
#
# Las dos bases van fijadas por resumen (sha256), no por etiqueta móvil: el resumen dice qué imagen se construye.
# Para refrescarlas: `docker buildx imagetools inspect node:26-alpine` (y `python:3.14-slim`) y copiar el «Digest».

# ---------- Etapa 1: build del frontend (Angular) ----------
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Etapa 2: backend (Django + gunicorn) ----------
FROM python:3.14-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f AS backend
# Enlaza la imagen publicada en GHCR con el repositorio (hereda su descripción y sus permisos).
LABEL org.opencontainers.image.source="https://github.com/Jsua3/metafronesis" \
      org.opencontainers.image.description="Metafronesis: simulador psicosocial educativo (Django + Angular)" \
      org.opencontainers.image.licenses="MIT"
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=psychosim.settings.production
# Usuario de sistema fijo (uid/gid 10001): sin shell de inicio de sesión ni directorio personal.
RUN groupadd --system --gid 10001 siep \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin siep
WORKDIR /app

# La imagen instala solo lo que se ejecuta: pytest, pytest-django, factory-boy y pip-audit van en requirements-dev.txt.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Solo el código que corre el servidor (el .dockerignore deja fuera pruebas, documentación y configuración local).
COPY manage.py ./
COPY psychosim/ ./psychosim/
COPY shared/ ./shared/
COPY apps/ ./apps/
# La biblioteca de lugares del editor de casos: el servidor solo lee sus JSON (BIBLIOTECA_DIR = /app/biblioteca); el arte
# lo sirve el frontend desde sus propios assets. El .dockerignore deja fuera los PNG.
COPY biblioteca/escenarios/ ./biblioteca/escenarios/
# El build de Angular (carpeta browser/) va a frontend_dist: base.py lo detecta y WhiteNoise lo sirve.
COPY --from=frontend /fe/dist/psychosim-admin-panel/browser ./frontend_dist
# Bytecode compilado en la imagen: con escalado a cero, cada arranque en frío importa Django sin compilar nada.
# STATIC_ROOT queda vacío (el proyecto no usa django.contrib.staticfiles), pero existe: WhiteNoise avisa si falta.
RUN python -m compileall -q /app && mkdir -p /app/staticfiles

# Escucha en $PORT (Cloud Run pone 8080); 8000 si la plataforma no lo define.
EXPOSE 8000
# El proceso corre como 10001 (no root): /app es de root y solo se lee; nada escribible por el usuario de la imagen.
USER 10001:10001
# El esquema lo construye `migrate` (Django es el dueño) y se aplica ANTES de servir; con más de una réplica habría que
# moverlo a un paso de despliegue aparte (ver docs/despliegue-gcp.md). Gunicorn sirve la app WSGI con hilos:
# 3 procesos × 4 hilos (≈ 320 MB de RSS medidos en Linux con la imagen anterior; caben en 1 GiB). `exec` deja a gunicorn
# como proceso principal: recibe SIGTERM en los redespliegues y drena las peticiones en vuelo. --no-control-socket: el
# socket de control de gunicorn 26 iría al directorio personal, que este usuario no tiene (y no se usa).
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn psychosim.wsgi:application --bind 0.0.0.0:${PORT:-8000} --worker-class gthread --workers 3 --threads 4 --timeout 120 --keep-alive 5 --graceful-timeout 30 --worker-tmp-dir /dev/shm --no-control-socket --access-logfile - --error-logfile -"]

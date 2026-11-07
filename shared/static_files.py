"""WhiteNoise para los estáticos del SPA, SIN su ``index.html`` (plan 03, S2-4, ADR-S3).

WhiteNoise sirve el build de Angular (``WHITENOISE_ROOT``): bundles con hash, ``assets/``, fuentes. Pero el HTML lleva el
nonce de la política de contenido y solo puede salir de ``shared.spa.spa_index``, que lo escribe en cada petición. Servido
crudo por WhiteNoise, ``/index.html`` (o ``/``, con ``WHITENOISE_INDEX_FILE``) llegaría con el marcador sin sustituir y la
CSP bloquearía los estilos de Angular. Este middleware saca ``/index.html`` de la tabla de archivos de WhiteNoise: las
rutas ``/`` e ``/index.html`` caen a la vista como cualquier ruta del cliente.

Va en el mismo sitio de ``MIDDLEWARE`` donde iba ``whitenoise.middleware.WhiteNoiseMiddleware`` (debajo de las cabeceras y
de la CSP: WhiteNoise responde los estáticos y corta la cadena).
"""
from whitenoise.middleware import WhiteNoiseMiddleware

#: La URL del índice del SPA dentro de ``WHITENOISE_ROOT`` (las de ``STATIC_ROOT`` cuelgan de ``/django-static/``).
INDEX_URL = "/index.html"
#: Con ``WHITENOISE_INDEX_FILE`` WhiteNoise serviría el índice también en la raíz del sitio.
ROOT_URL = "/"


class SpaStaticFilesMiddleware(WhiteNoiseMiddleware):
    """``WhiteNoiseMiddleware`` que nunca sirve ``/index.html`` ni ``/`` (los sirve ``spa_index``, con nonce)."""

    def add_file_to_dictionary(self, url, path, stat_cache=None):
        # Modo normal (producción): la tabla de archivos se arma al cargar; el índice no entra, ni como archivo ni como raíz.
        if url == INDEX_URL:
            return
        super().add_file_to_dictionary(url, path, stat_cache=stat_cache)

    def find_file(self, url):
        # Modo autorefresco (``WHITENOISE_AUTOREFRESH``, DEBUG): WhiteNoise busca en disco en cada petición.
        if url in (INDEX_URL, ROOT_URL):
            return None
        return super().find_file(url)

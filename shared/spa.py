"""Vista que sirve el ``index.html`` del SPA (Angular) con el nonce de la petición (plan 03, S2-4, ADR-S3 opción A).

La política de contenido en vigor (``SECURE_CSP``, tras ``SIEP_CSP_ENFORCE``) pone ``'nonce-…'`` en ``script-src`` y
``style-src``. Angular lee el nonce de ``ngCspNonce`` en ``<app-root>`` y lo copia a los ``<style>`` que inyecta al
arrancar; el build lo copia además a los ``<script>``/``<style>`` que genera. El archivo fuente
(``frontend/src/index.html``) trae un MARCADOR en lugar del nonce y esta vista lo sustituye, en TODAS sus apariciones,
por el nonce de la petición: el mismo que ``ContentSecurityPolicyMiddleware`` escribe en la cabecera, distinto en cada
petición. Por eso el HTML:

- lo sirve SIEMPRE esta vista (``shared.static_files.SpaStaticFilesMiddleware`` impide que WhiteNoise lo sirva crudo);
- no se guarda en ninguna caché (``Cache-Control: no-store``): un nonce repetido no protege.
"""
from django.conf import settings
from django.http import Http404, HttpResponse
from django.middleware.csp import get_nonce
from django.utils.cache import patch_cache_control
from django.utils.html import escape

#: Lo que ``frontend/src/index.html`` trae en ``ngCspNonce`` (y el build copia a sus ``<script>``/``<style>``).
#: Una prueba (``shared/tests/test_spa_index.py``) comprueba que el archivo del frontend usa EXACTAMENTE este valor.
NONCE_MARKER = "__SIEP_CSP_NONCE__"


def _nonce_de(request):
    """El nonce de ESTA petición como texto seguro para un atributo HTML; vacío si no hay middleware de CSP.

    Pedirlo aquí lo genera (es perezoso): el middleware escribe después en la cabecera el mismo valor.
    """
    nonce = get_nonce(request)
    return escape(str(nonce)) if nonce is not None else ""


def spa_index(request):
    """Sirve el ``index.html`` del SPA para las rutas del cliente, con el nonce de la petición.

    WhiteNoise sirve los archivos que existen (assets, JS), salvo el índice; las rutas de Angular que no son archivos
    (p. ej. ``/portal/personaje`` al recargar), ``/`` y ``/index.html`` llegan aquí.
    """
    spa_dir = getattr(settings, "SPA_DIST_DIR", None)
    if spa_dir is None or not (spa_dir / "index.html").is_file():
        raise Http404("SPA build not available")
    html = (spa_dir / "index.html").read_bytes()
    response = HttpResponse(
        html.replace(NONCE_MARKER.encode("utf-8"), _nonce_de(request).encode("utf-8")),
        content_type="text/html",
    )
    # El nonce es único por petición: ni el navegador ni un intermediario guardan esta respuesta.
    patch_cache_control(response, no_store=True)
    return response

"""Cabeceras de seguridad base de toda respuesta (plan 03, S2-1).

Django ya pone ``X-Content-Type-Options``, ``Referrer-Policy`` y ``Cross-Origin-Opener-Policy``
(``SecurityMiddleware``) y ``X-Frame-Options`` (``XFrameOptionsMiddleware``). Este middleware pone lo que falta:

- ``Permissions-Policy``: el navegador no concede cámara, micrófono, ubicación, pagos ni USB a la página.
- ``Cache-Control: no-store`` en la API (``/api/...``): los datos de estudiantes no quedan en cachés intermedias.
  ``/api/health`` queda fuera (sondeo público, fija el suyo) y toda vista que ya fijó su ``Cache-Control`` lo conserva.
- ``X-Robots-Tag: noindex, nofollow`` en la API (``/api``) y en el área del docente (``/portal``), por segmentos:
  ``/apis`` no cuenta. La portada ``/`` y el resto del SPA no lo llevan (ED-15).

Va ENCIMA de WhiteNoise en ``MIDDLEWARE``: WhiteNoise responde los archivos estáticos y corta la cadena.
"""
from django.utils.cache import patch_cache_control

PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
ROBOTS_TAG = "noindex, nofollow"
# /api/health es público y fija su propio Cache-Control (shared/health.py): no se le añade nada.
_RUTAS_SIN_NO_STORE = ("/api/health",)


def _bajo_de(ruta, prefijo):
    """¿``ruta`` es ``prefijo`` o cuelga de él por segmentos? (``/api`` no cubre ``/apis``.)"""
    return ruta == prefijo or ruta.startswith(prefijo + "/")


class SecurityHeadersMiddleware:
    """Añade ``Permissions-Policy``, ``no-store`` (API) y ``X-Robots-Tag`` (API y portal) sin pisar lo que la vista fijó."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        ruta = request.path_info
        if "Permissions-Policy" not in response:
            response["Permissions-Policy"] = PERMISSIONS_POLICY
        if ruta.startswith("/api/") and ruta not in _RUTAS_SIN_NO_STORE and "Cache-Control" not in response:
            patch_cache_control(response, no_store=True)
        if "X-Robots-Tag" not in response and (_bajo_de(ruta, "/api") or _bajo_de(ruta, "/portal")):
            response["X-Robots-Tag"] = ROBOTS_TAG
        return response

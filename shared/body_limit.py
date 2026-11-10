"""Tope del cuerpo de cada petición, antes de leerla (S2-6a, RNF-002).

Va justo después de ``SecurityMiddleware``. Para los métodos con cuerpo (POST, PUT, PATCH y DELETE):

- ``Content-Length`` declarado y mayor que el tope de la ruta → 413 sin tocar el flujo.
- Sin ``Content-Length`` pero con ``Transfer-Encoding`` → el flujo se sustituye por ``_BoundedInput``, que corta en
  cuanto se lee más allá del tope (sin longitud declarada, Django no sabría cuánto leer).
- ``Content-Length`` que no es un entero ≥ 0 → 400 ``REQUEST_INVALID_LENGTH``.

Sin ``Content-Length`` ni ``Transfer-Encoding`` la petición no trae cuerpo (RFC 9112, §6.3): no se toca el flujo,
porque leerlo podría quedarse esperando al cliente.
"""

import io
import re

from django.conf import settings
from django.http import JsonResponse

from shared.exceptions import ApiError
from shared.security_events import log_security_event

METODOS_CON_CUERPO = frozenset({"POST", "PUT", "PATCH", "DELETE"})
#: La importación de estudiantes: la fila ``multipart-import`` de ``shared/surface-inventory.json``, con o sin barra final.
MULTIPART_IMPORT_ROUTE = re.compile(r"/api/grupos/[0-9]+/estudiantes/import/?")
#: La importación de casos: ``POST api/authoring/cases/import`` (tope propio, ver ajustes).
CASE_IMPORT_ROUTE = re.compile(r"/api/authoring/cases/import/?")
_DIGITOS = re.compile(r"[0-9]{1,18}")

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
MENSAJE_DEMASIADO_GRANDE = "El cuerpo de la petición es demasiado grande."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
MENSAJE_LONGITUD_INVALIDA = "El Content-Length de la petición no es válido."


class BodyTooLarge(ApiError):
    """El cuerpo pasa del tope: lo lanza el lector acotado cuando la vista lee más de lo permitido."""

    def __init__(self):
        super().__init__("REQUEST_TOO_LARGE", MENSAJE_DEMASIADO_GRANDE, 413)


class _BoundedInput(io.IOBase):
    """Lector de ``wsgi.input`` que nunca pide al flujo más de ``tope + 1`` bytes en total.

    El byte de más basta para saber que el cuerpo pasa del tope: al llegar a él se lanza ``BodyTooLarge`` y el resto del
    flujo queda sin leer. Hereda de ``io.IOBase`` como ``LimitedStream`` de Django, porque ``HttpRequest.body`` llama a
    ``seekable()`` y a ``close()`` sobre el flujo.
    """

    def __init__(self, flujo, tope):
        super().__init__()
        self._flujo = flujo
        self._tope = tope
        self._leidos = 0

    def readable(self):
        return True

    def _pedir(self, leer, size):
        libres = self._tope + 1 - self._leidos
        trozo = leer(libres if size is None or size < 0 else min(size, libres))
        self._leidos += len(trozo)
        if self._leidos > self._tope:
            raise BodyTooLarge()
        return trozo

    def read(self, size=-1):
        if size is not None and size >= 0:
            return self._pedir(self._flujo.read, size)
        partes = []
        while trozo := self._pedir(self._flujo.read, -1):
            partes.append(trozo)
        return b"".join(partes)

    def readline(self, size=-1):
        return self._pedir(self._flujo.readline, size)


def _alcance(ruta):
    """La clase de la ruta, con los nombres del inventario, y su tope en bytes."""
    if MULTIPART_IMPORT_ROUTE.fullmatch(ruta):
        return "multipart-import", settings.SIEP_MAX_IMPORT_BODY_BYTES
    if CASE_IMPORT_ROUTE.fullmatch(ruta):
        return "json-case-import", settings.SIEP_MAX_CASE_IMPORT_BODY_BYTES
    return "json-small", settings.SIEP_MAX_BODY_BYTES


def _longitud_declarada(meta):
    """``Content-Length`` como entero; ``None`` si no viene o viene vacío (PEP 3333); ``ValueError`` si no es válido."""
    crudo = meta.get("CONTENT_LENGTH", "").strip()
    if not crudo:
        return None
    if not _DIGITOS.fullmatch(crudo):
        raise ValueError("Content-Length no válido")
    return int(crudo)


def _acotar_flujo(request, tope):
    """Sustituye el flujo de la petición por un lector acotado.

    Django crea su propio ``_stream`` al construir la petición (con longitud 0 si no hay ``Content-Length``), así que
    hay que cambiarlo también: si solo se cambiara ``wsgi.input``, ``request.body`` no pasaría por el lector.
    """
    flujo = request.META.get("wsgi.input")
    if flujo is None:
        return
    acotado = _BoundedInput(flujo, tope)
    request.META["wsgi.input"] = acotado
    request._stream = acotado


def _rechazar(scope, evento, codigo, mensaje, estado):
    """Registra el rechazo (clase de ruta y evento, sin la ruta ni el contenido) y responde con el sobre de errores."""
    log_security_event(evento, scope=scope)
    return JsonResponse({"success": False, "code": codigo, "message": mensaje}, status=estado)


def _demasiado_grande(scope):
    return _rechazar(scope, "body_too_large", "REQUEST_TOO_LARGE", MENSAJE_DEMASIADO_GRANDE, 413)


class BodyLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method not in METODOS_CON_CUERPO:
            return self.get_response(request)
        scope, tope = _alcance(request.path_info)
        try:
            declarada = _longitud_declarada(request.META)
        except ValueError:
            return _rechazar(scope, "body_invalid_length", "REQUEST_INVALID_LENGTH", MENSAJE_LONGITUD_INVALIDA, 400)
        if declarada is not None:
            if declarada > tope:
                return _demasiado_grande(scope)
            return self.get_response(request)
        if "HTTP_TRANSFER_ENCODING" not in request.META:
            return self.get_response(request)
        _acotar_flujo(request, tope)
        try:
            return self.get_response(request)
        except BodyTooLarge:
            return _demasiado_grande(scope)

    def process_exception(self, request, exception):
        # Lo que una vista lea de más lanza BodyTooLarge. DRF ya lo convierte en su respuesta; esto cubre las vistas Django.
        if isinstance(exception, BodyTooLarge):
            return _demasiado_grande(_alcance(request.path_info)[0])
        return None

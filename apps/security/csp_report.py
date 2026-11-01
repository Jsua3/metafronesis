"""Informe de violaciones de la política de contenido (CSP), plan 03 S2-3a (RNF-002).

Los navegadores envían aquí las violaciones de ``SECURE_CSP_REPORT_ONLY`` (``report-uri /api/security/csp-report``).
Es una ruta PÚBLICA y anónima: no mira credenciales, la limita ``CspReportIpThrottle`` y no guarda nada en la base.
Cada informe deja UNA línea ``csp_violation`` en ``siep.security`` con cinco campos fijos: del documento solo la ruta
(sin consulta ni fragmento); del recurso bloqueado, el esquema y el host.
"""
import io
import json
import logging
import re
from urllib.parse import urlsplit

from rest_framework import status
from rest_framework.exceptions import ParseError
from rest_framework.parsers import BaseParser, JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from shared.exceptions import ApiError

from .throttling import CspReportIpThrottle

logger = logging.getLogger("siep.security")

#: Tope del cuerpo de un informe (8 KB): un informe real pesa unos cientos de bytes.
TOPE_BYTES = 8192
#: De un ``application/reports+json`` se registran, como mucho, los primeros elementos: tres informes por petición.
MAX_INFORMES = 3
DIRECTIVA_MAX = 40
#: Tope de ``blocked`` (esquema y host del recurso bloqueado): ni el esquema ni el host tienen longitud propia.
BLOQUEADO_MAX = 255
RUTA_MAX = 120
#: Valores de ``blocked-uri`` que no son una URL y se registran tal cual.
_PALABRAS_BLOQUEO = frozenset({"inline", "eval", "data", "blob", "self"})
_NUMERICO = re.compile(r"[0-9]+")
_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


class _JsonBase(BaseParser):
    """Lee el cuerpo como JSON; cada subclase declara su tipo de medio. Un JSON que no se lee es un ``ParseError``."""

    def parse(self, stream, media_type=None, parser_context=None):
        try:
            return json.loads(stream.read().decode("utf-8"))
        except (ValueError, RecursionError) as exc:  # JSONDecodeError y UnicodeDecodeError son ValueError
            raise ParseError("El cuerpo no es JSON.") from exc


class CspReportParser(_JsonBase):
    """``application/csp-report``: el formato clásico, ``{"csp-report": {...}}``."""

    media_type = "application/csp-report"


class ReportsJsonParser(_JsonBase):
    """``application/reports+json``: una lista de informes de la API de informes del navegador."""

    media_type = "application/reports+json"


def _demasiado_grande():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("REQUEST_TOO_LARGE", "El informe supera el tamaño permitido de 8 KB.", 413)


def _no_es_un_informe():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("VALIDATION_ERROR", "El cuerpo no es un informe de la política de contenido.", 400)


def _longitud_requerida():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("LENGTH_REQUIRED", "El informe debe declarar su tamaño (Content-Length).", 411)


def _tipo_no_admitido():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("UNSUPPORTED_MEDIA_TYPE", "Tipo de contenido no admitido para un informe de CSP.", 415)


def _leer_cuerpo(request):
    """Los bytes del cuerpo, sin pasar de ``TOPE_BYTES``.

    El informe DEBE declarar ``Content-Length`` (los navegadores siempre lo envían): se lee exactamente lo declarado y,
    si lo declarado supera el tope, se responde 413 sin leer nada. Sin la cabecera se responde 411: Django y DRF tratan
    ese caso como cuerpo vacío y leer el flujo crudo del servidor sin saber cuánto viene puede dejar la petición
    esperando datos que no llegan (PEP 3333). Un valor que no sea solo dígitos ASCII también responde 411, y uno que
    ``int()`` no convierte (más de 4300 dígitos) responde 413: nunca un 500.
    """
    declarada = (request.META.get("CONTENT_LENGTH") or "").strip()
    # Solo dígitos ASCII (RFC 9110): str.isdigit() acepta dígitos Unicode como «²», que int() no convierte.
    if not (declarada.isascii() and declarada.isdigit()):
        raise _longitud_requerida()
    try:
        longitud = int(declarada)
    except ValueError as exc:
        raise _demasiado_grande() from exc
    if longitud > TOPE_BYTES:
        raise _demasiado_grande()
    flujo = request.META.get("wsgi.input")
    return flujo.read(longitud) if flujo is not None else b""


def _analizar(analizador, cuerpo):
    try:
        return analizador.parse(io.BytesIO(cuerpo), None, {"encoding": "utf-8"})
    except (ParseError, RecursionError) as exc:
        raise _no_es_un_informe() from exc


def _informes(datos):
    """Los cuerpos de los informes que se registran. Un objeto sin ``csp-report`` o un valor que no es objeto ni lista es un 400."""
    if isinstance(datos, dict):
        informe = datos.get("csp-report")
        if not isinstance(informe, dict):
            raise _no_es_un_informe()
        return [informe]
    if isinstance(datos, list):
        return [
            elemento["body"]
            for elemento in datos[:MAX_INFORMES]
            if isinstance(elemento, dict)
            and elemento.get("type", "csp-violation") == "csp-violation"
            and isinstance(elemento.get("body"), dict)
        ]
    raise _no_es_un_informe()


def _campo(informe, *claves):
    """El primer valor de texto que traiga el informe entre ``claves`` (el formato clásico y el de reportes usan nombres distintos)."""
    for clave in claves:
        valor = informe.get(clave)
        if isinstance(valor, str):
            return valor
    return ""


def _directiva(valor):
    """La directiva violada: solo letras minúsculas y guiones, como mucho ``DIRECTIVA_MAX`` caracteres."""
    return re.sub(r"[^a-z-]", "", valor)[:DIRECTIVA_MAX]


def _recurso_bloqueado(valor):
    """Solo el esquema y el host del recurso bloqueado (sin usuario, ruta, consulta ni fragmento), o la palabra clave.

    Como mucho ``BLOQUEADO_MAX`` caracteres.
    """
    if valor in _PALABRAS_BLOQUEO:
        return valor
    try:
        partes = urlsplit(valor)
    except ValueError:
        return ""
    if not partes.scheme:
        return ""
    recurso = f"{partes.scheme}://{partes.netloc.rsplit('@', 1)[-1]}" if partes.netloc else partes.scheme
    return recurso[:BLOQUEADO_MAX]


def _ruta_del_documento(valor):
    """La ruta del documento: sin esquema, host, consulta ni fragmento; los números y los uuid cambian por ``:id``."""
    try:
        partes = urlsplit(valor)
    except ValueError:
        return ""
    if not partes.netloc:
        return ""
    segmentos = [
        ":id" if _NUMERICO.fullmatch(segmento) or _UUID.fullmatch(segmento) else segmento
        for segmento in (partes.path or "/").split("/")
    ]
    return "/".join(segmentos)[:RUTA_MAX]


def _disposicion(valor):
    return valor if valor in {"report", "enforce"} else ""


def _registrar(informe):
    logger.info(
        "security_event",
        extra={
            "fields": {
                "event": "csp_violation",
                "directive": _directiva(_campo(informe, "effective-directive", "violated-directive", "effectiveDirective")),
                "blocked": _recurso_bloqueado(_campo(informe, "blocked-uri", "blockedURL")),
                "document_path": _ruta_del_documento(_campo(informe, "document-uri", "documentURL")),
                "disposition": _disposicion(_campo(informe, "disposition")),
            }
        },
    )


class CspReportView(APIView):
    """``POST /api/security/csp-report``: recibe un informe de violación y responde 204 sin cuerpo.

    Pública y anónima a propósito: el navegador envía el informe sin sesión. La protegen el límite por IP y el tope de
    8 KB; no se guarda nada en la base de datos.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [CspReportIpThrottle]
    parser_classes = [CspReportParser, ReportsJsonParser, JSONParser]

    def post(self, request, *args, **kwargs):
        analizador = request.negotiator.select_parser(request, self.get_parsers())
        if analizador is None:
            raise _tipo_no_admitido()
        datos = _analizar(analizador, _leer_cuerpo(request))
        for informe in _informes(datos):
            _registrar(informe)
        return Response(status=status.HTTP_204_NO_CONTENT)

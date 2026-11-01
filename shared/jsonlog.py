"""Formato JSON de los logs (una línea por registro) con el id de la request y sin credenciales (S4-3)."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from shared.middleware import request_id_var

REDACTADO = "[REDACTADO]"
#: Lo que sale en un campo cuya redacción falla: la línea de registro no se pierde por eso.
REDACCION_FALLIDA = "[REDACCION_FALLIDA]"

#: Nombres de clave que llevan una credencial. Se comparan en minúsculas y por subcadena.
CLAVES_SENSIBLES = (
    "authorization",
    "password",
    "passwd",
    "token",
    "credential",
    "secret",
    "temporarypassword",
    "cookie",
)

_PALABRA_SENSIBLE = r"(?:authorization|password|passwd|token|credential|secret|temporarypassword)"

#: ``clave: valor``, ``clave=valor`` y ``"clave": "valor"`` en texto libre. Un valor entre comillas conserva sus
#: comillas; uno suelto puede empezar por ``Bearer``/``Basic``/``Digest`` y entonces se sustituye la cabecera entera.
#: La clave arranca al principio de un token: sin ese ancla, un texto largo de letras costaría un tiempo cuadrático. Y lo
#: que rodea a la palabra sensible tiene tope (``{0,120}``): sin él, un token hecho de la palabra repetida
#: (``passwordpassword…``, 4 KB en una ruta sin autenticar) volvía a recorrer el resto en cada aparición, otra vez O(n²)
#: (revisión S7-2, #1: 165 ms de CPU por petición, ~9 s con 40 000 caracteres).
_CLAVE_VALOR = re.compile(
    r"(?<![\w.-])(?P<clave>[\w.-]{0,120}" + _PALABRA_SENSIBLE + r"[\w.-]{0,120}[\"']?\s*[:=]\s*)"
    r"(?:(?P<comilla>[\"'])(?:\\.|(?!(?P=comilla))[^\\\n])*(?P=comilla)"
    r"|(?:(?:bearer|basic|digest)\s+)?[^\s\"',;&})\]]+)",
    re.IGNORECASE,
)
_BEARER = re.compile(r"(\bBearer\s+)[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
#: Un JWT suelto: tres segmentos base64url separados por puntos, el primero de una cabecera ``eyJ…``.
_JWT = re.compile(r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*")


class RequestIdFilter(logging.Filter):
    """Pone el ``request_id`` vigente en todo registro que no lo traiga."""

    def filter(self, record):
        if not hasattr(record, "request_id"):
            # django.request registra las 4xx/5xx fuera del middleware, con la
            # request en el registro y el ContextVar ya restablecido.
            request = getattr(record, "request", None)
            record.request_id = getattr(request, "request_id", None) or request_id_var.get()
        return True


def _clave_sensible(clave) -> bool:
    return isinstance(clave, str) and any(palabra in clave.lower() for palabra in CLAVES_SENSIBLES)


def _sustituir_valor(m) -> str:
    comilla = m.group("comilla")
    if comilla:
        return f"{m.group('clave')}{comilla}{REDACTADO}{comilla}"
    return f"{m.group('clave')}{REDACTADO}"


def _redactar_texto(texto: str) -> str:
    # El orden importa: primero los pares clave-valor (que se llevan también la cabecera ``Bearer``), luego la
    # cabecera suelta y, por último, los JWT que queden sin clave.
    texto = _CLAVE_VALOR.sub(_sustituir_valor, texto)
    texto = _BEARER.sub(lambda m: m.group(1) + REDACTADO, texto)
    return _JWT.sub(REDACTADO, texto)


def _valor_de_clave(clave, valor):
    return REDACTADO if _clave_sensible(clave) else redact(valor)


def redact(value):
    """Copia de ``value`` sin credenciales: por nombre de clave en los diccionarios y por patrón en el texto libre.

    Es pura: no modifica ``value``. Lo que no sea texto, diccionario, lista ni tupla se devuelve tal cual.
    """
    if isinstance(value, str):
        return _redactar_texto(value)
    if isinstance(value, dict):
        return {clave: _valor_de_clave(clave, valor) for clave, valor in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact(item) for item in value)
    return value


def _seguro(funcion, *args):
    """Aplica ``funcion``; si falla, devuelve el marcador: una redacción que falla no puede perder la línea."""
    try:
        return funcion(*args)
    except Exception:  # noqa: BLE001 - el registro sale aunque un campo no se pueda redactar
        return REDACCION_FALLIDA


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": _seguro(redact, record.getMessage()),
            "request_id": getattr(record, "request_id", "-"),
        }
        for clave, valor in (getattr(record, "fields", None) or {}).items():
            payload[clave] = _seguro(_valor_de_clave, clave, valor)
        if record.exc_info:
            payload["exc"] = _seguro(redact, self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False, default=str)

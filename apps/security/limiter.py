"""Contador atómico de peticiones por alcance y ventana, en PostgreSQL (S1-2, DJA-2).

``hit`` suma una petición y devuelve el contador de la ventana vigente; ``peek`` lo lee sin sumar. Los dos
fallan ABIERTOS: si la base no responde devuelven 0 (la petición pasa) y dejan rastro en ``siep.security``.
La clave que recibe ``hit``/``peek`` ya es un hash (``key_hash``): ni el correo ni la IP se guardan en claro.
"""
import functools
import hashlib
import hmac
import logging
import math
import time

from django.conf import settings
from django.db import DatabaseError, connection

from shared.security_events import log_security_event

from .limits import LIMITS

#: Separa las partes de ``key_hash``; no puede aparecer en un correo ni en una dirección IP.
_SEPARADOR = "\x1f"


def _now() -> float:
    """Segundos desde la época. Envoltorio de ``time.time`` para que las pruebas fijen el reloj."""
    return time.time()


def _activo() -> bool:
    return bool(getattr(settings, "SIEP_THROTTLE_ENABLED", True))


def _inicio_de_ventana(scope: str) -> int:
    window = LIMITS[scope].window
    return int(_now()) // window * window


def _falla_abierta(scope: str, exc: Exception) -> None:
    # Nunca se registra la clave ni el valor: solo el alcance y el tipo de error (en ``reason``).
    log_security_event("throttle_backend_error", level=logging.WARNING, scope=scope, reason=type(exc).__name__)


@functools.lru_cache(maxsize=4)
def _sal(secret_key: str) -> bytes:
    """Sal propia del limitador, derivada de ``SECRET_KEY``: sin ella un volcado de la tabla se revertiría por
    fuerza bruta (las direcciones IPv4 son solo 2^32). Cambiar la llave solo reinicia los contadores."""
    return hashlib.sha256(b"siep.throttle.v1" + _SEPARADOR.encode() + secret_key.encode("utf-8")).digest()


def key_hash(*partes) -> str:
    """HMAC-SHA256 hexadecimal de las partes unidas por ``_SEPARADOR``: estable, distinto por parte y sin el dato
    en claro ni recuperable sin la llave del servidor. Nunca lanza: un sustituto suelto (hallazgo #8) se codifica
    con ``surrogatepass``, que para el resto de texto da los mismos bytes que UTF-8."""
    mensaje = _SEPARADOR.join(str(parte) for parte in partes).encode("utf-8", "surrogatepass")
    return hmac.new(_sal(settings.SECRET_KEY), mensaje, hashlib.sha256).hexdigest()


def hit(scope: str, key: str) -> int:
    """Suma una petición al contador de (alcance, clave) en la ventana vigente y devuelve su valor."""
    if not _activo():
        return 0
    inicio = _inicio_de_ventana(scope)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO rate_limit_buckets (scope, key_hash, window_start, count) VALUES (%s, %s, %s, 1) "
                "ON CONFLICT (scope, key_hash, window_start) "
                "DO UPDATE SET count = rate_limit_buckets.count + 1 RETURNING count",
                [scope, key, inicio],
            )
            return int(cursor.fetchone()[0])
    except DatabaseError as exc:
        _falla_abierta(scope, exc)
        return 0


def peek(scope: str, key: str) -> int:
    """Lee el contador de la ventana vigente sin sumar nada."""
    if not _activo():
        return 0
    inicio = _inicio_de_ventana(scope)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count FROM rate_limit_buckets WHERE scope = %s AND key_hash = %s AND window_start = %s",
                [scope, key, inicio],
            )
            fila = cursor.fetchone()
            return int(fila[0]) if fila else 0
    except DatabaseError as exc:
        _falla_abierta(scope, exc)
        return 0


def retry_after(scope: str) -> int:
    """Segundos hasta el fin de la ventana vigente del alcance (como mínimo, 1)."""
    window = LIMITS[scope].window
    ahora = _now()
    fin = (int(ahora) // window + 1) * window
    return max(1, math.ceil(fin - ahora))

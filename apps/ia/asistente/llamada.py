"""La llamada al proveedor: clasifica los fallos y lee el JSON de la respuesta.

Los proveedores de metafronesis responden texto (``ProveedorIA.responder``). Aquí se les pide un JSON, se le quitan las
cercas de código que a veces ponen alrededor y cualquier falla se vuelve un ``ErrorDeProveedor`` con un tipo fijo
(``timeout``, ``http``, ``malformed``): el texto de la falla original no se guarda ni sale (puede traer la clave).
"""
import json
import logging
import re
import socket
from urllib.error import URLError

from django.core.exceptions import ImproperlyConfigured

from apps.ia.proveedores import proveedor_para

from .errores import ErrorDeProveedor

logger = logging.getLogger(__name__)


def extraer_json(texto: str):
    """El JSON de la respuesta del proveedor, con o sin las cercas de código que a veces pone alrededor."""
    limpio = texto.strip()
    cercado = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", limpio, re.DOTALL)
    return json.loads(cercado.group(1) if cercado else limpio)


def _tipo_de_falla(error: Exception) -> str:
    causa = error.reason if isinstance(error, URLError) else error
    return "timeout" if isinstance(causa, (TimeoutError, socket.timeout)) else "http"


def completar(config, instrucciones: str, mensajes: list[dict], *, modelo: str, max_tokens: int):
    """El JSON que responde el proveedor a ``instrucciones`` y ``mensajes``, o ``ErrorDeProveedor``."""
    if not config.conectado:
        raise ErrorDeProveedor("http", "proveedor sin configurar")
    try:
        proveedor = proveedor_para(config.provider, config.api_key, modelo)
        texto = proveedor.responder(instrucciones, mensajes, max_tokens=max_tokens, tiempo=config.timeout_seconds)
        return extraer_json(texto)
    except ErrorDeProveedor:
        raise
    except ValueError:
        raise ErrorDeProveedor("malformed", "la respuesta no es un JSON") from None
    except ImproperlyConfigured:
        raise ErrorDeProveedor("http", "proveedor sin configurar") from None
    except Exception as error:  # noqa: BLE001 - toda falla de red o del servicio se clasifica; su texto no sale
        tipo = _tipo_de_falla(error)
        logger.warning("Asistente de autoría: fallo del proveedor (kind=%s, clase=%s)", tipo, type(error).__name__)
        raise ErrorDeProveedor(tipo, type(error).__name__) from None

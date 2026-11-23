"""Guía del asistente de autoría («¿dónde está X?» / «¿cómo hago X?»).

El catálogo de acciones lo manda el cliente (es del editor). El modelo elige una; nunca se confía en su salida:
un ``accionId`` fuera del catálogo es ``null``, un ``modo`` desconocido es ``foco`` y un mensaje inservible o con
contenido gráfico se cambia por un texto fijo.
"""
import re

from apps.ia.privacidad import sin_datos_personales

from . import esquema, llamada, prompts
from .errores import ErrorDeProveedor

MAX_MESSAGE = 300
MAX_TOKENS = 600
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
FALLBACK_MESSAGE = "No encontré esa acción. Prueba con el buscador de acciones."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
FOUND_MESSAGE = "Te muestro dónde está."


def _truncate(text: str) -> str:
    """Recorta en el límite de una palabra y agrega «…» (el resultado nunca pasa de ``MAX_MESSAGE``)."""
    if len(text) <= MAX_MESSAGE:
        return text
    cut = text[: MAX_MESSAGE - 1]
    if not text[MAX_MESSAGE - 1].isspace():
        cut = re.sub(r"\s*\S*$", "", cut) or cut
    return cut.rstrip() + "…"


def _message(raw) -> str:
    """El mensaje del modelo si sirve (texto no vacío, sin marcadores gráficos); si no, el texto fijo."""
    if not isinstance(raw, str) or not raw.strip():
        return FALLBACK_MESSAGE
    text = _truncate(raw.strip())
    if prompts.check_text(text) == prompts.GRAPHIC_REASON:
        return FALLBACK_MESSAGE
    return text


def responder(*, config, pregunta, acciones) -> dict:
    """Devuelve ``{accionId, modo, mensaje, model, changes}`` para ``pregunta`` según el catálogo ``acciones``."""
    if not config.conectado:
        raise ErrorDeProveedor("http", "proveedor sin configurar")
    resultado = {"accionId": None, "modo": "foco", "mensaje": FALLBACK_MESSAGE, "model": config.model_fast, "changes": 0}
    if not acciones:
        return resultado
    contenido = sin_datos_personales(prompts.guide_message(pregunta, acciones))
    crudo = llamada.completar(
        config, prompts.instrucciones_guia(), [{"role": "user", "content": contenido}],
        modelo=config.model_fast, max_tokens=MAX_TOKENS,
    )
    if not isinstance(crudo, dict):
        return resultado
    conocidas = {accion["id"] for accion in acciones}
    accion_id = crudo.get("accionId")
    resultado["accionId"] = accion_id if isinstance(accion_id, str) and accion_id in conocidas else None
    resultado["modo"] = crudo["modo"] if crudo.get("modo") in esquema.MODOS_DE_GUIA else "foco"
    resultado["mensaje"] = _message(crudo.get("mensaje"))
    if resultado["accionId"] and resultado["mensaje"] == FALLBACK_MESSAGE:
        # La acción sí existe: decir «no encontré» junto a un resaltado sería contradictorio.
        resultado["mensaje"] = FOUND_MESSAGE
    return resultado

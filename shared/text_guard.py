"""El byte NUL (0x00) y los sustitutos sueltos no se admiten en la ruta, la consulta ni el cuerpo (S7-1a y revisión S7-2, #8).

PostgreSQL no guarda un NUL en un texto (``DataError``: «text fields cannot contain NUL»). Los serializadores de DRF ya lo
prohíben, pero un servicio que lee un parámetro de la ruta, de la consulta o un campo del cuerpo sin pasar por uno
respondía 500. Un sustituto suelto (U+D800 a U+DFFF, que un JSON puede escribir como una secuencia de escape) tampoco se
puede codificar a UTF-8 y daba el mismo 500. Aquí se responde 400 antes de llegar a la vista: este middleware revisa la ruta
y la consulta, y los analizadores de ``shared.parsers`` (JSON, formulario y multipart) revisan el cuerpo con ``contiene_nul``.
"""
import re

from django.http import JsonResponse

from shared.security_events import log_security_event

NUL = "\x00"
#: Lo que ningún texto puede llevar para guardarse: el NUL y los sustitutos sueltos (U+D800 a U+DFFF).
_INVALIDO = re.compile("[\x00\ud800-\udfff]")
CODIGO_NUL = "REQUEST_INVALID_TEXT"
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
MENSAJE_NUL = "La petición trae un carácter que no se admite."


def contiene_nul(valor):
    """``True`` si el texto, o algún texto dentro de la lista o el objeto (claves incluidas), lleva un NUL o un sustituto suelto.

    Recorre con una pila y no con recursión: un cuerpo anidado a miles de niveles no puede agotar la pila de Python.
    """
    pila = [valor]
    while pila:
        actual = pila.pop()
        if isinstance(actual, str):
            if _INVALIDO.search(actual):
                return True
        elif isinstance(actual, dict):
            pila.extend(actual.keys())
            pila.extend(actual.values())
        elif isinstance(actual, (list, tuple)):
            pila.extend(actual)
    return False


def nul_rechazado():
    """El 400 del NUL en el cuerpo (el middleware responde lo mismo para la ruta y la consulta)."""
    # Importación perezosa: DRF carga ``shared.parsers`` al leer sus ajustes, mientras ``shared.exceptions`` (que importa
    # DRF) todavía se está inicializando.
    from shared.exceptions import ApiError

    return ApiError(CODIGO_NUL, MENSAJE_NUL, 400)


def _donde_hay_nul(request):
    """``"path"``, ``"query"`` o ``None``: dónde trae la petición un NUL (``path_info`` y la consulta ya vienen decodificados)."""
    if NUL in request.path_info:
        return "path"
    if contiene_nul(dict(request.GET.lists())):
        return "query"
    return None


class NulByteMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        donde = _donde_hay_nul(request)
        if donde is not None:
            log_security_event("nul_rejected", scope=donde)
            return JsonResponse({"success": False, "code": CODIGO_NUL, "message": MENSAJE_NUL}, status=400)
        return self.get_response(request)

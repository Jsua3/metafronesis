"""Idempotencia de las órdenes del intento (E1-3, RNF-08, TD-04).

Cada orden que cambia el intento (decidir, usar una herramienta, cruzar una puerta,
guardar la bitácora) puede llevar un ``requestId`` elegido por el cliente. La misma
orden repetida (doble clic, reintento de red, dos pestañas) no se vuelve a aplicar:
el servidor devuelve la respuesta de la primera vez. Aquí vive solo lo que no depende
de los modelos: el formato de la clave y la ventana de duplicado.
"""
import re

from rest_framework.exceptions import ValidationError

#: Sin ``requestId``, la misma decisión sobre la misma opción dentro de esta ventana (segundos)
#: se trata como un duplicado y no como una respuesta nueva: es el doble clic.
DUPLICATE_WINDOW_SECONDS = 2

_REQUEST_ID = re.compile(r"[A-Za-z0-9._:-]{8,64}")


def normalize_request_id(value):
    """Devuelve el ``requestId`` válido o ``None`` si no vino; un formato malo es un 400.

    Letras, números, ``.``, ``_``, ``:`` y ``-``, de 8 a 64 caracteres (un UUID cabe).
    """
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not _REQUEST_ID.fullmatch(value):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ValidationError(
            "requestId inválido: use de 8 a 64 caracteres entre letras, números, «.», «_», «:» y «-»"
        )
    return value

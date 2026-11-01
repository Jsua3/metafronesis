"""Analizadores de cuerpo propios de la API."""
from rest_framework.exceptions import ParseError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from shared.text_guard import contiene_nul, nul_rechazado


class ObjectJSONParser(JSONParser):
    """Un cuerpo JSON debe ser un objeto, de profundidad razonable y sin NUL: si no, es un 400.

    Casi toda vista hace ``request.data.get(...)``; con ``[]`` o ``7`` eso era un
    ``AttributeError`` (500). Ningún endpoint de la API recibe una lista en la raíz.
    S7-1a: un JSON anidado a miles de niveles agotaba la pila de ``json`` (``RecursionError``, que no es un
    ``ValueError``) y respondía 500; un NUL escapado dentro de un texto que el servicio lee sin serializador llegaba a
    PostgreSQL, que lo rechaza (también 500). Revisión S7-2 (#8): lo mismo con un sustituto suelto, que no se puede
    codificar a UTF-8.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        try:
            data = super().parse(stream, media_type, parser_context)
        except RecursionError:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise ParseError("El cuerpo de la petición tiene demasiados niveles de anidación.") from None
        if not isinstance(data, dict):
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise ParseError("El cuerpo de la petición debe ser un objeto JSON.")
        if contiene_nul(data):
            raise nul_rechazado()
        return data


def _como_diccionario(consulta):
    """Un ``QueryDict`` como ``{clave: [valores]}``: ``values()`` solo daría el último valor de cada clave."""
    return dict(consulta.lists())


class ObjectFormParser(FormParser):
    """Un formulario urlencoded sin NUL ni sustitutos sueltos (revisión S7-2, #8): el servicio que lee un campo crudo no pasa
    por el serializador que ya los prohíbe, y PostgreSQL rechaza el NUL (500)."""

    def parse(self, stream, media_type=None, parser_context=None):
        data = super().parse(stream, media_type, parser_context)
        if contiene_nul(_como_diccionario(data)):
            raise nul_rechazado()
        return data


class ObjectMultiPartParser(MultiPartParser):
    """Un multipart sin NUL ni sustitutos sueltos en sus campos de texto (los archivos no se revisan aquí: los lee su servicio)."""

    def parse(self, stream, media_type=None, parser_context=None):
        resultado = super().parse(stream, media_type, parser_context)
        if contiene_nul(_como_diccionario(resultado.data)):
            raise nul_rechazado()
        return resultado

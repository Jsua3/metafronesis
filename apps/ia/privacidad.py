"""El filtro de datos personales: nada identificable sale hacia un proveedor de IA."""
import re

#: Correos y secuencias largas de dígitos (teléfonos, documentos) no salen hacia el proveedor (Ley 1581).
#: Con topes de longitud (64 para la parte local y 63 por etiqueta del dominio, los máximos del estándar de correo) el
#: retroceso queda acotado y la búsqueda es lineal sobre textos largos.
_CORREO = re.compile(r"[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}")
_NUMERO_LARGO = re.compile(r"\d(?:[\s.-]?\d){6,}")


def sin_datos_personales(texto: str) -> str:
    return _NUMERO_LARGO.sub("[número]", _CORREO.sub("[correo]", texto))

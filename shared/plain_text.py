"""Texto plano para los campos que ve otra persona (S1-3): COPIA de ``apps/simulation/casedef/text.py``.

``plain_text_problem`` dice qué le pasa a un texto (o ``None``) sin lanzar nada. Esta copia solo usa ``re``, para que
el registro no dependa de Django ni de DRF. ``apps/simulation/tests/test_plain_text_parity.py`` vigila que siga
diciendo lo mismo que la original: si la regla cambia allí, cambia aquí. No se edita ``casedef`` desde aquí.
"""
import re
import unicodedata

NOT_TEXT = "NOT_TEXT"
TOO_LONG = "TOO_LONG"
CONTROL = "CONTROL"
MULTILINE = "MULTILINE"
MARKUP = "MARKUP"
LINK = "LINK"

#: Una etiqueta o un comentario HTML: ``<b>``, ``</p>``, ``<script``, ``<!--``, ``<?xml``. Un ``<`` que no abre
#: nada («edad < 18», «a < b») es texto y se acepta.
TAG = re.compile(r"<(?:/?[A-Za-z]|[!?])")
#: Un enlace: ``https://…``, ``ftp://…``, ``www.…`` o un esquema que ejecuta o abre algo.
LINK_PATTERN = re.compile(
    r"(?:\b[A-Za-z][A-Za-z0-9+.-]{1,15}://|\bwww\.|\b(?:javascript|vbscript|data|mailto)\s*:)",
    re.IGNORECASE,
)
#: Caracteres de control salvo salto de línea, retorno y tabulación.
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
LINE_BREAK = re.compile(r"[\r\n]")

# BORRADOR: los textos de error son nuevos del servidor, pendientes de Psicología (VD-23).
MESSAGES = {
    NOT_TEXT: "Debe ser un texto.",
    CONTROL: "Contiene caracteres que no se admiten.",
    MULTILINE: "Debe escribirse en una sola línea.",
    MARKUP: "Debe ser texto plano, sin etiquetas ni formato.",
    LINK: "Debe ser texto plano, sin enlaces.",
}


def too_long_message(max_length):
    # BORRADOR: texto nuevo del servidor, pendiente de Psicología (VD-23).
    return f"No puede superar los {max_length} caracteres."


def plain_text_problem(value, max_length, *, multiline=False):
    """``(código, mensaje)`` del primer problema del texto, o ``None`` si es texto plano válido.

    Un texto vacío no es un problema aquí (que sea obligatorio lo decide quien llama). El orden es el de siempre:
    tipo, tope, caracteres de control, saltos de línea, etiquetas y enlaces.
    """
    if not isinstance(value, str):
        return NOT_TEXT, MESSAGES[NOT_TEXT]
    text = value.strip()
    if not text:
        return None
    if len(text) > max_length:
        return TOO_LONG, too_long_message(max_length)
    if CONTROL_CHARS.search(text):
        return CONTROL, MESSAGES[CONTROL]
    if not multiline and LINE_BREAK.search(text):
        return MULTILINE, MESSAGES[MULTILINE]
    if TAG.search(text):
        return MARKUP, MESSAGES[MARKUP]
    if LINK_PATTERN.search(text):
        return LINK, MESSAGES[LINK]
    return None


#: R1b · lo que ``plain_text_problem`` no ve y un correo institucional sí: separadores de línea y de párrafo (U+2028,
#: U+2029), NEL (U+0085), marcas bidireccionales (U+061C, U+200E-U+200F, U+202A-U+202E, U+2066-U+2069), caracteres de
#: ancho cero (U+200B-U+200D) y el BOM (U+FEFF). Cambian cómo se lee un texto sin que se vea.
#: Los rangos van en código para que el archivo sea legible (los puntos son ambos incluidos).
_RANGOS_INVISIBLES = (
    (0x0085, 0x0085), (0x2028, 0x2029), (0x061C, 0x061C), (0x200B, 0x200F), (0x202A, 0x202E), (0x2066, 0x2069),
    (0xFEFF, 0xFEFF),
)
INVISIBLE_O_DE_DIRECCION = re.compile("[" + "".join(chr(a) + "-" + chr(b) for a, b in _RANGOS_INVISIBLES) + "]")
#: Un dominio desnudo: dos o más letras, un punto y otras dos o más letras sin espacio («login.siep»).
DOMINIO_DESNUDO = re.compile(r"[^\W\d_]{2,}\.[^\W\d_]{2,}")
#: Lo que un nombre de persona admite además de las letras y los espacios.
PUNTUACION_DE_NOMBRE = frozenset("'’-.")

# BORRADOR: textos de error nuevos del servidor, pendientes de Psicología (VD-23).
MENSAJE_INVISIBLE = "Contiene caracteres invisibles o de dirección de lectura, que no se admiten."
MENSAJE_DOMINIO = "Parece un dominio de correo o de sitio web, que no se admite en este texto."
MENSAJE_PERSONA = "Un nombre solo admite letras, espacios, apóstrofos, guiones y puntos."


def texto_visible_problem(value, max_length):
    """Mensaje del primer problema de un texto que ve otra persona (o ``None``): lo de ``plain_text_problem`` y, además,
    los invisibles y de dirección y los dominios desnudos. Vale también para nombres de grupo, que no son de persona."""
    problema = plain_text_problem(value, max_length)
    if problema is not None:
        return problema[1]
    texto = unicodedata.normalize("NFC", value)
    if INVISIBLE_O_DE_DIRECCION.search(texto):
        return MENSAJE_INVISIBLE
    if DOMINIO_DESNUDO.search(texto):
        return MENSAJE_DOMINIO
    return None


def person_text_problem(value, max_length=100):
    """Mensaje del primer problema de un nombre o apellido de persona (o ``None``): lo de ``texto_visible_problem`` y,
    además, solo letras Unicode, espacios, apóstrofos, guiones y puntos. ``J.R. Tolkien`` y ``Mª José`` pasan."""
    problema = texto_visible_problem(value, max_length)
    if problema is not None:
        return problema
    if not value.strip():
        return None
    texto = unicodedata.normalize("NFC", value)
    for caracter in texto:
        if not (caracter.isalpha() or caracter.isspace() or caracter in PUNTUACION_DE_NOMBRE):
            return MENSAJE_PERSONA
    return None

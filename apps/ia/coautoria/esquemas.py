"""La forma de lo que la IA coautora devuelve (una pregunta o la ficha acordada) y su validación en Python.

Igual que en el asistente por partes: el esquema viaja en las instrucciones, pero lo que vuelve nunca se cree. ``pregunta`` y
``ficha`` revisan forma, vocabulario cerrado, largos, texto plano y las reglas de contenido; ante cualquier falla lanzan
``CoautoriaInvalida`` con un motivo fijo que no cita al modelo.
"""
from apps.ia.asistente.prompts import check_text
from apps.ia.privacidad import sin_datos_personales
from shared.plain_text import plain_text_problem

#: Preguntas que la IA puede hacer como máximo (el servidor lo impone, no el modelo).
TOPE_PREGUNTAS = 6
#: Llamadas al proveedor que admite un acuerdo (preguntas, reintentos, resúmenes y cambios).
TOPE_LLAMADAS = 14
AMBITOS = ("historia", "personajes", "lugar", "evaluacion")
INTENSIDADES = ("LOW", "MEDIUM", "HIGH")
MOMENTOS = ("dia", "noche")

MAX_PREGUNTA = 300
MAX_PORQUE = 200
MAX_OPCION = 160

# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
MOTIVO_FORMA = "La IA respondió algo que no tiene la forma esperada."
MOTIVO_CONTENIDO = "La IA propuso un texto que no cumple las reglas de contenido."


class CoautoriaInvalida(Exception):
    def __init__(self, motivo: str):
        super().__init__(motivo)
        self.motivo = motivo


def _obj(propiedades: dict) -> dict:
    return {"type": "object", "properties": propiedades, "required": list(propiedades), "additionalProperties": False}


_TEXTO = {"type": "string"}

PREGUNTA = _obj({
    "listo": {"type": "boolean"},
    "ambito": {"type": "string", "enum": list(AMBITOS)},
    "pregunta": _TEXTO,
    "porque": _TEXTO,
    "opciones": {"type": "array", "items": _TEXTO},
    "recomendada": {"type": "integer"},
})

#: Campo de la ficha → (tope de caracteres, mínimo de elementos, máximo de elementos) en las listas.
FICHA = _obj({
    "titulo": _TEXTO,
    "objetivo": _TEXTO,
    "personajes": {"type": "array", "items": _obj({"nombre": _TEXTO, "descripcion": _TEXTO})},
    "lugar": _TEXTO,
    "momento": {"type": "string", "enum": list(MOMENTOS)},
    "escenas": {"type": "array", "items": _obj({"titulo": _TEXTO, "proposito": _TEXTO})},
    "hitos": {"type": "array", "items": _TEXTO},
    "finales": {"type": "array", "items": _obj({"titulo": _TEXTO, "descripcion": _TEXTO})},
    "intensidad": {"type": "string", "enum": list(INTENSIDADES)},
    "temasSensibles": {"type": "array", "items": _TEXTO},
})

#: Largo máximo de cada texto de la ficha.
LARGOS = {
    "titulo": 120, "objetivo": 400, "lugar": 240, "nombre": 60, "descripcion": 300, "proposito": 300, "hito": 160,
    "tema": 120,
}
#: Cuántos elementos admite cada lista de la ficha: (mínimo, máximo).
CUANTOS = {"personajes": (1, 6), "escenas": (2, 8), "hitos": (0, 6), "finales": (1, 4), "temasSensibles": (0, 6)}


def _texto(valor, tope: int, *, vacio: bool = False) -> str:
    if not isinstance(valor, str):
        raise CoautoriaInvalida(MOTIVO_FORMA)
    limpio = " ".join(valor.split())
    if (not limpio and not vacio) or len(limpio) > tope or plain_text_problem(limpio, tope) is not None:
        raise CoautoriaInvalida(MOTIVO_FORMA)
    if check_text(limpio) is not None or sin_datos_personales(limpio) != limpio:
        raise CoautoriaInvalida(MOTIVO_CONTENIDO)
    return limpio


def _claves(valor, esquema: dict) -> dict:
    if not isinstance(valor, dict) or set(valor) != set(esquema["properties"]):
        raise CoautoriaInvalida(MOTIVO_FORMA)
    return valor


def _entero(valor) -> int:
    if isinstance(valor, bool) or not isinstance(valor, int):
        raise CoautoriaInvalida(MOTIVO_FORMA)
    return valor


def pregunta(crudo) -> dict | None:
    """La pregunta validada, o ``None`` si la IA dice que ya tiene lo que necesita (``listo``)."""
    datos = _claves(crudo, PREGUNTA)
    if not isinstance(datos["listo"], bool):
        raise CoautoriaInvalida(MOTIVO_FORMA)
    if datos["listo"]:
        return None
    if datos["ambito"] not in AMBITOS:
        raise CoautoriaInvalida(MOTIVO_FORMA)
    opciones = datos["opciones"]
    if not isinstance(opciones, list) or len(opciones) != 3:
        raise CoautoriaInvalida(MOTIVO_FORMA)
    limpias = [_texto(opcion, MAX_OPCION) for opcion in opciones]
    if len({opcion.casefold() for opcion in limpias}) != 3:
        raise CoautoriaInvalida(MOTIVO_FORMA)
    recomendada = _entero(datos["recomendada"])
    if not 0 <= recomendada <= 2:
        raise CoautoriaInvalida(MOTIVO_FORMA)
    return {
        "ambito": datos["ambito"],
        "texto": _texto(datos["pregunta"], MAX_PREGUNTA),
        "porque": _texto(datos["porque"], MAX_PORQUE),
        "opciones": limpias,
        "recomendada": recomendada,
    }


def _lista(valor, campo: str) -> list:
    minimo, maximo = CUANTOS[campo]
    if not isinstance(valor, list) or not minimo <= len(valor) <= maximo:
        raise CoautoriaInvalida(MOTIVO_FORMA)
    return valor


def ficha(crudo) -> dict:
    """La ficha «Lo que acordamos» validada y con los espacios normalizados."""
    datos = _claves(crudo, FICHA)
    if datos["momento"] not in MOMENTOS or datos["intensidad"] not in INTENSIDADES:
        raise CoautoriaInvalida(MOTIVO_FORMA)
    personajes = [_claves(p, FICHA["properties"]["personajes"]["items"]) for p in _lista(datos["personajes"], "personajes")]
    escenas = [_claves(e, FICHA["properties"]["escenas"]["items"]) for e in _lista(datos["escenas"], "escenas")]
    finales = [_claves(f, FICHA["properties"]["finales"]["items"]) for f in _lista(datos["finales"], "finales")]
    return {
        "titulo": _texto(datos["titulo"], LARGOS["titulo"]),
        "objetivo": _texto(datos["objetivo"], LARGOS["objetivo"]),
        "personajes": [
            {"nombre": _texto(p["nombre"], LARGOS["nombre"]), "descripcion": _texto(p["descripcion"], LARGOS["descripcion"])}
            for p in personajes
        ],
        "lugar": _texto(datos["lugar"], LARGOS["lugar"]),
        "momento": datos["momento"],
        "escenas": [
            {"titulo": _texto(e["titulo"], LARGOS["titulo"]), "proposito": _texto(e["proposito"], LARGOS["proposito"])}
            for e in escenas
        ],
        "hitos": [_texto(h, LARGOS["hito"]) for h in _lista(datos["hitos"], "hitos")],
        "finales": [
            {"titulo": _texto(f["titulo"], LARGOS["titulo"]), "descripcion": _texto(f["descripcion"], LARGOS["descripcion"])}
            for f in finales
        ],
        "intensidad": datos["intensidad"],
        "temasSensibles": [_texto(t, LARGOS["tema"]) for t in _lista(datos["temasSensibles"], "temasSensibles")],
    }

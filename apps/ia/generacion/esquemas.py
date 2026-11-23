"""Los dos esquemas JSON de la generación por etapas: el esqueleto del caso y una escena.

Planos, con todo campo obligatorio y sin uniones: lo opcional es ``""`` o ``[]`` y las condiciones viajan como texto con el
JSON de la gramática de ``casedef.conditions`` (``""`` es sin condición). Los topes los mide ``comprobaciones.py`` en Python:
el modelo nunca es la autoridad.

``escenas[].sala`` es el id de la sala y hace de clave de la escena; ``persona`` es la clave de objeto de la persona a
atender en esa sala; los ``personaje`` son claves de personaje de la biblioteca.
"""
from apps.simulation.models.vocabulary import Intensity, ResponseClass
from apps.simulation.services.disponibilidad_mundo import EXPRESIONES, GESTOS

MINIMO_ESCENAS = 4
MAXIMO_ESCENAS = 6
MINIMO_OPCIONES = 3
MAXIMO_OPCIONES = 4
MAXIMO_LINEAS = 8
MAXIMO_PISTAS = 3
MAXIMO_COMENTARIOS = 6
MAXIMO_OBJETIVOS = 5
MINIMO_FINALES = 2
MAXIMO_FINALES = 4
TONOS_DE_FINAL = ("critical", "positive", "warning", "neutral")

TEXTO = {"type": "string"}
BOOLEANO = {"type": "boolean"}
#: El efecto de una respuesta sobre la persona consultante: -1, 0 o 1 (un entero con enum, no una unión).
PASO = {"type": "integer", "enum": [-1, 0, 1]}


def _objeto(propiedades: dict) -> dict:
    return {"type": "object", "properties": propiedades, "required": list(propiedades), "additionalProperties": False}


def _opciones(valores) -> dict:
    return {"type": "string", "enum": list(valores)}


def _lista(elemento: dict) -> dict:
    return {"type": "array", "items": elemento}


ESQUELETO = _objeto({
    "titulo": TEXTO,
    "contexto": TEXTO,
    "objetivosAprendizaje": _lista(TEXTO),
    "escenas": _lista(_objeto({
        "sala": TEXTO,
        "titulo": TEXTO,
        "persona": TEXTO,
        "intensidad": _opciones(miembro.value for miembro in Intensity),
        "advertencia": TEXTO,
        "final": BOOLEANO,
        "siguientes": _lista(TEXTO),
    })),
    "hitos": _lista(TEXTO),
    "finales": _lista(_objeto({
        "clave": TEXTO,
        "titulo": TEXTO,
        "mensaje": TEXTO,
        "tono": _opciones(TONOS_DE_FINAL),
        "cuando": TEXTO,
    })),
})

ESCENA = _objeto({
    "narracion": TEXTO,
    "pregunta": TEXTO,
    "lineas": _lista(_objeto({
        "personaje": TEXTO,
        "texto": TEXTO,
        "emocion": _opciones(EXPRESIONES),
    })),
    "opciones": _lista(_objeto({
        "clave": TEXTO,
        "texto": TEXTO,
        "clase": _opciones(miembro.value for miembro in ResponseClass),
        "retroalimentacion": TEXTO,
        "razonProhibicion": TEXTO,
        "destino": TEXTO,
        "efectoVinculo": PASO,
        "efectoActivacion": PASO,
        "hitos": _lista(TEXTO),
        "competencias": _lista(TEXTO),
        "requiere": TEXTO,
        "reaccionLinea": TEXTO,
        "reaccionEmocion": _opciones(("", *EXPRESIONES)),
        "reaccionGesto": _opciones(("", *GESTOS)),
    })),
    "pistas": _lista(TEXTO),
    "comentarios": _lista(_objeto({
        "personaje": TEXTO,
        "linea": TEXTO,
        "cuando": TEXTO,
        "emocion": _opciones(("", *EXPRESIONES)),
        "gesto": _opciones(("", *GESTOS)),
    })),
})

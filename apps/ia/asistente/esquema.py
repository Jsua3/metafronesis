"""El esquema JSON de una propuesta del asistente (lo que se le pide al proveedor) y el vocabulario cerrado.

``PROPUESTA`` es ``{message, changes[]}``; cada cambio es uno de diez, con ``additionalProperties: false`` y todos sus
campos obligatorios (lo opcional es ``null`` o ``""``). Sin recursión ni límites numéricos: eso lo revisa
``propuestas.validar`` en Python, que nunca confía en lo que devuelve el modelo.

Ids: un número es el id de una fila de ESTA versión del caso; una escena se nombra siempre con texto: su id escrito
como texto (``"12"``) o, si es nueva, el id temporal ``nueva-N`` que declara ``add-scene`` y que los cambios siguientes
pueden usar donde se pide una escena (``nodeId``, ``targetNodeId``, ``afterNodeId``).

Operación → endpoint de autoría con que el cliente la aplica (``/api/authoring/cases/{id}/…``, siempre sobre un
borrador y con la revisión vigente; la forma exacta de cada llamada es del cliente):

- ``add-scene``           → ``POST nodes`` (``nodeKey`` derivado del id, ``title``, ``narrative``, ``intensity``,
  ``warningMessage``) y ``POST maps`` con el ``nodeId`` creado; si trae ``afterNodeId``, la escena se coloca a su lado.
- ``add-line``            → ``POST maps/{mapId}/dialogues`` (si la escena aún no tiene diálogo) o ``PUT dialogues/{treeId}``
  agregando la línea al final (``speakerName`` = nombre del personaje, ``emotion`` = ``expression``).
- ``add-response``        → ``POST decisions`` (``sourceNodeId``=``nodeId``, ``targetNodeId``, ``text``, ``responseClass``,
  ``feedbackText``, ``prohibitionReason``).
- ``place-character``     → ``POST maps/{mapId}/objects`` (``objectType`` PERSON, ``characterId``, ``x``, ``y``).
- ``move``                → ``PUT objects/{objectId}`` con la nueva ``x``/``y`` y el resto del objeto como está.
- ``add-ending``          → ``PUT rules/endings`` con los finales actuales más este (``when`` ya viene en la gramática
  de ``casedef.conditions``).
- ``set-response-class``  → ``PUT decisions/{decisionId}`` (``responseClass``, ``prohibitionReason``).
- ``set-persona-effect``  → ``PUT decisions/{decisionId}`` mezclando ``effects.persona`` (``bond``/``activation``).
- ``mark-milestone``      → ``PUT decisions/{decisionId}`` agregando la clave a ``effects.milestones``.
- ``set-intensity``       → ``PUT nodes/{nodeId}`` (``intensity``, ``warningMessage``).

La condición ``when`` de ``add-ending`` viaja como texto: el JSON de una forma plana de un solo nivel (``kind``), o ``""``
si el final no tiene condición; ``propuestas.validar`` la lee y la traduce a la gramática de las condiciones
(``{all|any|not|milestone|count|persona}``).
"""
from apps.autoria.reglas import TONOS
from apps.simulation.casedef.vocabulary import Activation, Bond, Intensity, ResponseClass

#: Las seis expresiones del kit de personajes (vocabulario cerrado de las líneas y de las personas en sala).
EXPRESIONES = ("neutral", "alegre", "preocupada", "triste", "cautelosa", "en-crisis")
RESPONSE_CLASSES = tuple(member.value for member in ResponseClass)
INTENSITIES = tuple(member.value for member in Intensity)
BONDS = tuple(member.value for member in Bond)
ACTIVATIONS = tuple(member.value for member in Activation)
TONES = tuple(TONOS)
COMPARATORS = ("gte", "gt", "lte", "lt", "eq")
CONDITION_KINDS = ("milestone", "count", "persona", "all", "any", "not")
MAX_CHANGES = 12

_TEXT = {"type": "string"}
_INT = {"type": "integer"}


def _obj(properties: dict) -> dict:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def _enum(values) -> dict:
    return {"type": "string", "enum": list(values)}


def _nullable(inner: dict) -> dict:
    return {"anyOf": [inner, {"type": "null"}]}


#: Una escena: el id de una existente escrito como texto (``"12"``) o un id temporal ``nueva-N``. Es texto y no
#: «número o texto» porque el proveedor admite a lo sumo 16 parámetros unión por esquema; ``propuestas`` devuelve el
#: id de una escena existente como número, así que el cliente recibe lo mismo que antes.
_NODE_REF = _TEXT

#: La condición de un final viaja como TEXTO con el JSON de la forma plana (``{"kind": …}``; ``""`` es «sin condición»):
#: como objetos anidados, aun de un solo nivel, el proveedor responde 400 «The compiled grammar is too large».
#: ``propuestas.validar`` la lee y la revisa campo por campo con el vocabulario de abajo.
_WHEN = _TEXT

#: Los campos de cada operación (sin ``op``).
OPERATIONS: dict[str, dict] = {
    "add-scene": {"id": _TEXT, "title": _TEXT, "narrative": _TEXT, "intensity": _enum(INTENSITIES),
                  "warningMessage": _TEXT, "afterNodeId": _nullable(_NODE_REF)},
    "add-line": {"nodeId": _NODE_REF, "characterId": _INT, "text": _TEXT, "expression": _enum(EXPRESIONES)},
    "add-response": {"nodeId": _NODE_REF, "text": _TEXT, "responseClass": _enum(RESPONSE_CLASSES),
                     "feedbackText": _TEXT, "prohibitionReason": _TEXT, "targetNodeId": _NODE_REF},
    "place-character": {"mapId": _INT, "characterId": _INT, "x": _INT, "y": _INT, "expression": _enum(EXPRESIONES)},
    "move": {"objectId": _INT, "x": _INT, "y": _INT},
    "add-ending": {"key": _TEXT, "title": _TEXT, "message": _TEXT, "tone": _enum(TONES), "when": _WHEN},
    "set-response-class": {"decisionId": _INT, "responseClass": _enum(RESPONSE_CLASSES), "prohibitionReason": _TEXT},
    "set-persona-effect": {"decisionId": _INT, "bond": _nullable(_INT), "activation": _nullable(_INT)},
    "mark-milestone": {"decisionId": _INT, "milestoneKey": _TEXT},
    "set-intensity": {"nodeId": _NODE_REF, "intensity": _enum(INTENSITIES), "warningMessage": _TEXT},
}

#: Los nombres de campo que acepta cada operación, ``op`` incluido.
FIELDS: dict[str, frozenset] = {op: frozenset({"op", *fields}) for op, fields in OPERATIONS.items()}

PROPUESTA = _obj({
    "message": _TEXT,
    "changes": {
        "type": "array",
        "items": {"anyOf": [_obj({"op": _enum([op]), **fields}) for op, fields in OPERATIONS.items()]},
    },
})

#: Modos en que el editor muestra la acción elegida por la guía.
MODOS_DE_GUIA = ("resaltar", "foco", "recorrido")

#: La respuesta de la guía: ``accionId`` es el id de una acción del catálogo que manda el cliente, o ``null``.
GUIA = _obj({
    "accionId": {"type": ["string", "null"]},
    "modo": _enum(MODOS_DE_GUIA),
    "mensaje": _TEXT,
})

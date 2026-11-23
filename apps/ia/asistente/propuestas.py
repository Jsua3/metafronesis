"""Propuestas del asistente de autoría: se piden al proveedor, se validan contra el caso y se devuelven marcadas.

``validar`` es atómica: revisa la lista entera (forma, vocabulario cerrado, referencias a ESTA versión del caso,
ids temporales declarados antes de usarse y las reglas de contenido de ``prompts``) y ante cualquier falla lanza
``PropuestaInvalida`` sin devolver nada. Nunca se confía en la salida del modelo, nunca se reescribe y el motivo es un
texto fijo en español: no cita lo que dijo el modelo.
"""
import json
import re
from dataclasses import dataclass, field, replace

from apps.autoria.reglas import MAX_FINALES
from apps.ia.privacidad import sin_datos_personales
from apps.simulation.casedef import conditions
from apps.simulation.models import DecisionOption, SimulationNode
from apps.simulation.models.world import CaseCharacter, MapObject, SceneMap
from apps.simulation.services import case_rules

from . import contexto, esquema as schema, llamada, prompts

MAX_REQUEST_CHARS = 2000
MAX_SCENE_TEXT = 4000
MAX_TEXT = 2000
MAX_TITLE = 255
MAX_NOTE = 1000
MAX_CONDITION_ITEMS = 6
#: El largo máximo del texto de una condición de final.
MAX_CONDITION_TEXT = 2000
DEFAULT_MAP_SIZE = 4000
_TEMP_ID = re.compile(r"nueva-[0-9]{1,3}")
#: El id de una escena existente escrito como texto (el esquema pide texto para no pasar del tope de uniones).
_NODE_ID_TEXT = re.compile(r"[0-9]{1,18}")
#: Los campos que nombran una escena.
_NODE_FIELDS = ("nodeId", "targetNodeId", "afterNodeId")


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (todos los motivos fijos de este módulo).
#: Todos los motivos de rechazo (sin el prefijo «Cambio N: » y con «» donde va el nombre de un campo nuestro): son
#: textos fijos y nunca citan lo que dijo el modelo. ``es_motivo_fijo`` lo comprueba.
MOTIVOS_FIJOS = frozenset({
    "el campo «» no tiene la forma esperada.",
    "el campo «» no es un número válido.",
    "el campo «» trae un valor fuera de la lista permitida.",
    "la sala no está en el caso.",
    "el personaje no está en el caso.",
    "el elemento no está en el caso.",
    "la respuesta no está en el caso.",
    "la escena no está en el caso ni se declaró antes.",
    "una respuesta contraindicada necesita su razón.",
    "solo una respuesta contraindicada lleva razón de prohibición.",
    "una respuesta contraindicada la deja una persona: la IA no puede cambiarle la clase.",
    "el id de la escena nueva no es válido o está repetido.",
    "una escena de intensidad alta necesita su aviso.",
    "la clave del final no es válida o ya existe.",
    "el caso ya tiene el máximo de finales.",
    "el cambio en la persona debe ser -1, 0 o 1 en vínculo o activación.",
    "el hito no lo declara el caso.",
    "la condición del final no es válida.",
    "la condición del final usa algo fuera del vocabulario.",
    "la condición del final nombra un hito que el caso no declara.",
    "la condición del final cuenta con un número fuera de rango.",
    "la condición de la persona no dice nada.",
    "la condición del final agrupa una cantidad de partes no válida.",
    "no es una operación conocida o le faltan campos.",
    prompts.GRAPHIC_REASON,
    prompts.REVICTIMIZING_REASON,
    "La respuesta de la IA no tiene la forma esperada.",
    f"La IA propuso más de {schema.MAX_CHANGES} cambios.",
})
_FIELD_NAME = re.compile(r"«[^»]*»")
_CHANGE_PREFIX = re.compile(r"Cambio [0-9]+: ")


def es_motivo_fijo(motivo: str) -> bool:
    """¿``motivo`` es uno de los textos fijos de ``MOTIVOS_FIJOS`` (con o sin el prefijo del cambio)?"""
    return _FIELD_NAME.sub("«»", _CHANGE_PREFIX.sub("", motivo, count=1)) in MOTIVOS_FIJOS


class PropuestaInvalida(Exception):
    """La propuesta del modelo no se puede usar; ``motivo`` es un texto corto y fijo en español."""

    def __init__(self, motivo: str):
        super().__init__(motivo)
        self.motivo = motivo


@dataclass
class Propuesta:
    mensaje: str
    cambios: list[dict] = field(default_factory=list)
    modelo: str = ""


@dataclass
class _Case:
    """Lo que la propuesta puede nombrar: filas de ESTA versión."""

    nodes: dict          # id → aviso de la escena
    maps: dict           # id → (ancho, alto)
    objects: dict        # id → id del mapa
    characters: set
    decisions: dict      # id → (texto, razón de prohibición, clase efectiva)
    milestones: set
    endings: set

    @classmethod
    def load(cls, version):
        rules = case_rules.rules_of(version)
        return cls(
            nodes=dict(SimulationNode.objects.filter(case_version_id=version.id).values_list("id", "warning_message")),
            maps={m.id: (m.width, m.height) for m in SceneMap.objects.filter(case_version_id=version.id)},
            objects=dict(MapObject.objects.filter(scene_map__case_version_id=version.id).values_list("id", "scene_map_id")),
            characters=set(CaseCharacter.objects.filter(case_version_id=version.id).values_list("id", flat=True)),
            decisions={
                d.id: (d.text, d.prohibition_reason or "", d.response_class)
                for d in DecisionOption.objects.filter(case_version_id=version.id)
            },
            milestones={m.key for m in rules.milestones},
            endings={e["key"] for e in rules.endings},
        )


def _scene_ids_as_numbers(change):
    """Una copia del cambio con el id de cada escena existente («12») como número; ``nueva-N`` y lo demás, tal cual."""
    out = dict(change)
    for name in _NODE_FIELDS:
        value = out.get(name)
        if isinstance(value, str) and _NODE_ID_TEXT.fullmatch(value):
            out[name] = int(value)
    return out


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


class _Validator:
    def __init__(self, case: _Case):
        self.case, self.n = case, 0
        self.temps: set = set()
        self.new_endings: set = set()

    # ─── ayudas ──────────────────────────────────────────────────────────────────────────
    def fail(self, motivo):
        raise PropuestaInvalida(f"Cambio {self.n}: {motivo}" if self.n else motivo)

    def text(self, change, name, limit, *, required=True, revictimizing=False):
        """Un texto del cambio: del tipo y largo debidos y sin pasar de lo que dejan las reglas de contenido."""
        value = change[name]
        if not isinstance(value, str) or (required and not value.strip()) or len(value) > limit:
            self.fail(f"el campo «{name}» no tiene la forma esperada.")
        reason = prompts.check_text(value, allow_revictimizing=not revictimizing)
        if reason:
            self.fail(reason)
        return value

    def integer(self, change, name, low=None, high=None):
        value = change[name]
        if not _is_int(value) or (low is not None and value < low) or (high is not None and value > high):
            self.fail(f"el campo «{name}» no es un número válido.")
        return value

    def choice(self, change, name, values):
        value = change[name]
        if not isinstance(value, str) or value not in values:
            self.fail(f"el campo «{name}» trae un valor fuera de la lista permitida.")
        return value

    def known(self, collection, change, name, what):
        value = change[name]
        if not _is_int(value) or value not in collection:
            self.fail(f"{what} no está en el caso.")
        return value

    def node(self, change, name):
        value = change[name]
        if _is_int(value) and value in self.case.nodes:
            return value
        if isinstance(value, str) and value in self.temps:
            return value
        self.fail("la escena no está en el caso ni se declaró antes.")

    def point(self, change, size):
        width, height = size
        return (
            self.integer(change, "x", 0, width if width > 0 else DEFAULT_MAP_SIZE),
            self.integer(change, "y", 0, height if height > 0 else DEFAULT_MAP_SIZE),
        )

    def reason_for(self, response_class, reason):
        """La razón de prohibición: obligatoria si es CONTRAINDICATED y solo entonces."""
        has_reason = bool(reason.strip())
        if response_class == "CONTRAINDICATED" and not has_reason:
            self.fail("una respuesta contraindicada necesita su razón.")
        if response_class != "CONTRAINDICATED" and has_reason:
            self.fail("solo una respuesta contraindicada lleva razón de prohibición.")
        return has_reason

    # ─── una operación por método ────────────────────────────────────────────────────────
    def add_scene(self, c):
        temp = c["id"]
        if not isinstance(temp, str) or not _TEMP_ID.fullmatch(temp) or temp in self.temps:
            self.fail("el id de la escena nueva no es válido o está repetido.")
        self.text(c, "title", MAX_TITLE)
        self.text(c, "narrative", MAX_SCENE_TEXT)
        intensity = self.choice(c, "intensity", schema.INTENSITIES)
        warning = self.text(c, "warningMessage", MAX_NOTE, required=False)
        if intensity == "HIGH" and not warning.strip():
            self.fail("una escena de intensidad alta necesita su aviso.")
        if c["afterNodeId"] is not None:
            self.node(c, "afterNodeId")
        self.temps.add(temp)

    def add_line(self, c):
        self.node(c, "nodeId")
        self.known(self.case.characters, c, "characterId", "el personaje")
        self.text(c, "text", MAX_TEXT)
        self.choice(c, "expression", schema.EXPRESIONES)

    def add_response(self, c):
        self.node(c, "nodeId")
        self.node(c, "targetNodeId")
        response_class = self.choice(c, "responseClass", schema.RESPONSE_CLASSES)
        reason = self.text(c, "prohibitionReason", MAX_NOTE, required=False)
        has_reason = self.reason_for(response_class, reason)
        self.text(c, "feedbackText", MAX_TEXT)
        # Lo revictimizante solo se admite en una contraindicada con su razón.
        self.text(c, "text", MAX_TEXT, revictimizing=not (response_class == "CONTRAINDICATED" and has_reason))

    def place_character(self, c):
        map_id = self.known(self.case.maps, c, "mapId", "la sala")
        self.known(self.case.characters, c, "characterId", "el personaje")
        self.point(c, self.case.maps[map_id])
        self.choice(c, "expression", schema.EXPRESIONES)

    def move(self, c):
        object_id = self.known(self.case.objects, c, "objectId", "el elemento")
        self.point(c, self.case.maps[self.case.objects[object_id]])

    def add_ending(self, c):
        key = c["key"]
        if not isinstance(key, str) or not case_rules.NAME.fullmatch(key) or key in self.case.endings | self.new_endings:
            self.fail("la clave del final no es válida o ya existe.")
        if len(self.case.endings) + len(self.new_endings) >= MAX_FINALES:
            self.fail("el caso ya tiene el máximo de finales.")
        self.text(c, "title", MAX_TITLE)
        self.text(c, "message", MAX_TEXT)
        self.choice(c, "tone", schema.TONES)
        self.new_endings.add(key)
        when = c["when"]
        if when is None or (isinstance(when, str) and not when.strip()):
            return {**c, "when": None}
        if isinstance(when, str):
            if len(when) > MAX_CONDITION_TEXT:
                self.fail("la condición del final no es válida.")
            try:
                when = json.loads(when)
            except ValueError:
                self.fail("la condición del final no es válida.")
        return {**c, "when": self.condition(when)}

    def set_response_class(self, c):
        decision = self.known(self.case.decisions, c, "decisionId", "la respuesta")
        response_class = self.choice(c, "responseClass", schema.RESPONSE_CLASSES)
        reason = self.text(c, "prohibitionReason", MAX_NOTE, required=False)
        existing_text, existing_reason, existing_class = self.case.decisions[decision]
        # Una respuesta contraindicada (o con razón de prohibición) la fijó una persona: la IA no la rebaja, ni siquiera
        # cuando su texto no cae en ningún marcador (las listas de marcadores son un primer filtro, no el control).
        if response_class != "CONTRAINDICATED" and (
            existing_class == "CONTRAINDICATED" or existing_reason.strip()
        ):
            self.fail("una respuesta contraindicada la deja una persona: la IA no puede cambiarle la clase.")
        if response_class == "CONTRAINDICATED" and not (reason.strip() or existing_reason.strip()):
            self.fail("una respuesta contraindicada necesita su razón.")
        if response_class != "CONTRAINDICATED" and reason.strip():
            self.fail("solo una respuesta contraindicada lleva razón de prohibición.")
        if response_class != "CONTRAINDICATED" and prompts.is_revictimizing(existing_text):
            self.fail(prompts.REVICTIMIZING_REASON)

    def set_persona_effect(self, c):
        steps = [c[name] for name in ("bond", "activation")]
        self.known(self.case.decisions, c, "decisionId", "la respuesta")
        if all(s is None for s in steps) or any(s is not None and not (_is_int(s) and -1 <= s <= 1) for s in steps):
            self.fail("el cambio en la persona debe ser -1, 0 o 1 en vínculo o activación.")

    def mark_milestone(self, c):
        self.known(self.case.decisions, c, "decisionId", "la respuesta")
        if not isinstance(c["milestoneKey"], str) or c["milestoneKey"] not in self.case.milestones:
            self.fail("el hito no lo declara el caso.")

    def set_intensity(self, c):
        node = self.node(c, "nodeId")
        intensity = self.choice(c, "intensity", schema.INTENSITIES)
        warning = self.text(c, "warningMessage", MAX_NOTE, required=False)
        stored = self.case.nodes.get(node) if _is_int(node) else ""
        if intensity == "HIGH" and not (warning.strip() or (stored or "").strip()):
            self.fail("una escena de intensidad alta necesita su aviso.")

    # ─── condiciones de un final ─────────────────────────────────────────────────────────
    def condition(self, raw):
        result = self._condition(raw, leaf_only=False)
        if not conditions.is_valid(result):
            self.fail("la condición del final no es válida.")
        return result

    def _condition(self, raw, *, leaf_only):
        if not isinstance(raw, dict):
            self.fail("la condición del final no es válida.")
        kind = raw.get("kind")
        expected = isinstance(kind, str) and {
            "milestone": {"kind", "milestone"}, "count": {"kind", "responseClass", "comparator", "value"},
            "persona": {"kind", "bond", "activation"}, "all": {"kind", "items"}, "any": {"kind", "items"}, "not": {"kind", "item"},
        }.get(kind)
        if not expected or set(raw) != expected or (leaf_only and kind in ("all", "any", "not")):
            self.fail("la condición del final usa algo fuera del vocabulario.")
        if kind == "milestone":
            if not isinstance(raw["milestone"], str) or raw["milestone"] not in self.case.milestones:
                self.fail("la condición del final nombra un hito que el caso no declara.")
            return {"milestone": raw["milestone"]}
        if kind == "count":
            comparator = raw["comparator"]
            if raw["responseClass"] not in schema.RESPONSE_CLASSES or comparator not in schema.COMPARATORS:
                self.fail("la condición del final usa algo fuera del vocabulario.")
            if not _is_int(raw["value"]) or not 0 <= raw["value"] <= 1000:
                self.fail("la condición del final cuenta con un número fuera de rango.")
            return {"count": raw["responseClass"].lower(), comparator: raw["value"]}
        if kind == "persona":
            persona = {}
            for name, values in (("bond", schema.BONDS), ("activation", schema.ACTIVATIONS)):
                if raw[name] is not None:
                    if raw[name] not in values:
                        self.fail("la condición del final usa algo fuera del vocabulario.")
                    persona[name] = raw[name]
            if not persona:
                self.fail("la condición de la persona no dice nada.")
            return {"persona": persona}
        if kind == "not":
            return {"not": self._condition(raw["item"], leaf_only=True)}
        items = raw["items"]
        if not isinstance(items, list) or not 1 <= len(items) <= MAX_CONDITION_ITEMS:
            self.fail("la condición del final agrupa una cantidad de partes no válida.")
        return {kind: [self._condition(item, leaf_only=True) for item in items]}

    # ─── la lista ────────────────────────────────────────────────────────────────────────
    def run(self, changes):
        out = []
        for position, change in enumerate(changes, start=1):
            self.n = position
            if not isinstance(change, dict) or not isinstance(change.get("op"), str) or change["op"] not in schema.FIELDS or set(change) != schema.FIELDS[change["op"]]:
                self.fail("no es una operación conocida o le faltan campos.")
            method = getattr(self, change["op"].replace("-", "_"))
            change = _scene_ids_as_numbers(change)
            checked = method(change)
            out.append({**(checked if isinstance(checked, dict) else change), "aiSuggested": True})
        return out


def validar(case_version, raw) -> Propuesta:
    """La propuesta validada y marcada, o ``PropuestaInvalida`` si cualquier parte falla (nada se devuelve a medias)."""
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
    rota = PropuestaInvalida("La respuesta de la IA no tiene la forma esperada.")
    if not isinstance(raw, dict) or set(raw) != {"message", "changes"}:
        raise rota
    message, changes = raw["message"], raw["changes"]
    if not isinstance(message, str) or not message.strip() or len(message) > MAX_TEXT or not isinstance(changes, list):
        raise rota
    reason = prompts.check_text(message, allow_revictimizing=True)
    if reason:
        raise PropuestaInvalida(reason)
    if len(changes) > schema.MAX_CHANGES:
        raise PropuestaInvalida(f"La IA propuso más de {schema.MAX_CHANGES} cambios.")
    return Propuesta(mensaje=message, cambios=_Validator(_Case.load(case_version)).run(changes))


def proponer(*, config, version, peticion, pantalla, seleccion) -> dict:
    """Pide una propuesta al proveedor, la valida y la devuelve: ``{mensaje, cambios, modo, model, changes}``.

    Nada se escribe en el caso: el cliente aplica los cambios. Al proveedor solo sale el caso (sin cuentas ni intentos)
    y la petición, ambos sin correos ni números largos.
    """
    case_context = contexto.construir(version, pantalla, seleccion)
    message = sin_datos_personales(prompts.user_message(peticion[:MAX_REQUEST_CHARS], case_context))
    raw = llamada.completar(
        config, prompts.instrucciones_propuesta(), [{"role": "user", "content": message}],
        modelo=config.model_capable, max_tokens=config.max_tokens_propose,
    )
    propuesta = replace(validar(version, raw), modelo=config.model_capable)
    return {
        "mensaje": propuesta.mensaje,
        "cambios": propuesta.cambios,
        "modo": "connected",
        "model": propuesta.modelo,
        "changes": len(propuesta.cambios),
    }

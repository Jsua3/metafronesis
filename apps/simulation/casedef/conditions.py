"""Condiciones de los finales del caso como datos (E3-8, R11, RNF-008).

Una condición es un árbol JSON; ``evaluate`` lo recorre **sin** ``eval`` ni ``exec``: una cadena
con código es solo un nombre que no existe (y por tanto ``False``). El vocabulario:

    {"all": [c, …]}                     todas se cumplen (lista vacía: verdadera)
    {"any": [c, …]}                     alguna se cumple (lista vacía: falsa)
    {"not": c}                          la negación
    {"milestone": "derivo_a_comisaria"} el hito está cumplido
    {"count": "contraindicated", "gte": 1}  cuántas respuestas de esa clase (las clases son ``recommended``,
                                        ``acceptable``, ``risky`` y ``contraindicated``)
    {"persona": {"bond": "OPEN"}}       el estado de la persona consultante: ``bond`` ∈
                                        WITHDRAWN|GUARDED|OPEN y ``activation`` ∈ CALM|TENSE|CRISIS; si trae las
                                        dos, se cumplen ambas
    {"talked": "enfermera"}             hechos de exploración (bloque A, DSL 2.1): ya habló con ese personaje
    {"inspected": "historia"}           ya inspeccionó ese objeto
    {"has": "PAP"}                      tiene ese ítem (o herramienta) en el inventario
    {"used": "PAP"}                     ya usó esa herramienta; «PAP@familia» cuenta como uso de «PAP»

Los hechos leen ``context["explored"]``, ``{"talked": set, "inspected": set, "has": set, "used": set}`` de cadenas. Solo son
condiciones válidas al guardar con ``is_valid(..., facts=True)`` (requisitos de opciones y reacciones); los finales se
siguen validando sin hechos.

Comparadores (``gte``, ``gt``, ``lte``, ``lt``, ``eq``): si hay varios, se cumplen todos. El contexto es
``{"counts": {…}, "milestones": {…}, "persona": {"bond": …, "activation": …}}``. Cualquier cosa que no sea una
condición conocida —tipo equivocado, clave desconocida (también el vocabulario del modelo antiguo: ``flag``, ``metric``
y el conteo por severidad), anidada más allá de ``MAX_DEPTH``— evalúa a ``False``: un dato malformado nunca rompe una
partida, solo hace que ese final no aplique. El documento 1.0 se valida con ``legacy.is_valid_condition``, que sí
conoce el vocabulario antiguo.
"""
from apps.simulation.casedef.vocabulary import Activation, Bond

COMPARATORS = ("gte", "gt", "lte", "lt", "eq")
#: Lo que se puede contar: las clases de respuesta (en minúscula).
COUNT_NAMES = ("recommended", "acceptable", "risky", "contraindicated")
#: Dimensiones de la persona consultante y los valores que cada una admite.
PERSONA_DIMENSIONS = {
    "bond": tuple(member.value for member in Bond),
    "activation": tuple(member.value for member in Activation),
}
#: Hasta dónde se anida una condición; más allá es un dato roto, no un reglamento.
MAX_DEPTH = 12

#: Hechos de exploración que una condición puede preguntar.
FACT_KINDS = ("talked", "inspected", "has", "used")

_GROUPS = ("all", "any")


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _compare(value, spec):
    """``True`` si ``value`` cumple **todos** los comparadores de ``spec`` (y hay al menos uno)."""
    present = [(name, spec[name]) for name in COMPARATORS if name in spec]
    if not present or not _is_number(value):
        return False
    for name, bound in present:
        if not _is_number(bound):
            return False
        if name == "gte" and not value >= bound:
            return False
        if name == "gt" and not value > bound:
            return False
        if name == "lte" and not value <= bound:
            return False
        if name == "lt" and not value < bound:
            return False
        if name == "eq" and not value == bound:
            return False
    return True


def _only(condition, *allowed):
    return set(condition) <= set(allowed)


def _persona_spec_valid(spec):
    """¿``spec`` es un ``{"bond"|"activation": valor}`` no vacío, con valores del vocabulario?"""
    return (
        isinstance(spec, dict)
        and bool(spec)
        and all(
            dimension in PERSONA_DIMENSIONS
            and isinstance(value, str)
            and value in PERSONA_DIMENSIONS[dimension]
            for dimension, value in spec.items()
        )
    )


def _fact_holds(kind, key, context):
    """¿``key`` está en ``context["explored"][kind]``? ``used`` también acepta «clave@…»."""
    explored = context.get("explored")
    if not isinstance(explored, dict):
        return False
    entries = explored.get(kind)
    if not isinstance(entries, (set, frozenset, list, tuple)):
        return False
    if key in entries:
        return True
    if kind == "used":
        prefix = key + "@"
        return any(isinstance(entry, str) and entry.startswith(prefix) for entry in entries)
    return False


def _fact_of(condition):
    """``(tipo, clave)`` si ``condition`` es un hecho bien formado; ``None`` si no."""
    for kind in FACT_KINDS:
        if kind in condition:
            key = condition[kind]
            if _only(condition, kind) and isinstance(key, str) and key:
                return (kind, key)
            return None
    return None


def evaluate(condition, context, _depth=0):
    """El valor de verdad de ``condition`` con ``context``; ``False`` ante todo lo desconocido."""
    if _depth > MAX_DEPTH or not isinstance(condition, dict):
        return False
    context = context if isinstance(context, dict) else {}
    next_depth = _depth + 1

    for group in _GROUPS:
        if group in condition:
            items = condition[group]
            if not _only(condition, group) or not isinstance(items, list):
                return False
            results = (evaluate(item, context, next_depth) for item in items)
            return all(results) if group == "all" else any(results)
    if "not" in condition:
        if not _only(condition, "not"):
            return False
        inner = condition["not"]
        # ``not`` de algo desconocido no vuelve verdadero lo malformado: sigue siendo falso.
        return is_valid(inner, facts=True) and not evaluate(inner, context, next_depth)
    if "count" in condition:
        name = condition["count"]
        counts = context.get("counts")
        if not _only(condition, "count", *COMPARATORS) or name not in COUNT_NAMES:
            return False
        if not isinstance(counts, dict):
            return False
        return _compare(counts.get(name, 0), condition)
    if "milestone" in condition:
        key = condition["milestone"]
        milestones = context.get("milestones")
        if not _only(condition, "milestone") or not isinstance(key, str) or not key:
            return False
        if not isinstance(milestones, (set, frozenset, list, tuple)):
            return False
        return key in milestones
    if "persona" in condition:
        spec = condition["persona"]
        persona = context.get("persona")
        if not _only(condition, "persona") or not _persona_spec_valid(spec) or not isinstance(persona, dict):
            return False
        return all(persona.get(dimension) == value for dimension, value in spec.items())
    if any(kind in condition for kind in FACT_KINDS):
        fact = _fact_of(condition)
        return fact is not None and _fact_holds(fact[0], fact[1], context)
    return False


def is_valid(condition, _depth=0, *, facts=False):
    """¿Es una condición del vocabulario, completa y bien formada? (la regla de guardado, R11).

    Los hechos de exploración (``talked``, ``inspected``, ``has``, ``used``) solo valen con ``facts=True``.
    """
    if _depth > MAX_DEPTH or not isinstance(condition, dict):
        return False
    next_depth = _depth + 1
    for group in _GROUPS:
        if group in condition:
            items = condition[group]
            return (
                _only(condition, group)
                and isinstance(items, list)
                and all(is_valid(item, next_depth, facts=facts) for item in items)
            )
    if "not" in condition:
        return _only(condition, "not") and is_valid(condition["not"], next_depth, facts=facts)
    if "count" in condition:
        if not _only(condition, "count", *COMPARATORS):
            return False
        comparators = [condition[c] for c in COMPARATORS if c in condition]
        return condition["count"] in COUNT_NAMES and bool(comparators) and all(_is_number(bound) for bound in comparators)
    if "milestone" in condition:
        return _only(condition, "milestone") and isinstance(condition["milestone"], str) and bool(condition["milestone"])
    if "persona" in condition:
        return _only(condition, "persona") and _persona_spec_valid(condition["persona"])
    if facts and any(kind in condition for kind in FACT_KINDS):
        return _fact_of(condition) is not None
    return False


def facts_in(condition):
    """Cada ``(tipo, clave)`` de hecho de ``condition`` una vez, en orden de aparición (también dentro de ``not``)."""
    found = []
    _collect_facts(condition, found, 0, into_not=True)
    return found


def unmet_facts(condition, context):
    """Los hechos de ``condition`` que evalúan a falso con ``context``; no entra a los ``not``."""
    context = context if isinstance(context, dict) else {}
    return [fact for fact in _collect_facts_list(condition, False) if not _fact_holds(fact[0], fact[1], context)]


def _collect_facts_list(condition, into_not):
    found = []
    _collect_facts(condition, found, 0, into_not=into_not)
    return found


def _collect_facts(condition, found, depth, *, into_not):
    if depth > MAX_DEPTH or not isinstance(condition, dict):
        return
    for group in _GROUPS:
        if group in condition:
            items = condition[group]
            if isinstance(items, list):
                for item in items:
                    _collect_facts(item, found, depth + 1, into_not=into_not)
            return
    if "not" in condition:
        if into_not:
            _collect_facts(condition["not"], found, depth + 1, into_not=into_not)
        return
    fact = _fact_of(condition)
    if fact is not None and fact not in found:
        found.append(fact)

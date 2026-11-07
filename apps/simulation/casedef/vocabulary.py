"""El vocabulario del modelo de respuesta: clases, persona consultante, intensidad y riesgo.

Python puro: sin Django ni modelos. Lo importan ``case_rules``, las migraciones ``0030`` (datos) y ``0031``
(contracción), el importador del DSL 1.0 y el motor de respuesta, así que no debe depender de nada del proyecto.

Los valores de los enums son las cadenas en mayúscula que viajan en el JSON y en la base de
datos; las palabras en español viven en ``LABELS``.
"""
from enum import Enum


class ResponseClass(str, Enum):
    """La clase de una respuesta; reemplaza a la severidad y a los deltas numéricos."""

    RECOMMENDED = "RECOMMENDED"
    ACCEPTABLE = "ACCEPTABLE"
    RISKY = "RISKY"
    CONTRAINDICATED = "CONTRAINDICATED"


class Bond(str, Enum):
    """El vínculo de la persona consultante con quien la atiende, de menor a mayor."""

    WITHDRAWN = "WITHDRAWN"
    GUARDED = "GUARDED"
    OPEN = "OPEN"


class Activation(str, Enum):
    """La activación emocional de la persona consultante, de menor a mayor."""

    CALM = "CALM"
    TENSE = "TENSE"
    CRISIS = "CRISIS"


class Intensity(str, Enum):
    """La intensidad de una escena; ``HIGH`` exige ``warning_message``."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RiskLevel(str, Enum):
    """El nivel de riesgo del caso: la escala DA del protocolo de Medicina Legal."""

    VARIABLE = "VARIABLE"
    MODERATE = "MODERATE"
    SEVERE = "SEVERE"
    EXTREME = "EXTREME"


# Orden ordinal de cada dimensión de la persona (de menor a mayor).
_BOND_ORDER = (Bond.WITHDRAWN, Bond.GUARDED, Bond.OPEN)
_ACTIVATION_ORDER = (Activation.CALM, Activation.TENSE, Activation.CRISIS)

# El estado inicial por defecto de la persona consultante.
INITIAL_PERSONA = (Bond.GUARDED, Activation.TENSE)

# Cambio por defecto (vínculo, activación) según la clase de la respuesta.
DEFAULT_PERSONA_STEP: dict[ResponseClass, tuple[int, int]] = {
    ResponseClass.RECOMMENDED: (+1, -1),
    ResponseClass.ACCEPTABLE: (0, 0),
    ResponseClass.RISKY: (-1, 0),
    ResponseClass.CONTRAINDICATED: (-1, +1),
}

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23)
LABELS: dict[Enum, str] = {
    ResponseClass.RECOMMENDED: "Recomendada",
    ResponseClass.ACCEPTABLE: "Aceptable",
    ResponseClass.RISKY: "Con riesgo",
    ResponseClass.CONTRAINDICATED: "Contraindicada",
    Bond.WITHDRAWN: "retraída",
    Bond.GUARDED: "cautelosa",
    Bond.OPEN: "abierta",
    Activation.CALM: "serena",
    Activation.TENSE: "tensa",
    Activation.CRISIS: "en crisis",
    Intensity.LOW: "baja",
    Intensity.MEDIUM: "media",
    Intensity.HIGH: "alta",
    RiskLevel.VARIABLE: "variable",
    RiskLevel.MODERATE: "moderado",
    RiskLevel.SEVERE: "grave",
    RiskLevel.EXTREME: "extremo",
}


def _step(order: tuple, current, delta: int):
    """Mueve ``current`` ``delta`` posiciones dentro de ``order`` sin salirse de los extremos."""
    index = order.index(current) + delta
    return order[max(0, min(len(order) - 1, index))]


def step_persona(bond: Bond, activation: Activation, d_bond: int, d_act: int) -> tuple[Bond, Activation]:
    """El estado de la persona tras un paso; cada dimensión se acota en sus extremos."""
    return _step(_BOND_ORDER, bond, d_bond), _step(_ACTIVATION_ORDER, activation, d_act)


# Tabla de conversión de los datos antiguos (severidad y clasificación) a la clase de respuesta. La usa ``legacy_class``,
# y ``legacy_class`` la importan las migraciones ``0030`` y ``0031`` (no la copian): cambiarla cambia lo que esas
# migraciones hacen en una base NUEVA; las bases que ya las corrieron conservan lo que se calculó entonces.
_CLASS_BY_SEVERITY = {
    "recommended": ResponseClass.RECOMMENDED,
    "acceptable": ResponseClass.ACCEPTABLE,
    "risky": ResponseClass.RISKY,
}
_CLASS_BY_CLASSIFICATION = {
    "ADEQUATE": ResponseClass.RECOMMENDED,
    "RISKY": ResponseClass.RISKY,
    "INADEQUATE": ResponseClass.CONTRAINDICATED,
}


#: La clasificación del DSL del taller (``ADEQUATE`` | ``RISKY`` | ``INADEQUATE``) que le corresponde a cada clase: la base
#: del documento la conserva, pero se DERIVA de la clase (el importador de un documento 2.0 la ignora).
CLASSIFICATION_OF_CLASS = {
    ResponseClass.RECOMMENDED: "ADEQUATE",
    ResponseClass.ACCEPTABLE: "ADEQUATE",
    ResponseClass.RISKY: "RISKY",
    ResponseClass.CONTRAINDICATED: "INADEQUATE",
}


def legacy_class(classification: str | None, severity: str | None, prohibited_conduct: bool) -> ResponseClass:
    """La clase de una respuesta antigua: conducta prohibida o gravedad crítica es contraindicada;
    si no, manda la gravedad; sin ella, la clasificación; y si nada coincide, aceptable."""
    if prohibited_conduct or severity == "critical":
        return ResponseClass.CONTRAINDICATED
    if severity in _CLASS_BY_SEVERITY:
        return _CLASS_BY_SEVERITY[severity]
    return _CLASS_BY_CLASSIFICATION.get(classification, ResponseClass.ACCEPTABLE)

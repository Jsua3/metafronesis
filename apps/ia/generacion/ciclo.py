"""Ciclo de vida de una generación de casos por etapas. Python puro: no toca el ORM, recibe datos.

::

    created --esqueleto--> skeleton_ready --(cada escena)--> scenes_ready --ensamblar--> imported | failed | needs_repair
    needs_repair --reparar escena (las marcadas)--> scenes_ready
    cualquier estado no terminal --cancelar--> cancelled
"""
from datetime import datetime, timedelta

CREATED = "created"
SKELETON_READY = "skeleton_ready"
SCENES_READY = "scenes_ready"
NEEDS_REPAIR = "needs_repair"
IMPORTED = "imported"
FAILED = "failed"
CANCELLED = "cancelled"

EN_CURSO = (CREATED, SKELETON_READY, SCENES_READY, NEEDS_REPAIR)

#: Rondas de reparación que admite el ensamblado antes de fallar.
RONDAS_DE_REPARACION = 2
#: Una etapa «en curso» desde hace tanto se considera abandonada y se puede pedir de nuevo.
SEGUNDOS_ETAPA_VENCIDA = 150
#: Una generación sin cambios desde hace tanto se cancela sola.
HORAS_ABANDONO = 24
#: Escenas que una generación puede tener a la vez en curso.
ESCENAS_A_LA_VEZ = 2

ESQUELETO = "esqueleto"
ESCENA = "escena"
REPARAR_ESCENA = "reparar_escena"
ENSAMBLAR = "ensamblar"
CANCELAR = "cancelar"

_PERMITIDAS = {
    ESQUELETO: (CREATED,),
    ESCENA: (SKELETON_READY,),
    REPARAR_ESCENA: (NEEDS_REPAIR,),
    ENSAMBLAR: (SCENES_READY,),
    CANCELAR: EN_CURSO,
}


def permite(estado: str, transicion: str) -> bool:
    return estado in _PERMITIDAS.get(transicion, ())


def tras_escena(escenas: dict, orden: list[str]) -> str:
    """``scenes_ready`` cuando cada escena del esqueleto está ``done``; si no, ``skeleton_ready``."""
    if orden and all((escenas.get(clave) or {}).get("state") == "done" for clave in orden):
        return SCENES_READY
    return SKELETON_READY


def vencida(inicio: datetime | None, ahora: datetime, segundos: int = SEGUNDOS_ETAPA_VENCIDA) -> bool:
    return inicio is not None and ahora - inicio >= timedelta(seconds=segundos)


def abandonada(actualizada: datetime, ahora: datetime, horas: int = HORAS_ABANDONO) -> bool:
    return ahora - actualizada >= timedelta(hours=horas)

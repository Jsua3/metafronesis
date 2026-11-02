"""Ciclo de vida del intento (P-12 · State).

Una sola tabla dice qué estados hay, qué se puede hacer en cada uno y a cuál se
puede pasar desde él. Antes esas reglas estaban repartidas en ~15 comparaciones
de texto en ``game_service`` y ``world_service``: cada operación decidía por su
cuenta qué estado la aceptaba y nada impedía escribir una transición inválida.

Es un State liviano a propósito: cada estado es un objeto pequeño con sus
capacidades (``plays``, ``is_open``) y sus transiciones. NO guarda reglas de
negocio por estado: qué puntúa (reportes) o qué texto se muestra (DTO) son
decisiones de esas capas, que leen el valor de ``AttemptStatus``.

Transiciones:

    IN_PROGRESS ──complete──▶ COMPLETED
    IN_PROGRESS ──pause─────▶ PAUSED ──resume──▶ IN_PROGRESS
    IN_PROGRESS ──replace───▶ REPLACED
    PAUSED      ──replace───▶ REPLACED

COMPLETED, REPLACED y SAFE_EXITED son terminales. SAFE_EXITED solo existe en
intentos históricos (antes de la pausa reanudable): ninguna transición llega a él.
"""
from rest_framework.exceptions import ValidationError

from apps.simulation.models import AttemptStatus

COMPLETE = "complete"
PAUSE = "pause"
RESUME = "resume"
REPLACE = "replace"

#: Un intento nuevo siempre nace en juego.
INITIAL_STATUS = AttemptStatus.IN_PROGRESS


class InvalidAttemptTransition(ValidationError):
    """El estado actual del intento no permite esa transición (HTTP 400)."""


class AttemptState:
    """Estado base: cada subclase declara su valor, sus capacidades y sus transiciones."""

    status: str
    #: Acepta decisiones, bitácora, herramientas y movimiento.
    plays = False
    #: Sigue abierto: es el «intento activo» del estudiante (se reanuda o se reemplaza).
    is_open = False
    #: Acción → estado al que pasa.
    transitions: dict = {}

    def can(self, action):
        return action in self.transitions

    def next(self, action):
        """Estado al que pasa con ``action``; ``InvalidAttemptTransition`` si no está permitido."""
        target = self.transitions.get(action)
        if target is None:
            raise InvalidAttemptTransition(
                f"Un intento en estado {self.status} no admite la transición «{action}»"
            )
        return target


class InProgress(AttemptState):
    status = AttemptStatus.IN_PROGRESS
    plays = True
    is_open = True
    transitions = {
        COMPLETE: AttemptStatus.COMPLETED,
        PAUSE: AttemptStatus.PAUSED,
        REPLACE: AttemptStatus.REPLACED,
    }


class Paused(AttemptState):
    status = AttemptStatus.PAUSED
    is_open = True
    transitions = {
        RESUME: AttemptStatus.IN_PROGRESS,
        REPLACE: AttemptStatus.REPLACED,
    }


class Completed(AttemptState):
    status = AttemptStatus.COMPLETED


class Replaced(AttemptState):
    status = AttemptStatus.REPLACED


class SafeExited(AttemptState):
    """Salida segura terminal histórica: solo se lee."""

    status = AttemptStatus.SAFE_EXITED


_STATES = {
    state.status: state
    for state in (InProgress(), Paused(), Completed(), Replaced(), SafeExited())
}

#: Estados de un intento abierto (en juego o en pausa), en el orden de la tabla.
OPEN_STATUSES = tuple(status for status, state in _STATES.items() if state.is_open)


def state_of(attempt):
    """Estado del intento según su ``status`` guardado."""
    return _STATES[attempt.status]


def apply(attempt, action):
    """Mueve el intento al estado siguiente (solo en memoria; guardar es del servicio).

    Lanza ``InvalidAttemptTransition`` y deja el estado como estaba si no se permite.
    """
    attempt.status = state_of(attempt).next(action)
    return attempt.status

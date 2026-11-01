"""La habilitación de un caso por su asignación y su ventana (E3-2; RN-04, RF-15, decisión 12).

Este módulo contesta la mitad que depende de las asignaciones: si el estudiante tiene el caso
asignado y si su ventana está abierta. La otra mitad —la secuencia lineal— es de progresión, que
la compone sobre esto en ``apps/progression/access.py`` (la única función que consultan el
catálogo, el lobby y el inicio).

Reglas de resolución cuando una misma versión llega por varias asignaciones (R5): si **alguna**
está abierta, el caso está abierto (con el cierre más tardío); si ninguna, ``NOT_YET_OPEN`` si
alguna está programada (con la apertura más próxima) y ``CLOSED`` si todas cerraron.
"""
from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone

from .assignments import OPEN, SCHEDULED, assignment_state, format_window_value, student_assignments

NOT_ASSIGNED = "NOT_ASSIGNED"
NOT_YET_OPEN = "NOT_YET_OPEN"
CLOSED = "CLOSED"
LOCKED_BY_SEQUENCE = "LOCKED_BY_SEQUENCE"

REASONS = (NOT_ASSIGNED, NOT_YET_OPEN, CLOSED, LOCKED_BY_SEQUENCE)


@dataclass(frozen=True)
class AccessDecision:
    """El resultado de preguntar «¿puede este estudiante iniciar esta versión?».

    ``reason`` es ``None`` si puede. ``opens_at``/``closes_at`` son la ventana que explica el
    resultado (naive, hora de Bogotá). ``sort_order`` es interno: el menor de los órdenes de sus
    asignaciones, que usa la secuencia.
    """

    allowed: bool
    reason: str | None = None
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    sort_order: int = 0

    def as_dict(self):
        """``{allowed, reason?, opensAt?, closesAt?}`` (el ``access`` de C8 y del catálogo)."""
        data = {"allowed": self.allowed}
        if self.reason is not None:
            data["reason"] = self.reason
        if self.opens_at is not None:
            data["opensAt"] = format_window_value(self.opens_at)
        if self.closes_at is not None:
            data["closesAt"] = format_window_value(self.closes_at)
        return data


NOT_ASSIGNED_DECISION = AccessDecision(False, NOT_ASSIGNED)


def _decide(rows, now):
    """La decisión por ventana de las asignaciones activas ``rows`` de UNA versión (R5)."""
    order = min(row.sort_order for row in rows)
    states = [(assignment_state(row, now), row) for row in rows]
    open_rows = [row for state, row in states if state == OPEN]
    if open_rows:
        # La más permisiva: sin cierre, o con el cierre más tardío.
        best = max(open_rows, key=lambda r: (r.closes_at is None, r.closes_at or datetime.min))
        return AccessDecision(True, None, best.opens_at, best.closes_at, order)
    scheduled = [row for state, row in states if state == SCHEDULED]
    if scheduled:
        soonest = min(scheduled, key=lambda r: r.opens_at)
        return AccessDecision(False, NOT_YET_OPEN, soonest.opens_at, soonest.closes_at, order)
    latest = max(rows, key=lambda r: r.closes_at)  # todas cerraron: tienen ``closes_at``
    return AccessDecision(False, CLOSED, latest.opens_at, latest.closes_at, order)


def assignment_decisions(student_id, case_version_ids=None, now=None):
    """``{case_version_id: AccessDecision}`` de las versiones **asignadas** al estudiante.

    Una versión sin asignación activa no aparece (quien llama decide qué hacer: ``NOT_ASSIGNED``).
    Una sola consulta de asignaciones, sin importar cuántas versiones se pidan.
    """
    now = now if now is not None else timezone.now()
    rows = student_assignments(student_id)
    if case_version_ids is not None:
        rows = rows.filter(case_version_id__in=list(case_version_ids))
    by_version = {}
    for row in rows:
        by_version.setdefault(row.case_version_id, []).append(row)
    return {version_id: _decide(group, now) for version_id, group in by_version.items()}


def assignment_decision(student_id, case_version_id, now=None):
    """La decisión por asignación y ventana de UNA versión (``NOT_ASSIGNED`` si no la tiene)."""
    return assignment_decisions(student_id, [case_version_id], now).get(
        case_version_id, NOT_ASSIGNED_DECISION
    )

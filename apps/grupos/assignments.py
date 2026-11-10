"""Asignación de casos a estudiantes (RN-04, RF-14, RF-15), lado de lectura.

Un estudiante accede a una versión de caso si tiene una asignación **activa** de ella: la de
un grupo **activo** del que es miembro ``ACTIVE`` (E2-10: aceptó la invitación) o una asignación
directa suya (destino estudiante, ya soportado por el esquema). La ventana de apertura y cierre
y la secuencia las decide ``access.py`` (E3-2) sobre estas mismas filas.

Vive en ``grupos`` —de quien son las tablas— para que el simulador y la progresión lo usen sin
depender el uno del otro. Las fechas son **naive en hora de Bogotá** (``USE_TZ=False``): la API
las acepta con o sin desfase y las emite con ``-05:00`` (Bogotá no tiene horario de verano).
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from django.db.models import Exists, Q
from django.utils import timezone

from .models import CaseAssignment, MembershipStatus

BOGOTA = ZoneInfo("America/Bogota")

SCHEDULED = "SCHEDULED"
OPEN = "OPEN"
CLOSED = "CLOSED"


# ─── Fechas de la ventana ─────────────────────────────────────────────────────────────────
def parse_window_value(raw):
    """Una fecha de ventana en hora de Bogotá (naive) a partir de ISO 8601 con o sin desfase.

    ``None`` y la cadena vacía son «sin fecha». Lanza ``ValueError`` si no es una fecha válida.
    Con desfase (``-05:00``, ``Z``, ``+02:00``) se convierte a Bogotá; sin él se toma como
    Bogotá. Los microsegundos se descartan: la frontera de la ventana es al segundo.
    """
    if raw is None or raw == "":
        return None
    if isinstance(raw, datetime):
        value = raw
    elif isinstance(raw, str):
        value = datetime.fromisoformat(raw.strip())
    else:
        raise ValueError("la fecha debe ser un texto ISO 8601")
    if value.tzinfo is not None:
        value = value.astimezone(BOGOTA).replace(tzinfo=None)
    return value.replace(microsecond=0)


def format_window_value(value):
    """La fecha de ventana como ISO 8601 con el desfase de Bogotá (``-05:00``); ``None`` si no hay."""
    if value is None:
        return None
    return value.replace(tzinfo=BOGOTA).isoformat()


def assignment_state(assignment, now=None):
    """``SCHEDULED`` | ``OPEN`` | ``CLOSED`` de una asignación: ventana ``[opens_at, closes_at)``."""
    now = now if now is not None else timezone.now()
    if assignment.opens_at is not None and now < assignment.opens_at:
        return SCHEDULED
    if assignment.closes_at is not None and now >= assignment.closes_at:
        return CLOSED
    return OPEN


# ─── Qué asignaciones alcanzan a un estudiante ────────────────────────────────────────────
def reaches_student(student_ref):
    """Condición (``Q``) de las asignaciones **activas** que alcanzan a ``student_ref``.

    ``student_ref`` es un id o un ``OuterRef``: la misma regla sirve para una consulta suelta y
    para anotar otra con ``Exists`` sin un viaje más a la base.
    """
    return Q(active=True) & (
        Q(estudiante_id=student_ref)
        | Q(
            grupo__activo=True,
            grupo__grupoestudiante__estudiante_id=student_ref,
            grupo__grupoestudiante__status=MembershipStatus.ACTIVE,
        )
    )


def student_assignments(student_id):
    """Las asignaciones activas del estudiante (por grupo activo o directas), sin duplicados."""
    return CaseAssignment.objects.filter(reaches_student(student_id)).distinct()


def assigned_case_version_ids(student_id):
    """Versiones de caso asignadas al estudiante, sin importar la ventana (RN-04)."""
    return list(
        CaseAssignment.objects.filter(reaches_student(student_id))
        .values_list("case_version_id", flat=True)
        .distinct()
    )


def student_has_assignment(student_id, case_version_id):
    """¿El estudiante tiene esa versión asignada (activa, por un grupo suyo o directa)?"""
    return CaseAssignment.objects.filter(
        reaches_student(student_id), case_version_id=case_version_id
    ).exists()


def assignment_exists(student_ref, case_version_ref):
    """``Exists`` para anotar una consulta con la misma regla sin una consulta aparte.

    ``student_ref`` y ``case_version_ref`` son ``OuterRef`` (o valores) del estudiante y de la
    versión: así revalidar el acceso al cargar un intento no añade un viaje a la base.
    """
    return Exists(
        CaseAssignment.objects.filter(
            reaches_student(student_ref), case_version_id=case_version_ref
        )
    )

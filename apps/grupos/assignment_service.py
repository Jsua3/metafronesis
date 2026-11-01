"""Asignaciones de casos con ventana (E3-1, C7; RF-14, CU-06, decisiones 5 y 12).

Una asignación liga una **versión publicada** de un caso con un grupo del docente (el destino
estudiante existe en el esquema pero la API aún no lo crea: decisión 5, «grupo primero»), con una
ventana opcional ``[opens_at, closes_at)`` en hora de Bogotá, un orden (``sort_order``) para la
secuencia y ``active`` para ponerla en pausa sin borrarla.

Quién la puede tocar lo decide la matriz de políticas (``assignment.manage``: el docente dueño del
grupo; ``assignment.list``: el docente dueño o el ADMIN). Una asignación de un grupo ajeno no se
confirma (404), como una rúbrica ajena (R3).
"""
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError

from apps.simulation.models import CaseVersion
from shared import policies
from shared.exceptions import ApiError

from .assignments import assignment_state, format_window_value, parse_window_value
from .models import CaseAssignment, Grupo

SORT_ORDER_MAX = 1000
TARGET_GROUP = "GROUP"
TARGET_STUDENT = "STUDENT"


def _field_error(field, message):
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field=field)


def assignment_dto(assignment, now=None):
    """``Assignment`` (C7). ``opensAt``/``closesAt`` se omiten cuando no hay fecha."""
    if assignment.grupo_id is not None:
        target = {"type": TARGET_GROUP, "groupId": assignment.grupo_id}
    else:
        target = {"type": TARGET_STUDENT, "studentId": assignment.estudiante_id}
    data = {
        "id": assignment.id,
        "caseVersionId": assignment.case_version_id,
        "target": target,
        "state": assignment_state(assignment, now),
        "active": assignment.active,
        "sortOrder": assignment.sort_order,
    }
    if assignment.opens_at is not None:
        data["opensAt"] = format_window_value(assignment.opens_at)
    if assignment.closes_at is not None:
        data["closesAt"] = format_window_value(assignment.closes_at)
    return data


# ─── Validación de entrada ────────────────────────────────────────────────────────────────
#: El rango razonable de una fecha de ventana (S2-6b): ni un año 0001 o 9999, ni una fecha lejana por error.
FECHA_ANIO_MIN = 2000
FECHA_ANIO_MAX = 2100
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
_FECHA_FUERA_DE_RANGO = f"La fecha debe estar entre los años {FECHA_ANIO_MIN} y {FECHA_ANIO_MAX}."


def _parse_date(raw, field):
    try:
        value = parse_window_value(raw)
    except OverflowError:
        # S2-6b · un año 1 o 9999 con desfase se sale del rango de Python al pasarlo a Bogotá: 400, no 500.
        raise _field_error(field, _FECHA_FUERA_DE_RANGO) from None
    except (TypeError, ValueError):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _field_error(field, "La fecha debe ser un texto ISO 8601, p. ej. 2026-10-20T08:00:00-05:00.") from None
    if value is not None and not FECHA_ANIO_MIN <= value.year <= FECHA_ANIO_MAX:
        raise _field_error(field, _FECHA_FUERA_DE_RANGO)
    return value


def _parse_sort_order(raw):
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0 or raw > SORT_ORDER_MAX:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _field_error("sortOrder", f"El orden debe ser un entero entre 0 y {SORT_ORDER_MAX}.")
    return raw


def _check_window(opens_at, closes_at):
    if opens_at is not None and closes_at is not None and closes_at <= opens_at:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _field_error("closesAt", "La fecha de cierre debe ser posterior a la de apertura.")


# ─── Carga con propiedad ──────────────────────────────────────────────────────────────────
def _group_to_manage(group_id, actor):
    grupo = Grupo.objects.filter(pk=group_id).first()
    if grupo is None:
        raise NotFound(f"Grupo no encontrado: {group_id}")
    if not policies.can(actor, "assignment", "manage", owner_id=grupo.profesor_id):
        raise ApiError(
            "GROUP_NOT_OWNED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "No tienes permiso sobre este grupo.",
            status.HTTP_403_FORBIDDEN,
        )
    return grupo


def _assignable_version(case_version_id):
    version = (
        CaseVersion.objects.filter(pk=case_version_id).select_related("simulation_case").first()
    )
    if version is None:
        raise NotFound(f"Version de caso no encontrada: {case_version_id}")
    if version.status != "PUBLISHED" or not version.simulation_case.active:
        raise ValidationError("Solo se pueden asignar casos publicados y activos")
    return version


def _load_to_manage(assignment_id, actor, *, lock=False):
    queryset = CaseAssignment.objects.select_related("grupo")
    if lock:
        queryset = queryset.select_for_update(of=("self",))
    row = queryset.filter(pk=assignment_id).first()
    if row is None or row.grupo is None or not policies.can(
        actor, "assignment", "manage", owner_id=row.grupo.profesor_id
    ):
        # Una asignación de un grupo ajeno no se confirma (R3).
        raise NotFound("Asignación no encontrada")
    return row


# ─── Operaciones ──────────────────────────────────────────────────────────────────────────
from apps.simulation.services.audit_service import auditable


@auditable(
    "asignacion.crear",
    "ASSIGNMENT",
    -1,
    context=lambda args, kwargs, result: {
        "assignmentId": result.id,
        "caseVersionId": result.case_version_id,
        "groupId": result.grupo_id,
    },
)
@transaction.atomic
def create_assignment(actor, payload):
    """Crea la asignación de un caso a un grupo del docente. ``payload`` ya viene validado en su
    forma (``caseVersionId``, ``target``, y opcionales ``opensAt``, ``closesAt``, ``sortOrder``)."""
    target = payload["target"]
    if target.get("type") == TARGET_STUDENT:
        raise ApiError(
            "ASSIGNMENT_TARGET_UNSUPPORTED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Por ahora los casos se asignan a un grupo; la asignación individual llega después.",
            status.HTTP_400_BAD_REQUEST,
            field="target",
        )
    grupo = _group_to_manage(target["groupId"], actor)
    version = _assignable_version(payload["caseVersionId"])
    opens_at = _parse_date(payload.get("opensAt"), "opensAt")
    closes_at = _parse_date(payload.get("closesAt"), "closesAt")
    _check_window(opens_at, closes_at)
    sort_order = _parse_sort_order(payload["sortOrder"]) if "sortOrder" in payload else 0
    try:
        with transaction.atomic():
            return CaseAssignment.objects.create(
                grupo=grupo,
                case_version=version,
                opens_at=opens_at,
                closes_at=closes_at,
                sort_order=sort_order,
                assigned_by=actor,
            )
    except IntegrityError:
        existing = CaseAssignment.objects.filter(grupo_id=grupo.id, case_version_id=version.id).first()
        raise ApiError(
            "ASSIGNMENT_ALREADY_EXISTS",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Este caso ya está asignado a ese grupo.",
            status.HTTP_409_CONFLICT,
            existingAssignmentId=existing.id if existing else None,
        ) from None


def list_assignments(actor, group_id=None, case_version_id=None):
    """Las asignaciones que el actor puede listar: las de un grupo suyo (el ADMIN, todas)."""
    queryset = CaseAssignment.objects.select_related("grupo")
    if group_id is not None:
        grupo = Grupo.objects.filter(pk=group_id).first()
        if grupo is None or not policies.can(actor, "assignment", "list", owner_id=grupo.profesor_id):
            raise NotFound(f"Grupo no encontrado: {group_id}")
        queryset = queryset.filter(grupo_id=group_id)
    elif getattr(actor, "role", None) != "ADMIN":
        queryset = queryset.filter(grupo__profesor_id=actor.id)
    if case_version_id is not None:
        queryset = queryset.filter(case_version_id=case_version_id)
    return list(queryset.order_by("sort_order", "id"))


@auditable("asignacion.actualizar", "ASSIGNMENT", 1)
@transaction.atomic
def update_assignment(actor, assignment_id, changes):
    """Aplica solo lo que viene en ``changes`` («ausente = no tocar»; ``None`` borra una fecha)."""
    row = _load_to_manage(assignment_id, actor, lock=True)
    if "opensAt" in changes:
        row.opens_at = _parse_date(changes["opensAt"], "opensAt")
    if "closesAt" in changes:
        row.closes_at = _parse_date(changes["closesAt"], "closesAt")
    if "sortOrder" in changes:
        row.sort_order = _parse_sort_order(changes["sortOrder"])
    if "active" in changes:
        if not isinstance(changes["active"], bool):
            raise _field_error("active", "El estado debe ser verdadero o falso.")
        row.active = changes["active"]
    _check_window(row.opens_at, row.closes_at)
    row.save(update_fields=["opens_at", "closes_at", "sort_order", "active"])
    return row


@auditable("asignacion.eliminar", "ASSIGNMENT", 1)
@transaction.atomic
def remove_assignment(actor, assignment_id):
    row = _load_to_manage(assignment_id, actor, lock=True)
    row.delete()
    return {"id": assignment_id}

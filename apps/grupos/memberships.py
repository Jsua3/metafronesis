"""Membresías de un grupo con invitación y aceptación (E2-10, C5; D-14, decisión 22).

Un estudiante pertenece a un grupo solo cuando **acepta** la invitación del docente (o el
ADMIN la activa por él). Mientras no sea ``ACTIVE`` no accede a los casos asignados, y su
traza, su bitácora descifrada y los reportes del docente no lo incluyen: eso lo hacen
``assignments.py`` e ``instructor_scope.py``, que cuentan solo membresías ``ACTIVE``.

    (sin fila) ─invite─▶ INVITED ─accept─▶ ACTIVE ─remove─▶ REMOVED
                           │ decline                           │ invite
                           ▼                                   ▼
                        DECLINED ──────── invite ───────▶ INVITED

La parte pura (``can_transition``, ``target_of``) no toca la base de datos.
"""
from django.conf import settings
from django.utils import timezone
from rest_framework import status as http
from rest_framework.exceptions import NotFound

from apps.simulation.services.audit_service import arg, auditable
from shared.exceptions import ApiError

from .models import GrupoEstudiante, MembershipStatus
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR

INVITED = MembershipStatus.INVITED
ACTIVE = MembershipStatus.ACTIVE
DECLINED = MembershipStatus.DECLINED
REMOVED = MembershipStatus.REMOVED

#: (estado de origen, acción) → (estado destino, roles que la hacen). ``None`` = aún no hay fila.
RULES = {
    (None, "invite"): (INVITED, (PROFESOR, ADMIN)),
    (DECLINED, "invite"): (INVITED, (PROFESOR, ADMIN)),
    (REMOVED, "invite"): (INVITED, (PROFESOR, ADMIN)),
    (INVITED, "accept"): (ACTIVE, (ESTUDIANTE, ADMIN)),
    (INVITED, "decline"): (DECLINED, (ESTUDIANTE,)),
    (INVITED, "remove"): (REMOVED, (PROFESOR,)),  # el docente cancela la invitación
    (ACTIVE, "remove"): (REMOVED, (PROFESOR, ESTUDIANTE)),
}


def can_transition(current, action, *, role):
    rule = RULES.get((current, action))
    return rule is not None and role in rule[1]


def target_of(current, action):
    """El estado al que lleva la acción desde ``current`` (``None`` si no es una transición)."""
    rule = RULES.get((current, action))
    return str(rule[0]) if rule else None


# ─── Operaciones ──────────────────────────────────────────────────────────────────────────
# Cada cambio de estado es un UPDATE condicionado al estado de origen (comparar y cambiar en una
# sola sentencia): dos peticiones simultáneas no se pisan, y una respuesta basada en una lectura
# vieja no resucita una membresía que alguien más ya cambió.
def _of(group_id, student_id):
    return GrupoEstudiante.objects.filter(grupo_id=group_id, estudiante_id=student_id)


def invite(grupo, student, by):
    """Invita a ``student`` al ``grupo``. Devuelve ``(membresía, cambió)``.

    Sin fila crea una ``INVITED``; una ``DECLINED`` o ``REMOVED`` vuelve a ``INVITED``; una
    ``INVITED`` o ``ACTIVE`` no cambia (la orden es idempotente). Con el puente transitorio
    ``INVITATIONS_AUTO_ACCEPT`` la persona entra directamente como ``ACTIVE``.
    """
    now = timezone.now()
    bridge = settings.INVITATIONS_AUTO_ACCEPT
    target = ACTIVE if bridge else INVITED
    fields = {"status": target, "invited_by": by, "invited_at": now}
    if bridge:
        fields["responded_at"] = now
    row, created = GrupoEstudiante.objects.get_or_create(
        grupo_id=grupo.id, estudiante_id=student.id, defaults=fields
    )
    if created:
        return row, True
    reopen = (DECLINED, REMOVED, INVITED) if bridge else (DECLINED, REMOVED)
    changed = _of(grupo.id, student.id).filter(status__in=reopen).update(
        status=target,
        invited_by=by,
        invited_at=now,
        responded_at=now if bridge else None,
    )
    row = _of(grupo.id, student.id).first() or row
    return row, bool(changed)


def _own(group_id, student_id):
    row = (
        GrupoEstudiante.objects.select_related("grupo__profesor")
        .filter(grupo_id=group_id, estudiante_id=student_id)
        .first()
    )
    if row is None:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise NotFound("Invitación no encontrada")
    return row


def respond(group_id, student_id, *, accept):
    """El estudiante (o el ADMIN por él, al aceptar) responde la invitación de ``group_id``."""
    _own(group_id, student_id)  # 404 si no hay fila
    target = ACTIVE if accept else DECLINED
    updated = _of(group_id, student_id).filter(status=INVITED).update(
        status=target, responded_at=timezone.now()
    )
    if not updated:
        current = _of(group_id, student_id).values_list("status", flat=True).first()
        raise ApiError(
            "MEMBERSHIP_NOT_INVITED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Esta invitación ya fue respondida o ya no está vigente.",
            http.HTTP_409_CONFLICT,
            status=str(current),
        )
    return _own(group_id, student_id)


def _student_context(args, kwargs, result):
    """El estudiante de la membresía: el segundo argumento de ``accept``/``decline``/``leave``."""
    return {"studentId": arg(args, kwargs, 1, "student_id")}


@auditable("MEMBERSHIP_ACCEPTED", "GRUPO", context=_student_context)
def accept(group_id, student_id):
    return respond(group_id, student_id, accept=True)


@auditable("MEMBERSHIP_DECLINED", "GRUPO", context=_student_context)
def decline(group_id, student_id):
    return respond(group_id, student_id, accept=False)


@auditable("MEMBERSHIP_LEFT", "GRUPO", context=_student_context)
def leave(group_id, student_id):
    """El estudiante deja el grupo: ``ACTIVE → REMOVED`` (el docente puede volver a invitarlo)."""
    _own(group_id, student_id)  # 404 si no hay fila
    updated = _of(group_id, student_id).filter(status=ACTIVE).update(
        status=REMOVED, responded_at=timezone.now()
    )
    if not updated:
        current = _of(group_id, student_id).values_list("status", flat=True).first()
        raise ApiError(
            "MEMBERSHIP_NOT_ACTIVE",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Solo puedes salir de un grupo del que eres miembro.",
            http.HTTP_409_CONFLICT,
            status=str(current),
        )
    return _own(group_id, student_id)


def remove(grupo, student_id):
    """El docente retira al estudiante (o cancela su invitación): estado blando ``REMOVED``."""
    updated = _of(grupo.id, student_id).filter(status__in=(INVITED, ACTIVE)).update(
        status=REMOVED, responded_at=timezone.now()
    )
    if not updated:
        return None
    return _of(grupo.id, student_id).first()


# ─── Vista (C5) ───────────────────────────────────────────────────────────────────────────
def invitation_view(row):
    """``Invitation``: ``id`` es el ``groupId`` (la membresía es ``(grupo, actor)``, R10)."""
    teacher = row.grupo.profesor
    return {
        "id": row.grupo_id,
        "groupId": row.grupo_id,
        "groupName": row.grupo.nombre,
        "teacherName": f"{teacher.nombre} {teacher.apellido}".strip(),
        "invitedAt": row.invited_at.isoformat() if row.invited_at else None,
        "status": str(row.status),
    }


def invitations_of(student):
    """Las invitaciones del estudiante: pendientes y respondidas (no las retiradas)."""
    rows = (
        GrupoEstudiante.objects.select_related("grupo__profesor")
        .filter(estudiante_id=student.id)
        .exclude(status=REMOVED)
        .order_by("-invited_at", "-grupo_id")
    )
    return [invitation_view(row) for row in rows]

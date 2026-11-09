"""Mirrors Spring GrupoService 1:1.

GrupoDTO = {id, nombre, codigo, totalEstudiantes}. Permission/role failures use
IllegalArgumentException semantics -> 400 (ValidationError), not 403.
"""
from dataclasses import dataclass

from django.contrib.auth import get_user_model
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Count
from rest_framework.exceptions import NotFound, ValidationError

from apps.simulation.models import CaseVersion, SimulationNode
from apps.simulation.serializers import game_dtos as simulation_dto
from apps.simulation.services.audit_service import arg, auditable
from apps.users.serializers import normalize_email_value, validate_common_email_domain

from .import_contract import (
    REQUIRED_STUDENT_IMPORT_COLUMNS,
    STUDENT_IMPORT_COLUMNS,
    STUDENT_IMPORT_TEMPLATE_FILENAME,
)
from shared import policies

from . import memberships, notifications
from .lector_xlsx import _cell_text, _parse_student_import
from .models import Grupo, CaseAssignment, GrupoEstudiante, MembershipStatus
from shared.policies import ESTUDIANTE

User = get_user_model()

#: Largos de las columnas de ``users`` (nombre/apellido 100, email 255): un valor más largo rompía
#: la importación entera con un 500 en vez de señalar la fila.
_NAME_MAX = 100
_EMAIL_MAX = 255


@dataclass
class ImportValidationError(Exception):
    result: dict


def _membership_counts(grupo_ids):
    """``{grupo_id: {"ACTIVE": n, "INVITED": m}}`` en UNA consulta, para varios grupos a la vez."""
    counts = {}
    rows = (
        GrupoEstudiante.objects.filter(
            grupo_id__in=list(grupo_ids),
            status__in=[MembershipStatus.ACTIVE, MembershipStatus.INVITED],
        )
        .values("grupo_id", "status")
        .annotate(total=Count("estudiante_id"))
    )
    for row in rows:
        counts.setdefault(row["grupo_id"], {})[row["status"]] = row["total"]
    return counts


def grupo_dto(grupo, counts=None):
    """``totalEstudiantes`` cuenta a quienes aceptaron; ``totalInvitados``, a quienes aún no
    respondieron (el docente ve que su invitación sigue pendiente sin que sea un miembro)."""
    if counts is None:
        counts = _membership_counts([grupo.id])
    mine = counts.get(grupo.id, {})
    return {
        "id": grupo.id,
        "nombre": grupo.nombre,
        "codigo": grupo.codigo,
        "totalEstudiantes": mine.get(MembershipStatus.ACTIVE, 0),
        "totalInvitados": mine.get(MembershipStatus.INVITED, 0),
    }


def _grupo_dtos(grupos):
    grupos = list(grupos)
    counts = _membership_counts([g.id for g in grupos])
    return [grupo_dto(g, counts) for g in grupos]


def listar_de_profesor(profesor_id):
    return _grupo_dtos(Grupo.objects.filter(profesor_id=profesor_id, activo=True))


def listar_activos():
    return _grupo_dtos(Grupo.objects.filter(activo=True).order_by("nombre", "codigo"))


def _require_grupo(grupo_id, profesor):
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")
    if grupo.profesor_id != profesor.id:
        raise ValidationError("No tiene permiso sobre este grupo")
    return grupo


def _require_grupo_to_invite(grupo_id, actor):
    """El grupo, si el actor puede invitar a él: su profesor o el ADMIN (``membership.invite``)."""
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")
    if not policies.can(actor, "membership", "invite", owner_id=grupo.profesor_id):
        raise ValidationError("No tiene permiso sobre este grupo")
    return grupo


def _student_dto(user, membership_status):
    """Fila del listado del grupo.

    Solo quien ya aceptó (``ACTIVE``) muestra su nombre y su estado de cuenta: de una invitación
    pendiente, rechazada o retirada el docente ve el correo que él mismo escribió y el estado, no
    los datos de una cuenta que quizá nunca vio (si no, invitar por correo sirve para averiguar el
    nombre de cualquier persona; D-14).
    """
    dto = {
        "id": user.id,
        "nombre": "",
        "apellido": "",
        "email": user.email,
        "role": user.role,
        "membershipStatus": str(membership_status),
    }
    if membership_status == MembershipStatus.ACTIVE:
        dto.update(nombre=user.nombre, apellido=user.apellido, activo=user.activo)
    return dto


def _imported_student_dto(item, membership_status):
    """Fila del resultado de una importación: lo que el docente escribió en el archivo, no lo que
    hay en la cuenta (que, si ya existía, no es suyo para verlo; D-14)."""
    return {
        "row": item["row"],
        "nombre": item["nombre"],
        "apellido": item["apellido"],
        "email": item["email"],
        "role": ESTUDIANTE,
        "membershipStatus": str(membership_status),
    }


def listar_estudiantes(grupo_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    rows = list(
        GrupoEstudiante.objects.filter(grupo_id=grupo.id)
        .exclude(status=MembershipStatus.REMOVED)
        .order_by("estudiante__apellido", "estudiante__nombre", "estudiante__email")
        .values_list("estudiante_id", "status")
    )
    by_id = {u.id: u for u in User.objects.filter(id__in=[uid for uid, _ in rows])}
    return [_student_dto(by_id[uid], st) for uid, st in rows if uid in by_id]


def _import_result(
    grupo, created=0, existing=0, assigned=0, skipped=0, duplicated=0, errors=None, students=None,
    message="", ignored_columns=None,
):
    return {
        "grupo": grupo_dto(grupo),
        "created": created,
        "existing": existing,
        "assigned": assigned,
        "associated": assigned,
        "skipped": skipped,
        "duplicated": duplicated,
        "errors": errors or [],
        "students": students or [],
        # Las cuentas nuevas nacen inactivas: esperan la aprobación del ADMIN (RN-10).
        "pendingApproval": created,
        "ignoredColumns": ignored_columns or [],
        "expectedColumns": list(STUDENT_IMPORT_COLUMNS),
        "message": message,
    }


def import_spec():
    return {
        "requiredColumns": list(REQUIRED_STUDENT_IMPORT_COLUMNS),
        "optionalColumns": [column for column in STUDENT_IMPORT_COLUMNS if column not in REQUIRED_STUDENT_IMPORT_COLUMNS],
        "columns": list(STUDENT_IMPORT_COLUMNS),
        "templateFilename": STUDENT_IMPORT_TEMPLATE_FILENAME,
        "acceptedExtensions": [".xlsx"],
    }


def _validate_import_rows(grupo, rows, ignored_columns=None):
    errors = []
    normalized_rows = []
    seen_emails = set()
    for item in rows:
        row_number = item["row"]
        email_raw = _cell_text(item.get("email"))
        nombre = _cell_text(item.get("nombre"))
        apellido = _cell_text(item.get("apellido"))

        if not nombre:
            errors.append({"row": row_number, "field": "nombre", "email": email_raw, "message": "El nombre es obligatorio.", "error": "El nombre es obligatorio."})
        if not apellido:
            errors.append({"row": row_number, "field": "apellido", "email": email_raw, "message": "El apellido es obligatorio.", "error": "El apellido es obligatorio."})
        for field, text in (("nombre", nombre), ("apellido", apellido)):
            if len(text) > _NAME_MAX:
                # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
                message = f"El {field} no puede pasar de {_NAME_MAX} caracteres."
                errors.append({"row": row_number, "field": field, "email": email_raw, "message": message, "error": message})
        if not email_raw:
            errors.append({"row": row_number, "field": "email", "email": "", "message": "El email es obligatorio.", "error": "El email es obligatorio."})
            continue

        try:
            email = validate_common_email_domain(normalize_email_value(email_raw))
            validate_email(email)
            if len(email) > _EMAIL_MAX:
                raise ValueError(f"El email no puede pasar de {_EMAIL_MAX} caracteres.")
        except Exception as exc:
            detail = exc.detail if isinstance(exc, ValidationError) else str(exc)
            if isinstance(detail, list):
                detail = "; ".join(str(x) for x in detail)
            errors.append({"row": row_number, "field": "email", "email": email_raw, "message": str(detail), "error": str(detail)})
            continue

        if email in seen_emails:
            errors.append({"row": row_number, "field": "email", "email": email, "message": "Correo repetido en el archivo.", "error": "Correo repetido en el archivo."})
            continue
        seen_emails.add(email)

        user = User.objects.filter(email=email).first()
        if user and user.role != ESTUDIANTE:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            # Un mensaje genérico: no se confirma al docente que ese correo tiene otra cuenta (D-14).
            errors.append({"row": row_number, "field": "email", "email": email, "message": "Este correo no se puede agregar como estudiante.", "error": "Este correo no se puede agregar como estudiante."})
            continue

        normalized_rows.append({
            "row": row_number,
            "email": email,
            "nombre": nombre,
            "apellido": apellido,
            "user": user,
        })

    if errors:
        raise ImportValidationError(_import_result(
            grupo,
            errors=errors,
            message="El archivo contiene errores.",
            ignored_columns=ignored_columns,
        ))
    return normalized_rows


def _import_audit_context(args, kwargs, result):
    summary, _, student_ids = result
    return {"studentIds": student_ids, "created": summary["created"], "invited": summary["assigned"]}


@auditable("STUDENTS_IMPORTED", "GRUPO", context=_import_audit_context)
def _importar(grupo_id, uploaded_file, profesor):
    """La importación completa en UNA transacción. Devuelve ``(resultado, a notificar, ids)``."""
    with transaction.atomic():
        grupo = _require_grupo(grupo_id, profesor)
        rows, ignored = _parse_student_import(uploaded_file)
        rows = _validate_import_rows(grupo, rows, ignored)
        created = existing = assigned = skipped = 0
        imported_students, to_notify, student_ids = [], [], []

        for item in rows:
            user = item["user"]
            if user:
                existing += 1
            else:
                # RN-10 · cuenta PENDIENTE: inactiva, sin contraseña usable y con el cambio
                # obligatorio. El ADMIN la aprueba y recibe una contraseña temporal por correo.
                user = User.objects.create_user(
                    email=item["email"],
                    password=None,
                    nombre=item["nombre"],
                    apellido=item["apellido"],
                    role=ESTUDIANTE,
                    activo=False,
                    must_change_password=True,
                )
                created += 1

            # E2-10: la importación INVITA; el estudiante entra al grupo cuando acepta (decisión 22).
            row, changed = memberships.invite(grupo, user, profesor)
            student_ids.append(user.id)
            if changed:
                assigned += 1
                # Una cuenta pendiente aún no puede entrar: recibe su aviso al aprobarse (E2-9).
                if user.activo and row.status == MembershipStatus.INVITED:
                    to_notify.append(user)
            else:
                skipped += 1
            imported_students.append(_imported_student_dto(item, row.status))

        summary = _import_result(
            grupo,
            created=created,
            existing=existing,
            assigned=assigned,
            skipped=skipped,
            students=imported_students,
            message=f"Se procesaron correctamente {len(rows)} filas.",
            ignored_columns=ignored,
        )
    return summary, (grupo, profesor, to_notify), student_ids


def importar_estudiantes(grupo_id, uploaded_file, profesor):
    summary, (grupo, teacher, to_notify), _ = _importar(grupo_id, uploaded_file, profesor)
    # Los avisos salen DESPUÉS de confirmar: con el correo dentro de la transacción, un servidor
    # lento retiene los cerrojos de la base; y se acotan (INVITATION_EMAIL_LIMIT).
    notifications.notify_invitations(to_notify, grupo, teacher)
    return summary


def _case_summary(case_version_id):
    version = (
        CaseVersion.objects.filter(pk=case_version_id)
        .select_related("simulation_case")
        .first()
    )
    if not version:
        raise NotFound(f"Version de caso no encontrada: {case_version_id}")
    node_count = SimulationNode.objects.filter(case_version_id=version.id).count()
    return simulation_dto.case_summary(version, node_count)


def listar_casos_asignados(grupo_id, actor):
    """Las versiones asignadas al grupo: su profesor o el ADMIN (``assignment.list``)."""
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")
    if not policies.can(actor, "assignment", "list", owner_id=grupo.profesor_id):
        raise ValidationError("No tiene permiso sobre este grupo")
    ids = list(
        CaseAssignment.objects.filter(grupo_id=grupo.id, active=True)
        .order_by("-assigned_at", "-case_version_id")
        .values_list("case_version_id", flat=True)
    )
    return [_case_summary(case_version_id) for case_version_id in ids]


@auditable(
    "GROUP_CREATED", "GRUPO", -1,
    resource_id=lambda args, kwargs, result: result["id"],
    context=lambda args, kwargs, result: {"groupId": result["id"]},
)
@transaction.atomic
def crear(nombre, codigo, profesor):
    if Grupo.objects.filter(codigo=codigo).exists():
        raise ValidationError(f"Ya existe un grupo con el código: {codigo}")
    grupo = Grupo.objects.create(nombre=nombre, codigo=codigo, profesor=profesor)
    return grupo_dto(grupo)


def _campos_del_grupo_enviados(args, kwargs, result):
    """Solo los NOMBRES de los campos que la petición traía (el nombre y el código del grupo no van a la auditoría)."""
    enviados = [
        campo
        for campo, posicion in (("nombre", 1), ("codigo", 2))
        if arg(args, kwargs, posicion, campo) is not None
    ]
    return {"groupId": result["id"], "changed": enviados}


@auditable("GROUP_UPDATED", "GRUPO", 0, context=_campos_del_grupo_enviados)
@transaction.atomic
def actualizar(grupo_id, nombre, codigo, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    if nombre is not None:
        nombre = str(nombre).strip()
        if not nombre:
            raise ValidationError("El nombre del grupo es obligatorio")
        grupo.nombre = nombre
    if codigo is not None:
        codigo = str(codigo).strip()
        if not codigo:
            raise ValidationError("El código del grupo es obligatorio")
        if Grupo.objects.filter(codigo=codigo).exclude(pk=grupo.id).exists():
            raise ValidationError(f"Ya existe un grupo con el código: {codigo}")
        grupo.codigo = codigo
    grupo.save(update_fields=["nombre", "codigo"])
    return grupo_dto(grupo)


@auditable("GROUP_DELETED", "GRUPO", 0, context=lambda args, kwargs, result: {"groupId": result["id"]})
@transaction.atomic
def eliminar(grupo_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    # Las uniones se borran por el ORM antes que el grupo: en una base restaurada de un volcado
    # anterior a E0-8 sus FK son NO ACTION y no existe el ON DELETE CASCADE de la BD nueva.
    CaseAssignment.objects.filter(grupo_id=grupo.id).delete()
    GrupoEstudiante.objects.filter(grupo_id=grupo.id).delete()
    grupo.delete()
    return {"id": grupo_id}


@auditable(
    "MEMBERSHIP_REMOVED", "GRUPO",
    context=lambda args, kwargs, result: {"studentId": arg(args, kwargs, 1, "estudiante_id")},
)
@transaction.atomic
def quitar_estudiante(grupo_id, estudiante_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    memberships.remove(grupo, estudiante_id)
    return grupo_dto(grupo)


@auditable(
    "MEMBERSHIP_INVITED", "GRUPO",
    context=lambda args, kwargs, result: {"studentId": result[1]},
)
def _invitar_por_correo(grupo_id, email, actor):
    """Devuelve ``(grupo, id del estudiante invitado o None, a quién avisar o None)``."""
    with transaction.atomic():
        grupo = _require_grupo_to_invite(grupo_id, actor)
        estudiante = User.objects.filter(email=normalize_email_value(email)).first()
        if estudiante is None or estudiante.role != ESTUDIANTE:
            return grupo, None, None
        row, changed = memberships.invite(grupo, estudiante, actor)
        notify = estudiante if changed and estudiante.activo and row.status == MembershipStatus.INVITED else None
    return grupo, estudiante.id, notify


def agregar_estudiante(grupo_id, email, actor):
    """Invita al estudiante con ese correo. La respuesta es la misma exista o no la cuenta, sea o
    no de un estudiante y ya sea o no miembro: no se enumeran cuentas (D-14, E2-10)."""
    grupo, _, notify = _invitar_por_correo(grupo_id, email, actor)
    if notify is not None:
        notifications.notify_invitation(notify, grupo, actor)  # fuera de la transacción
    return grupo_dto(grupo)


def _contexto_de_la_asignacion(args, kwargs, result):
    return {"groupId": arg(args, kwargs, 0, "grupo_id"), "caseVersionId": arg(args, kwargs, 1, "case_version_id")}


# S4-1 · Las rutas heredadas ``/api/grupos/<id>/casos`` cambian lo mismo que ``/api/assignments`` y dejan las mismas
# etiquetas que esta (``asignacion.crear`` y ``asignacion.eliminar``).
@auditable("asignacion.crear", "ASSIGNMENT", -1, context=_contexto_de_la_asignacion)
@transaction.atomic
def asignar_caso(grupo_id, case_version_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    version = (
        CaseVersion.objects.filter(pk=case_version_id)
        .select_related("simulation_case")
        .first()
    )
    if not version:
        raise NotFound(f"Version de caso no encontrada: {case_version_id}")
    if version.status != "PUBLISHED" or not version.simulation_case.active:
        raise ValidationError("Solo se pueden asignar casos publicados y activos")
    assignment, created = CaseAssignment.objects.get_or_create(
        grupo_id=grupo.id, case_version_id=version.id, defaults={"assigned_by": profesor}
    )
    if not created and not assignment.active:
        # La ruta heredada no conoce la pausa: asignar de nuevo la reactiva.
        assignment.active = True
        assignment.save(update_fields=["active"])
    return listar_casos_asignados(grupo.id, profesor)


@auditable("asignacion.eliminar", "ASSIGNMENT", -1, context=_contexto_de_la_asignacion)
@transaction.atomic
def quitar_caso(grupo_id, case_version_id, profesor):
    grupo = _require_grupo(grupo_id, profesor)
    CaseAssignment.objects.filter(grupo_id=grupo.id, case_version_id=case_version_id).delete()
    return listar_casos_asignados(grupo.id, profesor)

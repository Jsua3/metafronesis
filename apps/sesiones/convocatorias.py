from django.contrib.auth.hashers import is_password_usable
from django.db import transaction
from django.db.models.functions import Lower
from django.http import Http404

from apps.grupos.models import CaseAssignment
from apps.simulation.services.audit_service import auditable
from apps.users.models import CustomUser
from shared.eventos import convocatoria_emitida, convocados_cambiaron
from shared.exceptions import ApiError
from shared.policies import ESTUDIANTE
from .codigos import generar_codigo
from .models import Convocatoria, EstadoConvocatoria, Sesion
from .servicios import obtener


def _asignar(sesion, estudiante):
    existente = CaseAssignment.objects.select_for_update().filter(case_version=sesion.case_version, estudiante=estudiante).first()
    if existente and (existente.opens_at != sesion.inicio or existente.closes_at != sesion.fin):
        raise ApiError("ASSIGNMENT_CONFLICT", "Ya existe otra asignaci?n para esta versi?n.", 409)
    CaseAssignment.objects.update_or_create(
        case_version=sesion.case_version, estudiante=estudiante,
        defaults={"opens_at": sesion.inicio, "closes_at": sesion.fin, "active": True, "assigned_by": sesion.creada_por},
    )


def _agregar(sesion, emails):
    correos = {email.strip().lower() for email in emails}
    estudiantes = CustomUser.objects.alias(correo=Lower("email")).filter(role=ESTUDIANTE, correo__in=correos)
    agregadas, codigos = [], {}
    for estudiante in estudiantes:
        anterior = Convocatoria.objects.filter(sesion=sesion, estudiante=estudiante).first()
        if anterior and anterior.estado == EstadoConvocatoria.ACTIVA and is_password_usable(anterior.codigo_hash):
            continue
        codigo, codigo_hash = generar_codigo()
        convocatoria, _ = Convocatoria.objects.update_or_create(sesion=sesion, estudiante=estudiante, defaults={"codigo_hash": codigo_hash, "estado": EstadoConvocatoria.ACTIVA})
        _asignar(sesion, estudiante)
        agregadas.append(convocatoria)
        codigos[str(estudiante.pk)] = codigo
    if agregadas:
        convocatoria_emitida.send(sender=Sesion, sesion=sesion, convocatorias=agregadas, codigos={c.estudiante_id: codigos[str(c.estudiante_id)] for c in agregadas})
        convocados_cambiaron.send(sender=Sesion, sesion=sesion, agregados=[c.estudiante for c in agregadas], retirados=[], codigos={c.estudiante_id: codigos[str(c.estudiante_id)] for c in agregadas})
    return codigos


@auditable("CONVOCADOS_AGREGADOS", "SESION", resource_id_param_index=1)
@transaction.atomic
def agregar(usuario, pk, emails):
    return _agregar(obtener(usuario, pk, lock=True), emails)


@auditable("CONVOCADO_RETIRADO", "SESION", resource_id_param_index=1)
@transaction.atomic
def retirar(usuario, pk, estudiante_id):
    sesion = obtener(usuario, pk, lock=True)
    convocatoria = Convocatoria.objects.select_related("estudiante").filter(sesion=sesion, estudiante_id=estudiante_id, estado=EstadoConvocatoria.ACTIVA).first()
    if convocatoria is None:
        raise Http404
    convocatoria.estado = EstadoConvocatoria.RETIRADA
    convocatoria.save(update_fields=["estado"])
    CaseAssignment.objects.filter(case_version=sesion.case_version, estudiante_id=estudiante_id, opens_at=sesion.inicio, closes_at=sesion.fin).update(active=False)
    convocados_cambiaron.send(sender=Sesion, sesion=sesion, agregados=[], retirados=[convocatoria.estudiante], codigos={})

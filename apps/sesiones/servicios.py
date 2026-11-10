from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.db.models.functions import Lower
from django.http import Http404

from apps.simulation.models import CaseVersion, CaseVersionStatus
from apps.simulation.services.audit_service import auditable
from apps.users.models import CustomUser
from shared.exceptions import ApiError
from shared.policies import ESTUDIANTE
from .estados import ESTADOS
from .models import Convocatoria, Sesion


def propias(usuario):
    return Sesion.objects.filter(creada_por=usuario).order_by("-inicio", "-pk")


def obtener(usuario, pk, lock=False):
    consulta = propias(usuario)
    if lock:
        consulta = consulta.select_for_update()
    sesion = consulta.filter(pk=pk).first()
    if sesion is None:
        raise Http404
    return sesion


def dto(sesion):
    return {"id": sesion.pk, "caseVersionId": sesion.case_version_id, "espacioAcademico": sesion.espacio_academico, "inicio": sesion.inicio.isoformat(), "fin": sesion.fin.isoformat(), "tiempoMaximoMin": sesion.tiempo_maximo_min, "lugar": sesion.lugar, "mensaje": sesion.mensaje, "estado": sesion.estado}


@auditable("SESION_CREADA", "SESION", resource_id=lambda args, kwargs, result: result.pk)
@transaction.atomic
def agendar(usuario, datos):
    version = CaseVersion.objects.filter(pk=datos["caseVersionId"], simulation_case__created_by=usuario).first()
    if version is None:
        raise Http404
    if version.status != CaseVersionStatus.PUBLISHED:
        raise ApiError("CASE_NOT_PUBLISHED", "La versión debe estar publicada.", 400)
    if not version.estimated_minutes or datos["tiempoMaximoMin"] > version.estimated_minutes:
        raise ApiError("INVALID_TIME_LIMIT", "El tiempo máximo supera el tiempo estimado o este no está definido.", 400)
    sesion = Sesion.objects.create(case_version=version, creada_por=usuario, espacio_academico=datos["espacioAcademico"], inicio=datos["inicio"], fin=datos["fin"], tiempo_maximo_min=datos["tiempoMaximoMin"], lugar=datos["lugar"], mensaje=datos["mensaje"])
    correos = {email.casefold() for email in datos["emails"]}
    estudiantes = CustomUser.objects.alias(email_normalizado=Lower("email")).filter(role=ESTUDIANTE, email_normalizado__in=correos)
    Convocatoria.objects.bulk_create([Convocatoria(sesion=sesion, estudiante=e, codigo_hash=make_password(None)) for e in estudiantes])
    return sesion


@auditable("SESION_INICIADA", "SESION", resource_id_param_index=1)
@transaction.atomic
def iniciar(usuario, pk):
    return _transicionar(usuario, pk, "iniciar")


@auditable("SESION_FINALIZADA", "SESION", resource_id_param_index=1)
@transaction.atomic
def finalizar(usuario, pk):
    return _transicionar(usuario, pk, "finalizar")


def _transicionar(usuario, pk, accion):
    sesion = obtener(usuario, pk, lock=True)
    sesion.estado = getattr(ESTADOS[sesion.estado], accion)()
    sesion.save(update_fields=["estado"])
    return sesion

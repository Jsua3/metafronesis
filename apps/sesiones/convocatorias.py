"""Quiénes están convocados: la foto del grupo al crear, «sincronizar» para los que llegaron después, y retirar."""
from django.db import transaction
from django.http import Http404

from apps.grupos.models import GrupoEstudiante, MembershipStatus
from apps.simulation.services.audit_service import auditable
from shared.eventos import convocados_cambiaron
from shared.policies import ESTUDIANTE

from . import efectos
from .consultas import obtener
from .models import Convocatoria, EstadoConvocatoria, Sesion


def miembros_activos(grupo):
    return GrupoEstudiante.objects.filter(
        grupo=grupo, status=MembershipStatus.ACTIVE, estudiante__activo=True, estudiante__role=ESTUDIANTE,
    ).values_list("estudiante_id", flat=True)


def _convocar(sesion, estudiantes_ids):
    if not estudiantes_ids:
        return 0
    Convocatoria.objects.bulk_create([Convocatoria(sesion=sesion, estudiante_id=i) for i in estudiantes_ids])
    sesion.estado_actual().al_sumar_convocados(sesion, estudiantes_ids)
    nuevas = Convocatoria.objects.filter(sesion=sesion, estudiante_id__in=estudiantes_ids).select_related("estudiante")
    convocados_cambiaron.send(sender=Sesion, sesion=sesion, agregados=[c.estudiante for c in nuevas], retirados=[])
    return len(estudiantes_ids)


def convocar_grupo(sesion):
    return _convocar(sesion, list(miembros_activos(sesion.grupo)))


def rehacer(sesion):
    """Tras cambiar el grupo: sale quien no está en el nuevo y entra quien falta (sin avisar dos veces)."""
    miembros = set(miembros_activos(sesion.grupo))
    salen = list(Convocatoria.objects.filter(sesion=sesion).exclude(estudiante_id__in=miembros).select_related("estudiante"))
    Convocatoria.objects.filter(pk__in=[c.pk for c in salen]).delete()
    avisar = [c.estudiante for c in salen if c.estado == EstadoConvocatoria.ACTIVA]
    if avisar:
        convocados_cambiaron.send(sender=Sesion, sesion=sesion, agregados=[], retirados=avisar)
    ya = set(Convocatoria.objects.filter(sesion=sesion).values_list("estudiante_id", flat=True))
    return _convocar(sesion, sorted(miembros - ya))


@auditable("CONVOCADOS_SINCRONIZADOS", "SESION", resource_id_param_index=1)
@transaction.atomic
def sincronizar(usuario, pk):
    sesion = obtener(usuario, pk, lock=True)
    sesion.estado_actual().exigir_gestion()
    if sesion.grupo_id is None:
        return 0
    ya = Convocatoria.objects.filter(sesion=sesion).values_list("estudiante_id", flat=True)
    return _convocar(sesion, list(miembros_activos(sesion.grupo).exclude(estudiante_id__in=ya)))


@auditable("CONVOCADO_RETIRADO", "SESION", resource_id_param_index=1)
@transaction.atomic
def retirar(usuario, pk, estudiante_id):
    sesion = obtener(usuario, pk, lock=True)
    sesion.estado_actual().exigir_gestion()
    convocatoria = (
        Convocatoria.objects.select_related("estudiante")
        .filter(sesion=sesion, estudiante_id=estudiante_id, estado=EstadoConvocatoria.ACTIVA).first()
    )
    if convocatoria is None:
        raise Http404
    convocatoria.estado = EstadoConvocatoria.RETIRADA
    convocatoria.save(update_fields=["estado"])
    efectos.deshabilitar_caso(sesion, [estudiante_id])
    convocados_cambiaron.send(sender=Sesion, sesion=sesion, agregados=[], retirados=[convocatoria.estudiante])

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError
from .models import AutorizacionRepeticion, Convocatoria, EstadoSesion, Sesion


class MotivoSerializer(serializers.Serializer):
    motivo = serializers.CharField(trim_whitespace=True, allow_blank=False)


@auditable("REPETICION_AUTORIZADA", "SESION", resource_id_param_index=1)
@transaction.atomic
def autorizar(usuario, pk, estudiante_id, motivo):
    sesion = get_object_or_404(Sesion.objects.select_for_update().select_related("case_version__simulation_case"), pk=pk)
    if sesion.case_version.simulation_case.created_by_id != usuario.pk:
        raise PermissionDenied("Solo el creador del caso puede autorizar la repetición.")
    if sesion.estado == EstadoSesion.FINALIZADA:
        raise ApiError("INVALID_TRANSITION", "La sesión ya finalizó.", 409)
    convocatoria = get_object_or_404(Convocatoria, sesion=sesion, estudiante_id=estudiante_id)
    return AutorizacionRepeticion.objects.create(convocatoria=convocatoria, autorizada_por=usuario, motivo=motivo)

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers

from apps.simulation.services.audit_service import auditable

from .consultas import obtener
from .models import AutorizacionRepeticion, Convocatoria, EstadoConvocatoria


class MotivoSerializer(serializers.Serializer):
    motivo = serializers.CharField(trim_whitespace=True, allow_blank=False, max_length=1000)


@auditable("REPETICION_AUTORIZADA", "SESION", resource_id_param_index=1)
@transaction.atomic
def autorizar(usuario, pk, estudiante_id, motivo):
    sesion = obtener(usuario, pk, lock=True)
    sesion.estado_actual().exigir_gestion()
    convocatoria = get_object_or_404(Convocatoria, sesion=sesion, estudiante_id=estudiante_id, estado=EstadoConvocatoria.ACTIVA)
    return AutorizacionRepeticion.objects.create(convocatoria=convocatoria, autorizada_por=usuario, motivo=motivo)

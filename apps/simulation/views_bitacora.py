"""Contratos de bitácora y salida segura."""

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from apps.simulation.services import bitacora, estado_intento
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

TEXTO_MAXIMO = 5000


class SolicitudReflexion(serializers.Serializer):
    nodeId = serializers.IntegerField()
    text = serializers.CharField(max_length=TEXTO_MAXIMO, allow_blank=True, trim_whitespace=False)
    requestId = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=200)
    attemptToken = serializers.JSONField(required=False)


class RespuestaReflexion(serializers.Serializer):
    nodeId = serializers.IntegerField()
    locked = serializers.BooleanField()


class SolicitudSalida(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_null=True, allow_blank=True, trim_whitespace=False)
    attemptToken = serializers.JSONField(required=False)


class RespuestaSalida(serializers.Serializer):
    attemptId = serializers.UUIDField()
    attemptToken = serializers.CharField(allow_blank=True)
    caseVersionId = serializers.IntegerField()
    caseTitle = serializers.CharField()
    status = serializers.CharField()
    persona = serializers.JSONField(allow_null=True)
    currentNode = serializers.JSONField()
    completionReport = serializers.JSONField(allow_null=True)
    supportResources = serializers.ListField(child=serializers.CharField())


class Reflexiones(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(request=SolicitudReflexion, responses={200: envelope_of(RespuestaReflexion), **error_responses(400, 401, 403, 404)})
    def post(self, request, pk):
        solicitud = SolicitudReflexion(data=request.data)
        solicitud.is_valid(raise_exception=True)
        return api_ok(bitacora.guardar(request.user, pk, solicitud.validated_data))


class SalidaSegura(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(request=SolicitudSalida, responses={200: envelope_of(RespuestaSalida), **error_responses(400, 401, 403, 404)})
    def post(self, request, pk):
        solicitud = SolicitudSalida(data=request.data)
        solicitud.is_valid(raise_exception=True)
        return api_ok(bitacora.salida_segura(request.user, pk, solicitud.validated_data.get("reason")))


class EstadoIntento(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(responses={200: envelope_of(RespuestaSalida), **error_responses(401, 403, 404)})
    def get(self, request, pk):
        return api_ok(estado_intento.leer(request.user, pk))

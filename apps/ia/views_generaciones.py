"""Generación de casos con IA por etapas · ``/api/authoring/generations``.

Las vistas no tienen lógica: leen el cuerpo, llaman al servicio (``generaciones``, que valida, comprueba la propiedad y el
apagado y lanza los errores del contrato) y responden en el sobre ``{success, data}``. Permiso ``case.author``; una generación
de otra persona es un 404 también para ADMIN.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from shared.exceptions import ApiError
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from . import generaciones

ESTADOS = ["created", "skeleton_ready", "scenes_ready", "needs_repair", "imported", "failed", "cancelled"]
ERRORES_DE_ETAPA = (404, 409, 422, 429, 502)


class InicioGeneracionSerializer(serializers.Serializer):
    lugarId = serializers.CharField(help_text="El lugar donde pasa el caso.")
    descripcion = serializers.CharField(help_text="Entre 40 y 2000 caracteres, texto plano y sin datos personales.")


class GeneracionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    lugarId = serializers.CharField()
    descripcion = serializers.CharField()
    status = serializers.ChoiceField(choices=ESTADOS)
    skeleton = serializers.JSONField(allow_null=True)
    scenes = serializers.ListField(child=serializers.JSONField())
    repairRounds = serializers.IntegerField()
    repair = serializers.JSONField(allow_null=True)
    lastError = serializers.JSONField(allow_null=True)
    caseVersionId = serializers.IntegerField(allow_null=True)
    issues = serializers.ListField(child=serializers.JSONField())
    callsUsed = serializers.IntegerField()
    callsLimit = serializers.IntegerField()
    createdAt = serializers.DateTimeField()
    updatedAt = serializers.DateTimeField()


class EstadoGeneracionSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    provider = serializers.CharField(allow_null=True)
    remainingToday = serializers.IntegerField()
    inProgress = GeneracionSerializer(allow_null=True)


class GeneracionBaseView(APIView):
    permission_classes = [policy_permission("case", "author")]


class EstadoGeneracionView(GeneracionBaseView):
    """``GET …/generations/status``: si está disponible, con qué proveedor, cuántas le quedan hoy y la que tiene en curso."""

    @extend_schema(responses={200: envelope_of(EstadoGeneracionSerializer), **error_responses(401, 403)})
    def get(self, request):
        return api_ok(generaciones.estado(request.user))


class CrearGeneracionView(GeneracionBaseView):
    """``POST …/generations``: abre una generación (``created``)."""

    @extend_schema(request=InicioGeneracionSerializer, responses={201: envelope_of(GeneracionSerializer), **error_responses(400, 401, 403, 404, 409, 429)})
    def post(self, request):
        datos = request.data if hasattr(request.data, "get") else {}
        return api_ok(generaciones.crear(request.user, datos.get("lugarId"), datos.get("descripcion")), http_status=201)


class DetalleGeneracionView(GeneracionBaseView):
    """``GET …/generations/{id}`` lee el avance; ``DELETE`` cancela."""

    @extend_schema(responses={200: envelope_of(GeneracionSerializer), **error_responses(401, 403, 404)})
    def get(self, request, gen_id):
        return api_ok(generaciones.leer(request.user, gen_id))

    @extend_schema(responses={200: envelope_of(GeneracionSerializer), **error_responses(401, 403, 404, 409)})
    def delete(self, request, gen_id):
        return api_ok(generaciones.cancelar(request.user, gen_id))


class EsqueletoGeneracionView(GeneracionBaseView):
    """``POST …/generations/{id}/skeleton``: pide el esqueleto al proveedor."""

    @extend_schema(request=None, responses={200: envelope_of(GeneracionSerializer), **error_responses(401, 403, *ERRORES_DE_ETAPA)})
    def post(self, request, gen_id):
        return api_ok(generaciones.esqueleto(request.user, gen_id))


def _reparar(request) -> bool:
    """``?repair=1`` pide la reparación; sin el parámetro, la escena normal; otro valor es un 400."""
    valor = request.query_params.get("repair")
    if valor is None or valor == "":
        return False
    if valor == "1":
        return True
    raise ApiError("VALIDATION_ERROR", generaciones.MENSAJE_REPARACION, 400, field="repair")


class EscenaGeneracionView(GeneracionBaseView):
    """``POST …/generations/{id}/scenes/{clave}``: escribe una escena; con ``?repair=1`` la rehace en una ronda de reparación."""

    @extend_schema(request=None, responses={200: envelope_of(GeneracionSerializer), **error_responses(400, 401, 403, *ERRORES_DE_ETAPA)})
    def post(self, request, gen_id, clave):
        return api_ok(generaciones.escena(request.user, gen_id, clave, reparar=_reparar(request)))


class EnsamblarGeneracionView(GeneracionBaseView):
    """``POST …/generations/{id}/assemble``: ensambla las escenas; importa un borrador, pide reparar o falla."""

    @extend_schema(request=None, responses={200: envelope_of(GeneracionSerializer), **error_responses(401, 403, 404, 409)})
    def post(self, request, gen_id):
        return api_ok(generaciones.ensamblar(request.user, gen_id))

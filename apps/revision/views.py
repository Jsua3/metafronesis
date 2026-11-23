from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from apps.simulation.services import audit_service
from apps.simulation.services.evaluacion import registrar_retroalimentacion_docente
from shared.exceptions import ApiError
from shared.permissions import policy_permission
from shared.response import api_ok
from shared.openapi import envelope_of, error_responses
from .serializers import IntentoRecienteSerializer, TrazaSerializer, ValoracionSerializer, GuardarValoracionSerializer

from . import consultas


def _entero(request, nombre):
    valor = request.query_params.get(nombre)
    if valor in (None, ""):
        return None
    try:
        return int(valor)
    except ValueError:
        raise ApiError("VALIDATION_ERROR", f"{nombre} debe ser un número entero.", 400, field=nombre) from None


class ComentarioSerializer(serializers.Serializer):
    comment = serializers.CharField(allow_blank=True, trim_whitespace=False)


class IntentosView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    def get(self, request):
        filas = consultas.listar(request.user, _entero(request, "case_version_id"), _entero(request, "grupo_id"))
        audit_service.record("INSTRUCTOR_ATTEMPTS_VIEWED", "ATTEMPT", None, {"count": len(filas)})
        return api_ok(filas)


class IntentoView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    def get(self, request, attempt_id):
        detalle = consultas.detalle(request.user, attempt_id)
        audit_service.record("INSTRUCTOR_ATTEMPT_VIEWED", "ATTEMPT", attempt_id, {})
        return api_ok(detalle)


class RetroalimentacionView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    def put(self, request, attempt_id):
        intento = consultas.intento_de(request.user, attempt_id)
        serializer = ComentarioSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        evaluacion = registrar_retroalimentacion_docente(intento, request.user, serializer.validated_data["comment"])
        return api_ok({"teacherFeedback": evaluacion.comment})


class IntentosRecientesView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    @extend_schema(responses={200: envelope_of(IntentoRecienteSerializer, many=True), **error_responses(401, 403)})
    def get(self, request):
        from . import traza
        filas = traza.recientes(request.user)
        audit_service.record("INSTRUCTOR_ATTEMPTS_VIEWED", "ATTEMPT", None, {"count": len(filas)})
        return api_ok(filas)


class TrazaView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    @extend_schema(responses={200: envelope_of(TrazaSerializer), **error_responses(401, 403, 404)})
    def get(self, request, attempt_id):
        from . import traza
        intento = consultas.intento_de(request.user, attempt_id)
        resultado = traza.traza(intento, request.user)
        audit_service.record("traza.leer", "ATTEMPT", attempt_id, {})
        return api_ok(resultado)


class ValoracionRubricaView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    @extend_schema(responses={200: envelope_of(ValoracionSerializer), **error_responses(401, 403, 404, 409)})
    def get(self, request, attempt_id):
        from . import valoracion
        resultado = valoracion.consultar(consultas.intento_de(request.user, attempt_id))
        audit_service.record("traza.leer", "ATTEMPT", attempt_id, {})
        return api_ok(resultado)

    @extend_schema(request=GuardarValoracionSerializer, responses={200: envelope_of(ValoracionSerializer), **error_responses(400, 401, 403, 404, 409)})
    def put(self, request, attempt_id):
        from . import valoracion
        resultado = valoracion.guardar(consultas.intento_de(request.user, attempt_id), request.user, request.data)
        audit_service.record("rubrica.evaluar", "ATTEMPT", attempt_id, {})
        return api_ok(resultado)

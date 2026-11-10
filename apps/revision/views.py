from rest_framework import serializers
from rest_framework.views import APIView

from apps.simulation.services import audit_service
from apps.simulation.services.evaluacion import registrar_retroalimentacion_docente
from shared.exceptions import ApiError
from shared.permissions import policy_permission
from shared.response import api_ok

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

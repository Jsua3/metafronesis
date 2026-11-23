import json
import re

from django.conf import settings
from django.core.validators import RegexValidator
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok
from . import asistente_autoria, asistentes

MAX_PETICION = 2000
MAX_SELECCION = 200
MAX_PREGUNTA_GUIA = 500
MAX_ACCIONES_GUIA = 60
MAX_PANTALLA = 64
_CARACTERES_NO_SEGUROS = re.compile(r"[^a-z0-9_-]")


class ConsultaSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=4000)
    attemptId = serializers.UUIDField()


def _datos(clase, request):
    serializer = clase(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


class ConsultaView(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def post(self, request):
        if not settings.AI_ASSISTANT_ENABLED:
            raise Http404
        datos = _datos(ConsultaSerializer, request)
        return api_ok({"answer": asistentes.consultar(request.user, datos["attemptId"], datos["question"])})


def normalizar_pantalla(crudo) -> str:
    """La pantalla como una palabra segura para la auditoría: minúsculas, ``[a-z0-9_-]``, a lo más 64."""
    return _CARACTERES_NO_SEGUROS.sub("", str(crudo).lower())[:MAX_PANTALLA]


class _Texto(serializers.CharField):
    """Un texto de verdad: DRF acepta un número como cadena, y aquí un ``3`` no es una petición."""

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class AssistantStatusSerializer(serializers.Serializer):
    """Si el asistente de autoría está listo y cuánto cupo le queda hoy a quien lo usa."""

    enabled = serializers.BooleanField()
    mode = serializers.ChoiceField(choices=["connected", "disabled"])
    remainingToday = serializers.IntegerField()


class AssistantProposeBody(serializers.Serializer):
    peticion = _Texto(max_length=MAX_PETICION)
    pantalla = _Texto(allow_blank=True)
    seleccion = serializers.JSONField(required=False, allow_null=True)

    def validate_seleccion(self, value):
        tamano = len(value) if isinstance(value, str) else len(json.dumps(value, ensure_ascii=False))
        if tamano > MAX_SELECCION:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise serializers.ValidationError("La selección es demasiado larga.")
        return value

    def validate_pantalla(self, value):
        pantalla = normalizar_pantalla(value)
        if not pantalla:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
            raise serializers.ValidationError("Indica la pantalla del editor.")
        return pantalla


class AssistantResultSerializer(serializers.Serializer):
    """El resultado de ``propose``: el mensaje, la lista de cambios propuestos y con qué modelo se hizo. Cada cambio es un objeto con su ``op`` (una de las diez operaciones del asistente) y los campos de esa operación; el servidor ya los validó contra el caso. Proponer NO escribe nada: el cliente los aplica."""

    mensaje = serializers.CharField()
    cambios = serializers.ListField(child=serializers.DictField(), help_text="Cambios validados, cada uno con su `op`.")
    changes = serializers.IntegerField(help_text="Cuántos cambios trae `cambios`.")
    model = serializers.CharField(help_text="El modelo que respondió.")
    modo = serializers.CharField(help_text="Siempre `connected` en un resultado.")


class AssistantGuideAction(serializers.Serializer):
    """Una acción del catálogo del editor: ``id`` es un identificador seguro (sin espacios ni comillas)."""

    id = _Texto(max_length=80, validators=[RegexValidator(r"^[A-Za-z0-9_.:-]+$")])
    nombre = _Texto(max_length=120)
    pantalla = _Texto(max_length=MAX_PANTALLA)


class AssistantGuideBody(serializers.Serializer):
    pregunta = _Texto(max_length=MAX_PREGUNTA_GUIA)
    acciones = serializers.ListField(child=AssistantGuideAction(), max_length=MAX_ACCIONES_GUIA)


class AssistantGuideSerializer(serializers.Serializer):
    accionId = serializers.CharField(allow_null=True)
    modo = serializers.ChoiceField(choices=["resaltar", "foco", "recorrido"])
    mensaje = serializers.CharField()
    model = serializers.CharField(help_text="El modelo que respondió.")
    changes = serializers.IntegerField(help_text="Siempre 0: la guía no propone cambios.")


class EstadoView(APIView):
    """``GET …/assistant/status``: si el asistente está listo y cuánto le queda hoy a quien lo usa."""

    permission_classes = [policy_permission("case", "author")]

    @extend_schema(responses={200: envelope_of(AssistantStatusSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        return api_ok(asistente_autoria.estado(request.user, case_version_id))


class PropuestaView(APIView):
    """``POST …/assistant/propose``: una propuesta de cambios validada para la pantalla del editor."""

    permission_classes = [policy_permission("case", "author")]

    @extend_schema(
        request=AssistantProposeBody,
        responses={200: envelope_of(AssistantResultSerializer), **error_responses(400, 401, 403, 404, 409, 422, 429, 502)},
    )
    def post(self, request, case_version_id):
        datos = _datos(AssistantProposeBody, request)
        return api_ok(asistente_autoria.proponer(request.user, case_version_id, datos))


class GuiaView(APIView):
    """``POST …/assistant/guide``: la acción del editor que responde «¿dónde está X?» o «¿cómo hago X?»."""

    permission_classes = [policy_permission("case", "author")]

    @extend_schema(
        request=AssistantGuideBody,
        responses={200: envelope_of(AssistantGuideSerializer), **error_responses(400, 401, 403, 404, 409, 422, 429, 502)},
    )
    def post(self, request, case_version_id):
        datos = _datos(AssistantGuideBody, request)
        return api_ok(asistente_autoria.guiar(request.user, case_version_id, datos))

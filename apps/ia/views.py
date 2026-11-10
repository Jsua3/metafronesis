from django.conf import settings
from django.http import Http404
from rest_framework import serializers
from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok
from . import asistentes


class PreguntaSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=4000)


class ConsultaSerializer(PreguntaSerializer):
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


class EstadoView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def get(self, request, case_version_id):
        return api_ok(asistentes.estado(request.user, case_version_id))


class PropuestaView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def post(self, request, case_version_id):
        if not settings.AI_AUTHORING_ENABLED:
            raise Http404
        datos = _datos(PreguntaSerializer, request)
        return api_ok({"proposals": [asistentes.proponer(request.user, case_version_id, datos["question"])]})


class GuiaView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def post(self, request, case_version_id):
        if not settings.AI_AUTHORING_ENABLED:
            raise Http404
        datos = _datos(PreguntaSerializer, request)
        return api_ok({"answer": asistentes.guiar(request.user, case_version_id, datos["question"])})

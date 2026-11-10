from rest_framework import serializers
from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok
from .services.progreso import progreso_de
from .services.revision_de_respuestas import revisitar


class SolicitudRevision(serializers.Serializer):
    nodeId = serializers.IntegerField(min_value=1)


class Revisit(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def post(self, request, pk):
        datos = SolicitudRevision(data=request.data)
        datos.is_valid(raise_exception=True)
        return api_ok(revisitar(request.user, pk, datos.validated_data["nodeId"]))


class Progress(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def get(self, request, pk):
        return api_ok(progreso_de(request.user, pk))

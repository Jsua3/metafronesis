"""Consulta del informe del estudiante."""

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from apps.simulation.services import informe_estudiante, world
from shared.openapi import envelope_of, error_responses
from .views_world import JUGAR_O_ENSAYAR
from shared.response import api_ok


class RespuestaInforme(serializers.Serializer):
    attemptId = serializers.UUIDField()
    caseTitle = serializers.CharField()
    status = serializers.CharField()
    totalDurationSeconds = serializers.IntegerField(allow_null=True)
    phaseDurations = serializers.ListField(child=serializers.JSONField())
    toolsUsed = serializers.IntegerField()
    reflectionsCount = serializers.IntegerField()
    safeExitUsed = serializers.BooleanField()
    visitedNodeTitles = serializers.ListField(child=serializers.CharField())
    recommendations = serializers.ListField(child=serializers.CharField())
    summaryMessage = serializers.CharField()
    schemaVersion = serializers.IntegerField(required=False)
    ending = serializers.JSONField(required=False, allow_null=True)
    milestones = serializers.JSONField(required=False)
    persona = serializers.JSONField(required=False)
    counts = serializers.JSONField(required=False)
    decisionReview = serializers.ListField(child=serializers.JSONField(), required=False)
    competencyLevels = serializers.ListField(child=serializers.JSONField(), required=False)
    reflections = serializers.ListField(child=serializers.JSONField(), required=False)
    retries = serializers.IntegerField(required=False)
    prohibitedRetries = serializers.IntegerField(required=False)


class InformeEstudiante(APIView):
    permission_classes = [JUGAR_O_ENSAYAR]

    @extend_schema(responses={200: envelope_of(RespuestaInforme), **error_responses(401, 403, 404)})
    def get(self, request, pk):
        return api_ok(world._ejecutar(request.user, pk, informe_estudiante.leer))

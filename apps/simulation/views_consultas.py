import json

from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from apps.simulation.models import SimulationAttempt
from apps.simulation.services.access import available_versions
from apps.simulation.services.attempt_api import owned
from apps.simulation.services.attempt_lifecycle import OPEN_STATUSES
from shared.permissions import policy_permission
from shared.response import api_ok


def datos_intento(intento):
    return {
        "attemptId": str(intento.pk), "caseVersionId": intento.case_version_id,
        "status": intento.status, "startedAt": intento.started_at,
        "endedAt": intento.ended_at, "currentNodeId": intento.current_node_id,
    }


class Ficha(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def get(self, request, case_version_id):
        version = get_object_or_404(available_versions(request.user).select_related("simulation_case"), pk=case_version_id)
        caso = version.simulation_case
        return api_ok({"caseVersionId": version.pk, "code": caso.code, "title": caso.title,
                       "description": caso.description, "narrativeContext": version.narrative_context,
                       "learningObjectives": json.loads(version.learning_objectives),
                       "estimatedMinutes": version.estimated_minutes})


class IntentoActivo(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def get(self, request, case_version_id):
        get_object_or_404(available_versions(request.user), pk=case_version_id)
        intento = SimulationAttempt.objects.filter(student=request.user, case_version_id=case_version_id,
                                                    status__in=OPEN_STATUSES).first()
        return api_ok(datos_intento(owned(request.user, intento.pk)) if intento else {"attemptId": None})


class Historial(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def get(self, request):
        intentos = SimulationAttempt.objects.filter(student=request.user).order_by("-started_at", "-pk")
        return api_ok([datos_intento(intento) for intento in intentos])

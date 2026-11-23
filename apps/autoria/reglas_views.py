"""Rutas de reglas, rúbrica y aceptación de sugerencias."""
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from apps.simulation.services.audit_service import auditable
from shared.permissions import policy_permission
from shared.response import api_ok
from . import reglas
from .mundo_serializers import RevisionMundoSerializer
from .mundo_views import CABECERA_REVISION, RESPUESTAS, _datos


class HitosSerializer(RevisionMundoSerializer):
    milestones = serializers.JSONField()


class RiesgoSerializer(RevisionMundoSerializer):
    riskLevel = serializers.JSONField(allow_null=True)


class FinalesSerializer(RevisionMundoSerializer):
    endings = serializers.JSONField()


class RubricaSerializer(RevisionMundoSerializer):
    rubricId = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    fromCompetencies = serializers.BooleanField(required=False)


def _ejecutar(request, version_id, clase, servicio, accion, *argumentos):
    datos = _datos(request, clase)
    funcion = auditable(accion, "CASE_VERSION", resource_id_param_index=1)(servicio)
    return api_ok(funcion(request.user, version_id, datos, *argumentos))


class HitosView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=HitosSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id):
        return _ejecutar(request, case_version_id, HitosSerializer, reglas.actualizar_reglas, "ADMIN_UPDATE_MILESTONES", "milestones")


class RiesgoView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=RiesgoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id):
        return _ejecutar(request, case_version_id, RiesgoSerializer, reglas.actualizar_reglas, "ADMIN_UPDATE_RISK", "risk")


class FinalesView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=FinalesSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id):
        return _ejecutar(request, case_version_id, FinalesSerializer, reglas.actualizar_reglas, "ADMIN_UPDATE_ENDINGS", "endings")


class RubricaView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=RubricaSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def post(self, request, case_version_id):
        return _ejecutar(request, case_version_id, RubricaSerializer, reglas.adoptar_rubrica, "RUBRIC_UPDATED")


class AceptarView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=RevisionMundoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def post(self, request, case_version_id, tipo, elemento_id):
        acciones = {"nodes": "ADMIN_ACCEPT_AI_NODE", "decisions": "ADMIN_ACCEPT_AI_DECISION", "dialogues": "ADMIN_ACCEPT_AI_DIALOGUE", "objects": "ADMIN_ACCEPT_AI_OBJECT"}
        return _ejecutar(request, case_version_id, RevisionMundoSerializer, reglas.aceptar, acciones[tipo], tipo, elemento_id)

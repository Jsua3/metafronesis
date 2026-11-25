from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from apps.simulation.models import Competency, Rubric
from apps.simulation.services import rubricas
from shared.permissions import policy_permission
from shared.openapi import envelope_of, error_responses
from shared.response import api_created, api_ok


class CriterioGestionSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    competency = serializers.CharField(required=False, allow_blank=True)
    competencyId = serializers.IntegerField(required=False, allow_null=True)
    title = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    weight = serializers.FloatField(required=False)
    displayOrder = serializers.IntegerField(required=False)
    active = serializers.BooleanField(required=False)
    levelDescriptors = serializers.DictField(child=serializers.CharField(allow_blank=True, allow_null=True), required=False, allow_null=True)


class RubricaGestionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    ownerId = serializers.IntegerField()
    name = serializers.CharField()
    description = serializers.CharField(allow_null=True, allow_blank=True)
    active = serializers.BooleanField()
    version = serializers.CharField()
    isDefault = serializers.BooleanField()
    totalWeight = serializers.FloatField()
    criteriaCount = serializers.IntegerField()
    createdAt = serializers.DateTimeField(allow_null=True)
    updatedAt = serializers.DateTimeField(allow_null=True)
    caseVersion = serializers.JSONField(allow_null=True)
    usage = serializers.DictField(child=serializers.IntegerField())
    editable = serializers.BooleanField()
    criteria = CriterioGestionSerializer(many=True, required=False)


class EdicionRubricaSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    version = serializers.CharField(required=False)
    active = serializers.BooleanField(required=False)
    isDefault = serializers.BooleanField(required=False)
    criteria = CriterioGestionSerializer(many=True, required=False)


class CompetenciasView(APIView):
    permission_classes = [policy_permission("competency", "read")]

    def get(self, request):
        return api_ok([
            {"id": competencia.pk, "code": competencia.code, "name": competencia.name,
             "description": competencia.description, "active": competencia.active,
             "sortOrder": competencia.sort_order}
            for competencia in Competency.objects.order_by("sort_order", "code")
        ])


class CriterioSerializer(serializers.Serializer):
    competency = serializers.CharField(max_length=100)
    description = serializers.CharField(allow_blank=True)
    weight = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100)
    levelDescriptors = serializers.JSONField(required=False, allow_null=True)


class RubricaSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    criteria = CriterioSerializer(many=True, allow_empty=True)


class AsociacionSerializer(serializers.Serializer):
    rubricId = serializers.IntegerField(min_value=1)


def _datos(rubrica):
    from apps.simulation.services.gestion_rubricas import descriptores

    return {
        "id": rubrica.pk,
        "name": rubrica.name,
        "criteria": [
            {"id": criterio.pk, "competency": criterio.competency,
             "description": criterio.description, "weight": str(criterio.weight),
             "levelDescriptors": descriptores(criterio)}
            for criterio in rubrica.criteria.all()
        ],
    }


class RubricaCreateView(APIView):
    def get_permissions(self):
        accion = "read" if self.request.method == "GET" else "edit"
        return [policy_permission("rubric", accion)()]

    @extend_schema(responses={200: envelope_of(RubricaGestionSerializer, many=True), **error_responses(401, 403)})
    def get(self, request):
        from apps.simulation.services import gestion_rubricas
        rubricas_visibles = gestion_rubricas.visibles(request.user).order_by("-is_default", "-active", "name", "id")
        return api_ok([gestion_rubricas.resumen(rubrica, request.user) for rubrica in rubricas_visibles])

    def post(self, request):
        serializer = RubricaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data
        return api_created(_datos(rubricas.crear_rubrica(request.user, datos["name"], datos["criteria"])))


class RubricaDetailView(APIView):
    permission_classes = [policy_permission("rubric", "read")]

    def get_permissions(self):
        accion = "read" if self.request.method == "GET" else "edit"
        return [policy_permission("rubric", accion)()]

    @extend_schema(request=EdicionRubricaSerializer, responses={200: envelope_of(RubricaGestionSerializer), **error_responses(400, 401, 403, 404, 409)})
    def put(self, request, rubric_id):
        from apps.simulation.services import gestion_rubricas
        rubrica = gestion_rubricas.editar(rubric_id, request.data, request.user)
        return api_ok(gestion_rubricas.resumen(rubrica, request.user, True))

    def get(self, request, rubric_id):
        rubrica = get_object_or_404(Rubric.objects.prefetch_related("criteria"), pk=rubric_id)
        return api_ok(_datos(rubrica))


class RubricaVersionView(APIView):
    permission_classes = [policy_permission("rubric", "edit")]

    @extend_schema(responses={200: envelope_of(RubricaGestionSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        from apps.revision.valoracion import rubrica_para_revision
        from apps.simulation.models import CaseVersion
        from apps.simulation.services import gestion_rubricas
        from shared import policies

        version = get_object_or_404(CaseVersion.objects.select_related("simulation_case"), pk=case_version_id)
        if not policies.can(request.user, "case", "author", owner_id=version.simulation_case.created_by_id):
            from django.http import Http404
            raise Http404
        rubrica = rubrica_para_revision(version.pk)
        if rubrica is None:
            from shared.exceptions import ApiError
            raise ApiError("RUBRIC_NOT_ASSIGNED", "El caso no tiene rúbrica asignada.", 404)
        if not gestion_rubricas.visibles(request.user).filter(pk=rubrica.pk).exists():
            from django.http import Http404
            raise Http404
        return api_ok(gestion_rubricas.resumen(rubrica, request.user, True))

    def put(self, request, case_version_id):
        serializer = AsociacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        asignacion = rubricas.asociar_a_version(request.user, serializer.validated_data["rubricId"], case_version_id)
        return api_ok({"caseVersionId": asignacion.case_version_id, "rubricId": asignacion.rubric_id})


class RubricaActivarView(APIView):
    permission_classes = [policy_permission("rubric", "edit")]

    @extend_schema(request=None, responses={200: envelope_of(RubricaGestionSerializer), **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, rubric_id):
        from apps.simulation.services import gestion_rubricas
        rubrica = gestion_rubricas.cambiar_estado(rubric_id, True, request.user)
        return api_ok(gestion_rubricas.resumen(rubrica, request.user, True))


class RubricaDesactivarView(APIView):
    permission_classes = [policy_permission("rubric", "edit")]

    @extend_schema(request=None, responses={200: envelope_of(RubricaGestionSerializer), **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, rubric_id):
        from apps.simulation.services import gestion_rubricas
        rubrica = gestion_rubricas.cambiar_estado(rubric_id, False, request.user)
        return api_ok(gestion_rubricas.resumen(rubrica, request.user, True))


class RubricaDuplicarView(APIView):
    permission_classes = [policy_permission("rubric", "edit")]

    @extend_schema(request=None, responses={200: envelope_of(RubricaGestionSerializer), **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, rubric_id):
        from apps.simulation.services import gestion_rubricas
        rubrica = gestion_rubricas.duplicar(rubric_id, request.user)
        return api_ok(gestion_rubricas.resumen(rubrica, request.user, True))


class RubricaPredeterminadaView(APIView):
    permission_classes = [policy_permission("rubric", "default")]

    @extend_schema(request=None, responses={200: envelope_of(RubricaGestionSerializer), **error_responses(400, 401, 403, 404, 409)})
    def post(self, request, rubric_id):
        from apps.simulation.services import gestion_rubricas
        rubrica = gestion_rubricas.predeterminar(rubric_id, request.user)
        return api_ok(gestion_rubricas.resumen(rubrica, request.user, True))

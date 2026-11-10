from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.views import APIView

from apps.simulation.models import Rubric
from apps.simulation.services import rubricas
from shared.permissions import policy_permission
from shared.response import api_created, api_ok


class CriterioSerializer(serializers.Serializer):
    competency = serializers.CharField(max_length=100)
    description = serializers.CharField(allow_blank=True)
    weight = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100)


class RubricaSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    criteria = CriterioSerializer(many=True, allow_empty=True)


class AsociacionSerializer(serializers.Serializer):
    rubricId = serializers.IntegerField(min_value=1)


def _datos(rubrica):
    return {
        "id": rubrica.pk,
        "name": rubrica.name,
        "criteria": [
            {"id": criterio.pk, "competency": criterio.competency,
             "description": criterio.description, "weight": str(criterio.weight)}
            for criterio in rubrica.criteria.all()
        ],
    }


class RubricaCreateView(APIView):
    permission_classes = [policy_permission("rubric", "edit")]

    def post(self, request):
        serializer = RubricaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data
        return api_created(_datos(rubricas.crear_rubrica(request.user, datos["name"], datos["criteria"])))


class RubricaDetailView(APIView):
    permission_classes = [policy_permission("rubric", "read")]

    def get(self, request, rubric_id):
        rubrica = get_object_or_404(Rubric.objects.prefetch_related("criteria"), pk=rubric_id)
        return api_ok(_datos(rubrica))


class RubricaVersionView(APIView):
    permission_classes = [policy_permission("rubric", "edit")]

    def put(self, request, case_version_id):
        serializer = AsociacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        asignacion = rubricas.asociar_a_version(request.user, serializer.validated_data["rubricId"], case_version_id)
        return api_ok({"caseVersionId": asignacion.case_version_id, "rubricId": asignacion.rubric_id})

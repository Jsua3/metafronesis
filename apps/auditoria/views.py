from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok

from .serializers import FiltrosAuditoriaSerializer
from .servicios import consultar


class AuditoriaView(APIView):
    permission_classes = [policy_permission("audit", "read")]

    def get(self, request):
        filtros = FiltrosAuditoriaSerializer(data=request.query_params)
        filtros.is_valid(raise_exception=True)
        return api_ok(consultar(filtros.validated_data))

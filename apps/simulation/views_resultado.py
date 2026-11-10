from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok
from .services.resultado import resultado_de


class Resultado(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    def get(self, request, pk):
        return api_ok(resultado_de(request.user, pk))

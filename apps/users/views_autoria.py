from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok
from . import permisos


class PermisoDeAutoriaView(APIView):
    permission_classes = [policy_permission("user", "manage")]

    def put(self, request, user_id):
        permisos.otorgar(request.user, user_id)
        return api_ok()

    def delete(self, request, user_id):
        permisos.retirar(request.user, user_id)
        return api_ok()

from dataclasses import asdict

from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok
from .ciclo import validar


class ValidarView(APIView):
    permission_classes = [policy_permission('case', 'author')]

    def post(self, request, case_version_id):
        problemas = validar(request.user, case_version_id)
        return api_ok({'valid': not problemas, 'problems': [asdict(p) for p in problemas]})

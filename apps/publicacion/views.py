from dataclasses import asdict

from rest_framework.views import APIView

from shared.exceptions import ApiError
from shared.permissions import policy_permission
from shared.response import api_created, api_ok
from . import ciclo, clonado


class ValidarView(APIView):
    permission_classes = [policy_permission('case', 'author')]

    def post(self, request, case_version_id):
        problemas = ciclo.validar(request.user, case_version_id)
        return api_ok({'valid': not problemas, 'problems': [asdict(p) for p in problemas]})


class LifecycleView(APIView):
    permission_classes = [policy_permission('case', 'submit')]

    def get_permissions(self):
        datos = getattr(self.request, 'data', {})
        accion = 'archive' if datos.get('action') == 'archive' else 'submit'
        return [policy_permission('case', accion)()]

    def post(self, request, case_version_id):
        acciones = {'submit': ciclo.enviar_a_revision, 'archive': ciclo.archivar}
        accion = acciones.get(request.data.get('action'))
        if accion is None:
            raise ApiError('VALIDATION_ERROR', 'Acción inválida.', 400)
        version = accion(request.user, case_version_id)
        return api_ok({'versionId': version.pk, 'status': version.status})


class PublicarView(APIView):
    permission_classes = [policy_permission('case', 'publish')]

    def post(self, request, case_version_id):
        version = ciclo.publicar(request.user, case_version_id)
        return api_ok({'versionId': version.pk, 'status': version.status})


class ClonarView(APIView):
    permission_classes = [policy_permission('case', 'author')]

    def post(self, request, case_version_id):
        version = clonado.clonar(request.user, case_version_id)
        return api_created({'versionId': version.pk, 'status': version.status})


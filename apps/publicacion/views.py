from dataclasses import asdict

from rest_framework.views import APIView

from shared.exceptions import ApiError
from shared.permissions import policy_permission
from shared.response import api_created, api_ok
from . import ciclo, clonado
from .vista_ciclo import vista_ciclo


class ValidarView(APIView):
    permission_classes = [policy_permission('case', 'author')]

    def post(self, request, case_version_id):
        problemas = ciclo.validar(request.user, case_version_id)
        return api_ok({'valid': not problemas, 'problems': [asdict(p) for p in problemas]})


class LifecycleView(APIView):
    permission_classes = [policy_permission('case', 'submit')]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [policy_permission('case', 'author')()]
        datos = getattr(self.request, 'data', {})
        accion = {'archive': 'archive', 'reject': 'publish'}.get(datos.get('action'), 'submit')
        return [policy_permission('case', accion)()]

    def get(self, request, case_version_id):
        version = ciclo.version_accesible(request.user, case_version_id)
        return api_ok(vista_ciclo(request.user, version))

    def post(self, request, case_version_id):
        datos = request.data
        if datos.get('action') == 'reject':
            version = ciclo.devolver_a_borrador(request.user, case_version_id, datos.get('reason'), datos.get('note'))
        else:
            acciones = {'submit': ciclo.enviar_a_revision, 'archive': ciclo.archivar}
            accion = acciones.get(datos.get('action'))
            if accion is None:
                raise ApiError('VALIDATION_ERROR', 'Acción inválida.', 400)
            version = accion(request.user, case_version_id)
        return api_ok({'versionId': version.pk, 'status': version.status, **vista_ciclo(request.user, version)})


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


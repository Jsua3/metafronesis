from django.http import HttpResponse
from rest_framework.views import APIView

from shared.exceptions import ApiError
from shared.permissions import policy_permission

from .servicios import reporte_de_grupo, reporte_de_sesion


class ExportarGrupoView(APIView):
    permission_classes = [policy_permission('analytics', 'read')]

    def get(self, request, grupo_id):
        try:
            version_id = int(request.query_params.get('case_version_id', ''))
            if version_id <= 0:
                raise ValueError
        except ValueError:
            raise ApiError('VALIDATION_ERROR', 'case_version_id debe ser un entero positivo.', 400) from None
        contenido, tipo, nombre = reporte_de_grupo(
            request.user, grupo_id, version_id, request.query_params.get('formato', 'csv'),
        )
        respuesta = HttpResponse(contenido, content_type=tipo)
        respuesta['Content-Disposition'] = f'attachment; filename="{nombre}"'
        return respuesta


class ExportarSesionView(APIView):
    permission_classes = [policy_permission('analytics', 'read')]

    def get(self, request, sesion_id):
        contenido, tipo, nombre = reporte_de_sesion(
            request.user, sesion_id, request.query_params.get('formato', 'csv'),
        )
        respuesta = HttpResponse(contenido, content_type=tipo)
        respuesta['Content-Disposition'] = f'attachment; filename="{nombre}"'
        return respuesta

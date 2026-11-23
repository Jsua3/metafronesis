from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.views import APIView

from apps.simulation.services.audit_service import record
from shared.exceptions import ApiError
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from . import consultas
from .contratos import ReporteEstudianteSerializer, ReporteGrupoSerializer, TableroSerializer
from .servicios import reporte_de_grupo, reporte_de_sesion


def entero_opcional(valor):
    try:
        return int(valor) if valor else None
    except (TypeError, ValueError):
        return None


class DashboardView(APIView):
    permission_classes = [policy_permission('analytics', 'read')]

    @extend_schema(responses={200: envelope_of(TableroSerializer), **error_responses(401, 403)})
    def get(self, request):
        datos = consultas.tablero(request.user)
        record('ANALYTICS_VIEWED', 'DASHBOARD')
        return api_ok(datos)


class ReporteGrupoView(APIView):
    permission_classes = [policy_permission('analytics', 'read')]

    @extend_schema(parameters=[OpenApiParameter('caseVersionId', int)],
                   responses={200: envelope_of(ReporteGrupoSerializer), **error_responses(401, 403, 404)})
    def get(self, request, grupo_id):
        version_id = entero_opcional(request.query_params.get('caseVersionId'))
        datos = consultas.reporte_grupo(request.user, grupo_id, version_id)
        record('REPORT_VIEWED', 'GRUPO', grupo_id, {'groupId': grupo_id, 'caseVersionId': version_id})
        return api_ok(datos)


class ReporteEstudianteView(APIView):
    permission_classes = [policy_permission('analytics', 'read')]

    @extend_schema(parameters=[OpenApiParameter('caseVersionId', int), OpenApiParameter('limit', int)],
                   responses={200: envelope_of(ReporteEstudianteSerializer), **error_responses(401, 403, 404)})
    def get(self, request, estudiante_id):
        version_id = entero_opcional(request.query_params.get('caseVersionId'))
        limite = entero_opcional(request.query_params.get('limit'))
        datos = consultas.reporte_estudiante(request.user, estudiante_id, version_id, limite)
        record('REPORT_VIEWED', 'USER', estudiante_id, {'studentId': estudiante_id, 'caseVersionId': version_id})
        return api_ok(datos)


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

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.views import APIView

from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok
from . import mundo
from .mundo_serializers import DefinicionMundoSerializer, GuardarMundoSerializer, MapaSerializer, ObjetoSerializer, PistaSerializer, RevisionMundoSerializer
from .serializers import VistaEditorSerializer

CABECERA_REVISION = OpenApiParameter("X-Case-Revision", int, OpenApiParameter.HEADER)
RESPUESTAS = {200: envelope_of(VistaEditorSerializer), **error_responses(400, 401, 403, 404, 409)}
RESPUESTAS_MUNDO = {200: envelope_of(DefinicionMundoSerializer), **error_responses(400, 401, 403, 404, 409)}


def _datos(request, clase):
    datos = dict(request.data)
    if datos.get("revision") in (None, ""):
        revision = request.query_params.get("revision") or request.headers.get("X-Case-Revision")
        if revision is not None:
            datos["revision"] = revision
    serializador = clase(data=datos)
    serializador.is_valid(raise_exception=True)
    return serializador.validated_data


class MapasView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=MapaSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def post(self, request, case_version_id):
        return api_ok(mundo.crear_mapa(request.user, case_version_id, _datos(request, MapaSerializer)))


class MapaView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=MapaSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id, map_id):
        return api_ok(mundo.actualizar_mapa(request.user, case_version_id, _datos(request, MapaSerializer), map_id))

    @extend_schema(request=RevisionMundoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def delete(self, request, case_version_id, map_id):
        return api_ok(mundo.borrar_mapa(request.user, case_version_id, _datos(request, RevisionMundoSerializer), map_id))


class ObjetosView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=ObjetoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def post(self, request, case_version_id, map_id):
        return api_ok(mundo.crear_objeto(request.user, case_version_id, _datos(request, ObjetoSerializer), map_id))


class ObjetoView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=ObjetoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id, object_id):
        return api_ok(mundo.actualizar_objeto(request.user, case_version_id, _datos(request, ObjetoSerializer), object_id))

    @extend_schema(request=RevisionMundoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def delete(self, request, case_version_id, object_id):
        return api_ok(mundo.borrar_objeto(request.user, case_version_id, _datos(request, RevisionMundoSerializer), object_id))


class PistasView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=PistaSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def post(self, request, case_version_id, map_id):
        return api_ok(mundo.crear_pista(request.user, case_version_id, _datos(request, PistaSerializer), map_id))


class PistaView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=PistaSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id, hint_id):
        return api_ok(mundo.actualizar_pista(request.user, case_version_id, _datos(request, PistaSerializer), hint_id))

    @extend_schema(request=RevisionMundoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def delete(self, request, case_version_id, hint_id):
        return api_ok(mundo.borrar_pista(request.user, case_version_id, _datos(request, RevisionMundoSerializer), hint_id))


class MundoView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(parameters=[OpenApiParameter("nodeId", int, OpenApiParameter.QUERY)], responses=RESPUESTAS_MUNDO)
    def get(self, request, case_version_id):
        return api_ok(mundo.leer_mundo(request.user, case_version_id, request.query_params.get("nodeId")))

    @extend_schema(request=GuardarMundoSerializer, parameters=[CABECERA_REVISION, OpenApiParameter("nodeId", int, OpenApiParameter.QUERY)], responses=RESPUESTAS_MUNDO)
    def put(self, request, case_version_id):
        return api_ok(mundo.guardar_mundo(request.user, case_version_id, _datos(request, GuardarMundoSerializer), request.query_params.get("nodeId")))

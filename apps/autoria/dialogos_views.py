from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from apps.simulation.services.audit_service import auditable
from shared.permissions import policy_permission
from shared.response import api_ok
from . import dialogos
from .dialogos_serializers import DialogoSerializer, HerramientaSerializer, OrdenSerializer, PersonajeSerializer
from .mundo_serializers import RevisionMundoSerializer
from .mundo_views import CABECERA_REVISION, RESPUESTAS, _datos


def _ejecutar(request, version_id, clase, tipo, operacion, accion, elemento_id=None, mapa_id=None):
    datos = _datos(request, clase)
    servicio = auditable(accion, "CASE_VERSION", resource_id_param_index=1)(dialogos.operar)
    return api_ok(servicio(request.user, version_id, datos, tipo, operacion, elemento_id, mapa_id))


class DialogosView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=DialogoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def post(self, request, case_version_id, map_id):
        return _ejecutar(request, case_version_id, DialogoSerializer, "dialogo", "crear", "ADMIN_CREATE_DIALOGUE", mapa_id=map_id)


class DialogoView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=DialogoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id, tree_id):
        return _ejecutar(request, case_version_id, DialogoSerializer, "dialogo", "actualizar", "ADMIN_UPDATE_DIALOGUE", tree_id)

    @extend_schema(request=RevisionMundoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def delete(self, request, case_version_id, tree_id):
        return _ejecutar(request, case_version_id, RevisionMundoSerializer, "dialogo", "borrar", "ADMIN_DELETE_DIALOGUE", tree_id)


class HerramientasView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=HerramientaSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def post(self, request, case_version_id):
        return _ejecutar(request, case_version_id, HerramientaSerializer, "herramienta", "crear", "ADMIN_CREATE_TOOL")


class HerramientaView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=HerramientaSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id, tool_id):
        return _ejecutar(request, case_version_id, HerramientaSerializer, "herramienta", "actualizar", "ADMIN_UPDATE_TOOL", tool_id)

    @extend_schema(request=RevisionMundoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def delete(self, request, case_version_id, tool_id):
        return _ejecutar(request, case_version_id, RevisionMundoSerializer, "herramienta", "borrar", "ADMIN_DELETE_TOOL", tool_id)


class PersonajesView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=PersonajeSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def post(self, request, case_version_id):
        return _ejecutar(request, case_version_id, PersonajeSerializer, "personaje", "crear", "ADMIN_CREATE_CHARACTER")


class PersonajeView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=PersonajeSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def put(self, request, case_version_id, character_id):
        return _ejecutar(request, case_version_id, PersonajeSerializer, "personaje", "actualizar", "ADMIN_UPDATE_CHARACTER", character_id)

    @extend_schema(request=RevisionMundoSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def delete(self, request, case_version_id, character_id):
        return _ejecutar(request, case_version_id, RevisionMundoSerializer, "personaje", "borrar", "ADMIN_DELETE_CHARACTER", character_id)


class OrdenNodosView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=OrdenSerializer, parameters=[CABECERA_REVISION], responses=RESPUESTAS)
    def patch(self, request, case_version_id):
        return _ejecutar(request, case_version_id, OrdenSerializer, "orden", "actualizar", "ADMIN_REORDER_NODES")

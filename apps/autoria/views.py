from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.views import APIView
from shared.permissions import policy_permission
from shared.response import api_created, api_ok
from shared.openapi import envelope_of, error_responses
from . import decisiones, editor, escenas, plano, servicios
from .serializers import (CrearDecisionSerializer, CrearEscenaSerializer, CrearFichaSerializer,
                          ChecklistSerializer, DecisionSerializer, EscenaSerializer, FichaSerializer, PlanoSerializer,
                          RevisionSerializer, VistaEditorSerializer)


class CasosView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def get(self, request):
        return api_ok(servicios.listar(request.user))

    def post(self, request):
        serializer = CrearFichaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return api_created(servicios.resumen(servicios.crear_borrador(request.user, serializer.validated_data)))


class DefinicionView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def get(self, request, case_version_id):
        return api_ok(servicios.definicion(request.user, case_version_id))


class FichaView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def put(self, request, case_version_id):
        datos = _datos(FichaSerializer, request)
        return api_ok(servicios.actualizar_ficha(request.user, case_version_id, datos, datos.get("revision")))


CABECERA_REVISION = "X-Case-Revision"


def _datos(serializer, request):
    """El cuerpo validado. La revisión del caso puede ir en el cuerpo o, como la manda el editor, en ``X-Case-Revision``."""
    cuerpo = dict(request.data) if hasattr(request.data, "keys") else {}
    if cuerpo.get("revision") in (None, "") and request.headers.get(CABECERA_REVISION) is not None:
        cuerpo["revision"] = request.headers[CABECERA_REVISION]
    instancia = serializer(data=cuerpo)
    instancia.is_valid(raise_exception=True)
    return instancia.validated_data


class EscenasView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def post(self, request, case_version_id):
        datos = _datos(CrearEscenaSerializer, request)
        return api_created(escenas.crear(request.user, case_version_id, datos, datos.get("revision")))


class EscenaView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def put(self, request, case_version_id, node_id):
        datos = _datos(EscenaSerializer, request)
        return api_ok(escenas.actualizar(request.user, case_version_id, node_id, datos, datos.get("revision")))

    def delete(self, request, case_version_id, node_id):
        datos = _datos(RevisionSerializer, request)
        escenas.borrar(request.user, case_version_id, node_id, datos.get("revision"))
        return api_ok()


class DecisionesView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def post(self, request, case_version_id):
        datos = _datos(CrearDecisionSerializer, request)
        return api_created(decisiones.crear(request.user, case_version_id, datos, datos.get("revision")))


class DecisionView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def put(self, request, case_version_id, decision_id):
        datos = _datos(DecisionSerializer, request)
        return api_ok(decisiones.actualizar(request.user, case_version_id, decision_id, datos, datos.get("revision")))

    def delete(self, request, case_version_id, decision_id):
        datos = _datos(RevisionSerializer, request)
        decisiones.borrar(request.user, case_version_id, decision_id, datos.get("revision"))
        return api_ok()


class ExportarCasoView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def get(self, request, case_version_id):
        from . import intercambio
        return api_ok(intercambio.exportar(request.user, case_version_id))


class ImportarCasoView(APIView):
    permission_classes = [policy_permission("case", "author")]

    def post(self, request):
        from . import intercambio
        from apps.users.permisos import exigir_autoria
        exigir_autoria(request.user)
        return api_created(servicios.resumen(intercambio.importar(request.user, request.data)))

class EditorView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(responses={200: envelope_of(VistaEditorSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        return api_ok(editor.editor(request.user, case_version_id))


class ChecklistView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(request=ChecklistSerializer, parameters=[OpenApiParameter("X-Case-Revision", int, OpenApiParameter.HEADER)], responses={200: envelope_of(VistaEditorSerializer), **error_responses(400, 401, 403, 404, 409)})
    def put(self, request, case_version_id):
        datos = dict(request.data)
        if datos.get("revision") in (None, ""):
            revision = request.query_params.get("revision") or request.headers.get("X-Case-Revision")
            if revision is not None:
                datos["revision"] = revision
        serializer = ChecklistSerializer(data=datos)
        serializer.is_valid(raise_exception=True)
        return api_ok(editor.actualizar_checklist(request.user, case_version_id, serializer.validated_data))


class PlanoView(APIView):
    permission_classes = [policy_permission("case", "author")]

    @extend_schema(responses={200: envelope_of(PlanoSerializer), **error_responses(401, 403, 404)})
    def get(self, request, case_version_id):
        version = editor.version_visible(request.user, case_version_id)
        return api_ok({"plan": plano.plano(version)})

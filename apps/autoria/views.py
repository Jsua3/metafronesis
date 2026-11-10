from rest_framework.views import APIView
from shared.permissions import policy_permission
from shared.response import api_created, api_ok
from . import decisiones, escenas, servicios
from .serializers import (CrearDecisionSerializer, CrearEscenaSerializer, CrearFichaSerializer,
                          DecisionSerializer, EscenaSerializer, FichaSerializer, RevisionSerializer)


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
        serializer = FichaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data
        return api_ok(servicios.actualizar_ficha(request.user, case_version_id, datos, datos.get("revision")))


def _datos(serializer, request):
    instancia = serializer(data=request.data)
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

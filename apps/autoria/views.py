from rest_framework.views import APIView
from shared.permissions import policy_permission
from shared.response import api_created, api_ok
from . import servicios
from .serializers import CrearFichaSerializer, FichaSerializer


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

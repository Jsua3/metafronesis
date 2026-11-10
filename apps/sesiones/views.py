from rest_framework.views import APIView
from shared.permissions import policy_permission
from shared.response import api_created, api_ok
from . import servicios
from .serializers import AgendaSerializer


class SesionesView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def get(self, request):
        return api_ok([servicios.dto(s) for s in servicios.propias(request.user)])

    def post(self, request):
        serializer = AgendaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sesion = servicios.agendar(request.user, serializer.validated_data)
        return api_created(servicios.dto(sesion), message="Si los correos corresponden a estudiantes registrados, se incluirán en la sesión.")


class SesionView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def get(self, request, pk):
        return api_ok(servicios.dto(servicios.obtener(request.user, pk)))


class IniciarView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def post(self, request, pk):
        return api_ok(servicios.dto(servicios.iniciar(request.user, pk)))


class FinalizarView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def post(self, request, pk):
        return api_ok(servicios.dto(servicios.finalizar(request.user, pk)))

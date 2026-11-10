from rest_framework.views import APIView
from shared.permissions import policy_permission
from shared.response import api_created, api_ok
from . import convocatorias, servicios, repeticion
from .serializers import AgendaSerializer, ConvocadosSerializer


class SesionesView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def get(self, request):
        return api_ok([servicios.dto(s) for s in servicios.propias(request.user)])

    def post(self, request):
        serializer = AgendaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sesion = servicios.agendar(request.user, serializer.validated_data)
        return api_created({**servicios.dto(sesion), "codigos": sesion.codigos_emitidos}, message="Si los correos corresponden a estudiantes registrados, se incluirán en la sesión.")


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


class ConvocadosView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def post(self, request, pk):
        serializer = ConvocadosSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codigos = convocatorias.agregar(request.user, pk, serializer.validated_data["emails"])
        return api_created({"codigos": codigos}, message="Si los correos corresponden a estudiantes registrados, se incluir?n en la sesi?n.")


class ConvocadoView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def delete(self, request, pk, estudiante_id):
        convocatorias.retirar(request.user, pk, estudiante_id)
        return api_ok(message="Convocatoria retirada")


class RepeticionView(APIView):
    permission_classes = [policy_permission("assignment", "manage")]

    def post(self, request, pk, estudiante_id):
        serializer = repeticion.MotivoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        autorizacion = repeticion.autorizar(request.user, pk, estudiante_id, serializer.validated_data["motivo"])
        return api_created({"id": autorizacion.pk})

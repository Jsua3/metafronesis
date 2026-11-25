from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_created, api_ok

from . import convocatorias, repeticion, servicios
from .consultas import obtener, propias
from .serializers import SesionSerializer

PERMISO = [policy_permission("assignment", "manage")]


class SesionesView(APIView):
    permission_classes = PERMISO

    def get(self, request):
        estados = [valor for valor in request.query_params.get("estado", "").split(",") if valor]
        return api_ok([servicios.dto(sesion) for sesion in propias(request.user, estados)])

    def post(self, request):
        serializer = SesionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sesion = servicios.crear(request.user, serializer.validated_data)
        return api_created(servicios.detalle_dto(obtener(request.user, sesion.pk)))


class CasosView(APIView):
    permission_classes = PERMISO

    def get(self, request):
        return api_ok(servicios.casos_dto(servicios.biblioteca()))


class SesionView(APIView):
    permission_classes = PERMISO

    def get(self, request, pk):
        return api_ok(servicios.detalle_dto(obtener(request.user, pk)))

    def patch(self, request, pk):
        serializer = SesionSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        servicios.editar(request.user, pk, serializer.validated_data)
        return api_ok(servicios.detalle_dto(obtener(request.user, pk)))


class TransicionView(APIView):
    permission_classes = PERMISO
    accion = None

    def post(self, request, pk):
        getattr(servicios, self.accion)(request.user, pk)
        return api_ok(servicios.detalle_dto(obtener(request.user, pk)))


class SincronizarView(APIView):
    permission_classes = PERMISO

    def post(self, request, pk):
        return api_ok({"agregados": convocatorias.sincronizar(request.user, pk)})


class ConvocadoView(APIView):
    permission_classes = PERMISO

    def delete(self, request, pk, estudiante_id):
        convocatorias.retirar(request.user, pk, estudiante_id)
        return api_ok(message="Convocatoria retirada")


class RepeticionView(APIView):
    permission_classes = PERMISO

    def post(self, request, pk, estudiante_id):
        serializer = repeticion.MotivoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        autorizacion = repeticion.autorizar(request.user, pk, estudiante_id, serializer.validated_data["motivo"])
        return api_created({"id": autorizacion.pk})

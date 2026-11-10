from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok

from .models import Notificacion
from . import servicios


class NotificacionesView(APIView):
    permission_classes = [policy_permission("account", "self")]

    def get(self, request):
        return api_ok([servicios.dto(aviso) for aviso in Notificacion.objects.filter(destinatario=request.user)])


class LeerView(APIView):
    permission_classes = [policy_permission("account", "self")]

    def post(self, request, pk):
        return api_ok(servicios.dto(servicios.marcar_leida(request.user, pk)))


class ReenviarView(APIView):
    permission_classes = [policy_permission("attempt", "review")]

    def post(self, request, pk):
        aviso = servicios.reenviar(request.user, pk)
        return api_ok({"id": aviso.pk, "correoEnviado": aviso.correo_enviado})

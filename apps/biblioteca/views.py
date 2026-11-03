from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from .services import lugares


class BibliotecaView(APIView):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if getattr(request.user, "role", None) not in ("ADMIN", "PROFESOR"):
            raise PermissionDenied()


class LugarListView(BibliotecaView):
    def get(self, request):
        return Response({"data": lugares.listar_lugares()})


class LugarDetailView(BibliotecaView):
    def get(self, request, lugar_id):
        return Response({"data": lugares.lugar_publico(lugares.cargar_lugar(lugar_id))})

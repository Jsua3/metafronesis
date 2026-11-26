from django.db.models import Exists, OuterRef
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.simulation.models.case import CaseCover, CaseVersion
from apps.simulation.services.portadas import FORMATOS
from shared.openapi import error_responses


class ImagenPortadaView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def perform_content_negotiation(self, request, force=False):
        # El éxito lo sirve Django con el MIME de la imagen. DRF solo renderiza los errores en JSON.
        renderer = self.get_renderers()[0]
        return renderer, renderer.media_type

    @extend_schema(responses={
        **{(200, mime): OpenApiTypes.BINARY for mime, _ in FORMATOS.values()},
        **error_responses(404),
    })
    def get(self, request, cover_id):
        referenciada = Exists(CaseVersion.objects.filter(cover_id=OuterRef("pk")))
        imagen = get_object_or_404(CaseCover.objects.filter(referenciada), pk=cover_id)
        mime, extension = FORMATOS[imagen.formato]
        return HttpResponse(bytes(imagen.contenido), content_type=mime, headers={
            "Content-Disposition": f'inline; filename="{imagen.pk}.{extension}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        })

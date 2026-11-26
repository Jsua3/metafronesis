"""Edición de la portada mediante las guardas y la revisión del borrador."""
from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import serializers
from rest_framework.parsers import MultiPartParser
from rest_framework.views import APIView

from apps.simulation.models.case import CaseCover
from apps.simulation.serializers.contracts import CaseConflictEnvelopeSerializer
from apps.simulation.serializers.portadas import PortadaSerializer
from apps.simulation.services.audit_service import auditable
from apps.simulation.services.portadas import crear_portada, datos_portada
from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok
from . import guardas
from .serializers import RevisionSerializer
from .views import CABECERA_REVISION, _datos


@extend_schema_field(OpenApiTypes.BINARY)
class ImagenPortadaField(serializers.FileField):
    pass


class CaseCoverUploadSerializer(RevisionSerializer):
    imagen = ImagenPortadaField(error_messages={
        "required": "Selecciona una imagen de portada.",
        "invalid": "Envía un archivo de imagen.",
        "empty": "El archivo de imagen está vacío.",
    })
    pixelArt = serializers.BooleanField(required=False, default=False)


class CaseCoverChangeSerializer(PortadaSerializer):
    revision = serializers.IntegerField()


def _cambiar(version, usuario, portada, pixel_art=False):
    anterior = version.cover_id
    version.cover = portada
    version.cover_pixel_art = pixel_art
    version.save(update_fields=["cover", "cover_pixel_art"])
    guardas.tocar(version, usuario)
    if anterior:
        # Serializa la liberación de una imagen compartida por dos borradores.
        imagen = CaseCover.objects.select_for_update().get(pk=anterior)
        if not imagen.versions.exists():
            imagen.delete()
    return {**datos_portada(version), "revision": version.version}


@auditable("CASE_COVER_UPDATED", "CASE_VERSION", resource_id_param_index=1)
@transaction.atomic
def subir(usuario, version_id, request):
    version = guardas.version_editable(usuario, version_id)
    datos = _datos(CaseCoverUploadSerializer, request)
    guardas.exigir_revision(version, datos.get("revision"))
    return _cambiar(version, usuario, crear_portada(datos["imagen"]), datos["pixelArt"])


@auditable("CASE_COVER_REMOVED", "CASE_VERSION", resource_id_param_index=1)
@transaction.atomic
def quitar(usuario, version_id, request):
    version = guardas.version_editable(usuario, version_id)
    datos = _datos(RevisionSerializer, request)
    guardas.exigir_revision(version, datos.get("revision"))
    return _cambiar(version, usuario, None)


_REVISION = OpenApiParameter(CABECERA_REVISION, int, OpenApiParameter.HEADER)
_RESPUESTAS = {
    200: envelope_of(CaseCoverChangeSerializer),
    409: CaseConflictEnvelopeSerializer,
    **error_responses(400, 401, 403, 404),
}


class PortadaView(APIView):
    permission_classes = [policy_permission("case", "author")]
    parser_classes = [MultiPartParser]

    @extend_schema(request=CaseCoverUploadSerializer, parameters=[_REVISION],
                   responses={**_RESPUESTAS, **error_responses(413, 415)})
    def put(self, request, case_version_id):
        return api_ok(subir(request.user, case_version_id, request))

    @extend_schema(parameters=[_REVISION], responses=_RESPUESTAS)
    def delete(self, request, case_version_id):
        return api_ok(quitar(request.user, case_version_id, request))

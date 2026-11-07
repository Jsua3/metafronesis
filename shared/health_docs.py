"""Documentación OpenAPI de ``GET /api/health`` (C11, E5-9 reparación).

La salud es una vista de Django puro a propósito (``shared.health``: pública y que no se caiga con la capa de la API),
así que ``drf-spectacular`` no la descubre. ``preprocess_canonical_api_endpoints`` añade al documento esta clase,
que nunca se enruta, para que la ruta aparezca con su forma verdadera y la pruebe ``test_openapi_matches_responses``.
"""
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from shared.openapi import envelope_of

HEALTH_STATUS = ("ok", "degraded")
HEALTH_DB = ("ok", "error")


class HealthSerializer(serializers.Serializer):
    """El estado mínimo del servicio. No devuelve nada interno: ni versiones ni el texto del error de la base."""

    status = serializers.ChoiceField(choices=HEALTH_STATUS)
    db = serializers.ChoiceField(choices=HEALTH_DB)


class HealthDocView(APIView):
    """Solo documenta ``GET /api/health``; la ruta real es ``shared.health.health`` (pública, sin permisos).

    Sin autenticación: el documento no le pone ``BearerAuth``. No declara ``permission_classes`` porque nunca se
    enruta y la regla ``allowany-solo-publicas`` reserva ese vacío a las vistas públicas de verdad.
    """

    authentication_classes: list = []

    @extend_schema(
        responses={
            200: envelope_of(HealthSerializer),
            503: OpenApiResponse(envelope_of(HealthSerializer), description="La base de datos no responde (sin el detalle)."),
        }
    )
    def get(self, request):  # pragma: no cover - nunca se enruta
        raise NotImplementedError("HealthDocView solo documenta la ruta de shared.health")

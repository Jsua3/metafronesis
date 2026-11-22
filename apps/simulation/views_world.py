"""Rutas de exploración espacial del intento propio."""

from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok
from .services import world
from .serializers.world_contract import EntradaSolicitud, MundoRespuesta, ProgresoMundo


RESPUESTA_POSICION = {
    "anyOf": [
        {"type": "object", "required": ["success", "data"], "properties": {
            "success": {"type": "boolean"},
            "data": {"type": "object", "required": ["attemptId", "status", "map", "player"],
                     "properties": {"attemptId": {"type": "string", "format": "uuid"},
                                    "status": {"type": "string"},
                                    "map": {"type": "object", "required": ["key"], "properties": {"key": {"type": "string"}}},
                                    "player": {"type": "object", "required": ["x", "y"],
                                               "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}}}}}}},
        {"$ref": "#/components/schemas/MundoRespuestaEnvelope"},
    ]
}

SOLICITUD_POSICION = {
    "type": "object", "required": ["playerX", "playerY", "currentMapKey"],
    "properties": {"playerX": {"type": "number"}, "playerY": {"type": "number"},
                   "currentMapKey": {"type": "string"}, "attemptToken": {}},
}


class Mundo(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(responses={200: envelope_of(MundoRespuesta), **error_responses(401, 403, 404)})
    def get(self, request, pk):
        return api_ok(world.leer(request.user, pk))


class MapaProgreso(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(responses={200: envelope_of(ProgresoMundo), **error_responses(401, 403, 404)})
    def get(self, request, pk):
        return api_ok(world.progreso(request.user, pk))


class PosicionMundo(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(request=SOLICITUD_POSICION, responses={200: RESPUESTA_POSICION, **error_responses(400, 401, 403, 404)})
    def patch(self, request, pk):
        if not isinstance(request.data, dict):
            raise ValidationError("El cuerpo debe ser un objeto JSON.")
        return api_ok(world.mover(request.user, pk, request.data))


class EntradaSala(APIView):
    permission_classes = [policy_permission("attempt", "play")]

    @extend_schema(request=EntradaSolicitud, responses={200: envelope_of(MundoRespuesta), **error_responses(400, 401, 403, 404)})
    def post(self, request, pk):
        if not isinstance(request.data, dict):
            raise ValidationError("El cuerpo debe ser un objeto JSON.")
        return api_ok(world.entrar(request.user, pk, request.data))

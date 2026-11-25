"""Rutas de la IA coautora (fase 1, SIEP-269): ``/api/authoring/coauthor…``. La lógica vive en ``coautorias``."""
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.views import APIView

from shared.openapi import envelope_of, error_responses
from shared.permissions import policy_permission
from shared.response import api_ok

from . import coautorias


class PreguntaSerializer(serializers.Serializer):
    numero = serializers.IntegerField()
    ambito = serializers.ChoiceField(choices=["historia", "personajes", "lugar", "evaluacion"])
    texto = serializers.CharField()
    porque = serializers.CharField()
    opciones = serializers.ListField(child=serializers.CharField())
    recomendada = serializers.IntegerField()


class RespuestaDadaSerializer(serializers.Serializer):
    """Una pregunta ya respondida, con sus opciones (para poder volver a ella y cambiar la respuesta)."""

    numero = serializers.IntegerField()
    ambito = serializers.CharField()
    pregunta = serializers.CharField()
    porque = serializers.CharField()
    opciones = serializers.ListField(child=serializers.CharField())
    recomendada = serializers.IntegerField()
    eleccion = serializers.JSONField(help_text="{tipo: opcion|propia|decide, indice?, texto?}")
    respuesta = serializers.CharField(help_text="La respuesta como se lee.")


class AcuerdoSerializer(serializers.Serializer):
    """Un acuerdo de coautoría: la conversación de preguntas y la ficha «Lo que acordamos»."""

    id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=["clarifying", "ready", "summarized", "accepted", "cancelled"])
    lugarId = serializers.CharField(allow_null=True)
    caseVersionId = serializers.IntegerField(allow_null=True)
    idea = serializers.CharField()
    respuestas = RespuestaDadaSerializer(many=True)
    pregunta = PreguntaSerializer(allow_null=True)
    topePreguntas = serializers.IntegerField()
    ficha = serializers.JSONField(allow_null=True)
    llamadasUsadas = serializers.IntegerField()
    llamadasTope = serializers.IntegerField()
    generationId = serializers.UUIDField(allow_null=True)
    ocupado = serializers.BooleanField()
    error = serializers.JSONField(required=False, help_text="Solo al iniciar, si la primera pregunta falló: {code, message}.")


class InicioSerializer(serializers.Serializer):
    idea = serializers.CharField(help_text="Entre 10 y 2000 caracteres, texto plano y sin datos personales.")
    lugarId = serializers.CharField(required=False, help_text="Para un caso nuevo: el lugar donde pasa.")
    caseVersionId = serializers.IntegerField(required=False, help_text="Para un caso que se edita: su versión en borrador.")


class EleccionSerializer(serializers.Serializer):
    tipo = serializers.ChoiceField(choices=["opcion", "propia", "decide"])
    indice = serializers.IntegerField(required=False)
    texto = serializers.CharField(required=False)


class RespuestaSerializer(serializers.Serializer):
    numero = serializers.IntegerField(help_text="La pregunta que se responde; una anterior cambia esa respuesta.")
    eleccion = EleccionSerializer()


class ResumenSerializer(serializers.Serializer):
    cambio = serializers.CharField(required=False, help_text="Lo que el docente quiere cambiar de la ficha.")


class FichaSerializer(serializers.Serializer):
    ficha = serializers.JSONField()


def _datos(request):
    return request.data if hasattr(request.data, "get") else {}


_ERRORES = error_responses(400, 401, 403, 404, 409, 422, 429, 502)


class CoautoriaBaseView(APIView):
    permission_classes = [policy_permission("case", "author")]


class IniciarCoautoriaView(CoautoriaBaseView):
    """``POST …/coauthor``: abre la conversación con la idea y trae la primera pregunta."""

    @extend_schema(request=InicioSerializer, responses={201: envelope_of(AcuerdoSerializer), **_ERRORES})
    def post(self, request):
        return api_ok(coautorias.iniciar(request.user, _datos(request)), http_status=201)


class CoautoriaView(CoautoriaBaseView):
    """``GET …/coauthor/{id}`` lee la conversación; ``DELETE`` la cancela."""

    @extend_schema(responses={200: envelope_of(AcuerdoSerializer), **error_responses(401, 403, 404)})
    def get(self, request, acuerdo_id):
        return api_ok(coautorias.leer(request.user, acuerdo_id))

    @extend_schema(responses={200: envelope_of(AcuerdoSerializer), **error_responses(401, 403, 404, 409)})
    def delete(self, request, acuerdo_id):
        return api_ok(coautorias.cancelar(request.user, acuerdo_id))


class PreguntaView(CoautoriaBaseView):
    """``POST …/question``: vuelve a pedir la pregunta pendiente tras una falla."""

    @extend_schema(request=None, responses={200: envelope_of(AcuerdoSerializer), **_ERRORES})
    def post(self, request, acuerdo_id):
        return api_ok(coautorias.pedir_pregunta(request.user, acuerdo_id))


class ResponderView(CoautoriaBaseView):
    """``POST …/answer``: responde una pregunta y trae la siguiente."""

    @extend_schema(request=RespuestaSerializer, responses={200: envelope_of(AcuerdoSerializer), **_ERRORES})
    def post(self, request, acuerdo_id):
        return api_ok(coautorias.responder(request.user, acuerdo_id, _datos(request)))


class SaltarView(CoautoriaBaseView):
    """``POST …/skip``: no más preguntas."""

    @extend_schema(request=None, responses={200: envelope_of(AcuerdoSerializer), **error_responses(401, 403, 404, 409)})
    def post(self, request, acuerdo_id):
        return api_ok(coautorias.saltar(request.user, acuerdo_id))


class ResumenView(CoautoriaBaseView):
    """``POST …/summary`` pide la ficha (con ``cambio``, la rehace); ``PUT`` guarda la ficha corregida a mano."""

    @extend_schema(request=ResumenSerializer, responses={200: envelope_of(AcuerdoSerializer), **_ERRORES})
    def post(self, request, acuerdo_id):
        return api_ok(coautorias.resumir(request.user, acuerdo_id, _datos(request)))

    @extend_schema(request=FichaSerializer, responses={200: envelope_of(AcuerdoSerializer), **error_responses(400, 401, 403, 404, 409)})
    def put(self, request, acuerdo_id):
        return api_ok(coautorias.corregir_ficha(request.user, acuerdo_id, _datos(request)))


class AceptarView(CoautoriaBaseView):
    """``POST …/accept``: ACEPTAR. En un caso nuevo arranca la generación con la ficha."""

    @extend_schema(request=None, responses={200: envelope_of(AcuerdoSerializer), **error_responses(400, 401, 403, 404, 409, 429)})
    def post(self, request, acuerdo_id):
        return api_ok(coautorias.aceptar(request.user, acuerdo_id))

"""Formas de las peticiones y respuestas de exploración."""

from rest_framework import serializers


class PosicionSolicitud(serializers.Serializer):
    playerX = serializers.FloatField()
    playerY = serializers.FloatField()
    currentMapKey = serializers.CharField()
    attemptToken = serializers.CharField(required=False, allow_blank=True)


class EntradaSolicitud(serializers.Serializer):
    targetNodeKey = serializers.CharField()
    doorKey = serializers.CharField()
    requestId = serializers.CharField(required=False, allow_blank=True)
    attemptToken = serializers.CharField(required=False, allow_blank=True)


class Posicion(serializers.Serializer):
    x = serializers.IntegerField()
    y = serializers.IntegerField()


class SalaAcuse(serializers.Serializer):
    key = serializers.CharField()


class AcuseMundo(serializers.Serializer):
    attemptId = serializers.UUIDField()
    status = serializers.CharField()
    map = SalaAcuse()
    player = Posicion()


class IdentidadTutor(serializers.Serializer):
    nombre = serializers.CharField(required=False)
    rol = serializers.CharField(required=False)
    recipeId = serializers.CharField(required=False)


class MundoRespuesta(serializers.Serializer):
    attemptId = serializers.UUIDField()
    status = serializers.CharField()
    map = serializers.DictField()
    tutorInicial = IdentidadTutor(required=False)
    player = Posicion()
    objects = serializers.ListField(child=serializers.DictField())
    collisions = serializers.ListField(child=serializers.DictField())
    tools = serializers.ListField(child=serializers.DictField())
    inventory = serializers.ListField(child=serializers.CharField())
    inspectedObjectKeys = serializers.ListField(child=serializers.CharField())
    viewedDialogueKeys = serializers.ListField(child=serializers.CharField())
    viewedNpcKeysHere = serializers.ListField(child=serializers.CharField())
    usedToolKeys = serializers.ListField(child=serializers.CharField())
    usedToolKeysHere = serializers.ListField(child=serializers.CharField())
    flags = serializers.DictField()
    decisionOptions = serializers.ListField(child=serializers.DictField())
    comments = serializers.ListField(child=serializers.DictField())
    layout = serializers.JSONField(allow_null=True)


class NodoProgreso(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    start = serializers.BooleanField()
    terminal = serializers.BooleanField()


class ProgresoMundo(serializers.Serializer):
    nodes = NodoProgreso(many=True)
    visitedNodeKeys = serializers.ListField(child=serializers.CharField())
    currentNodeKey = serializers.CharField()


class PistaMostrada(serializers.Serializer):
    id = serializers.IntegerField()
    order = serializers.IntegerField()
    text = serializers.CharField()


class PistasRespuesta(serializers.Serializer):
    available = serializers.IntegerField()
    shown = PistaMostrada(many=True)
    reason = serializers.CharField(required=False)


class SolicitudPista(serializers.Serializer):
    requestId = serializers.CharField(required=False, allow_blank=True)
    attemptToken = serializers.CharField(required=False, allow_blank=True)


class SolicitudHerramienta(serializers.Serializer):
    toolCode = serializers.CharField()
    targetInteractionKey = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    requestId = serializers.CharField(required=False, allow_blank=True)
    attemptToken = serializers.CharField(required=False, allow_blank=True)


class InteraccionRespuesta(serializers.Serializer):
    world = MundoRespuesta()
    interaction = serializers.DictField()
    dialogue = serializers.DictField(allow_null=True)
    preparedDecisionOptionId = serializers.IntegerField(allow_null=True)
    unlockedToolCode = serializers.CharField(allow_null=True)


class HerramientaRespuesta(serializers.Serializer):
    world = MundoRespuesta()
    toolCode = serializers.CharField()
    targetKey = serializers.CharField(allow_null=True)
    pertinent = serializers.BooleanField()
    feedbackMessage = serializers.CharField()
    alreadyUsed = serializers.BooleanField()

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


class MundoRespuesta(serializers.Serializer):
    attemptId = serializers.UUIDField()
    status = serializers.CharField()
    map = serializers.DictField()
    player = Posicion()
    objects = serializers.ListField(child=serializers.DictField())
    collisions = serializers.ListField(child=serializers.DictField())
    tools = serializers.ListField(child=serializers.DictField())
    inventory = serializers.ListField(child=serializers.CharField())
    inspectedObjectKeys = serializers.ListField(child=serializers.CharField())
    viewedDialogueKeys = serializers.ListField(child=serializers.CharField())
    usedToolKeys = serializers.ListField(child=serializers.CharField())
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

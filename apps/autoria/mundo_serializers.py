from rest_framework import serializers

from apps.simulation.models.world import MAP_OBJECT_TYPES
from shared.jsonutils import INT4_MAX, INT4_MIN


class RevisionMundoSerializer(serializers.Serializer):
    revision = serializers.IntegerField(required=False, allow_null=True, min_value=0)


class MapaSerializer(RevisionMundoSerializer):
    mapKey = serializers.CharField(max_length=120)
    title = serializers.CharField(max_length=255)
    nodeId = serializers.IntegerField(required=False)
    width = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    height = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    theme = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    spawnX = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    spawnY = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)


class ObjetoSerializer(RevisionMundoSerializer):
    objectKey = serializers.CharField(max_length=120)
    label = serializers.CharField(max_length=255)
    objectType = serializers.ChoiceField(choices=MAP_OBJECT_TYPES)
    x = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    y = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    width = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    height = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    colorHex = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    icon = serializers.CharField(max_length=80, required=False, allow_blank=True, allow_null=True)
    shortCode = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    collision = serializers.BooleanField(required=False)
    visible = serializers.BooleanField(required=False)
    interactionPrompt = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    interactionText = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    toolCode = serializers.CharField(max_length=80, required=False, allow_blank=True, allow_null=True)
    decisionOptionId = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    characterId = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)
    aiSuggested = serializers.BooleanField(required=False)


class PistaSerializer(RevisionMundoSerializer):
    text = serializers.CharField(max_length=280, trim_whitespace=False)
    hintOrder = serializers.IntegerField(required=False, allow_null=True, min_value=INT4_MIN, max_value=INT4_MAX)


class ZonaSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    key = serializers.CharField(max_length=120, allow_blank=True, required=False, default="")
    label = serializers.CharField(max_length=255, allow_blank=True, allow_null=True, required=False)
    x = serializers.IntegerField(required=False, default=0, min_value=INT4_MIN, max_value=INT4_MAX)
    y = serializers.IntegerField(required=False, default=0, min_value=INT4_MIN, max_value=INT4_MAX)
    width = serializers.IntegerField(required=False, default=1, min_value=INT4_MIN, max_value=INT4_MAX)
    height = serializers.IntegerField(required=False, default=1, min_value=INT4_MIN, max_value=INT4_MAX)


class GuardarMundoSerializer(RevisionMundoSerializer):
    dialogues = serializers.JSONField(required=False, allow_null=True)
    map = serializers.DictField(required=False)
    objects = serializers.ListField(child=serializers.DictField(), required=False)
    collisionZones = ZonaSerializer(many=True, required=False)


class DefinicionMundoSerializer(serializers.Serializer):
    schemaVersion = serializers.IntegerField()
    caseVersionId = serializers.IntegerField()
    revision = serializers.IntegerField()
    nodeId = serializers.IntegerField()
    map = serializers.DictField()
    objects = serializers.ListField(child=serializers.DictField())
    collisionZones = ZonaSerializer(many=True)
    dialogues = serializers.ListField(child=serializers.DictField())
    clinicalTools = serializers.ListField(child=serializers.DictField())
    safeExit = serializers.DictField()
    validation = serializers.DictField()
    availableDecisions = serializers.ListField(child=serializers.DictField())
    rooms = serializers.ListField(child=serializers.DictField())

from rest_framework import serializers

from apps.simulation.models.world import validar_codigo_herramienta
from shared.jsonutils import INT4_MAX, INT4_MIN
from .mundo_serializers import RevisionMundoSerializer


class LineaSerializer(serializers.Serializer):
    displayOrder = serializers.IntegerField(required=False, default=0, min_value=INT4_MIN, max_value=INT4_MAX)
    speakerName = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    text = serializers.CharField(required=False, allow_blank=True, default="")
    emotion = serializers.CharField(max_length=60, required=False, allow_blank=True, allow_null=True)
    aiSuggested = serializers.BooleanField(required=False)


class DialogoSerializer(RevisionMundoSerializer):
    treeKey = serializers.CharField(max_length=120)
    speakerName = serializers.CharField(max_length=255)
    portraitKey = serializers.CharField(max_length=120, required=False, allow_blank=True, allow_null=True)
    emotion = serializers.CharField(max_length=60, required=False, allow_blank=True, allow_null=True)
    mapObjectId = serializers.IntegerField(required=False, allow_null=True)
    lines = LineaSerializer(many=True, required=False, allow_null=True)


class HerramientaSerializer(RevisionMundoSerializer):
    toolCode = serializers.CharField(max_length=80, validators=[validar_codigo_herramienta])
    label = serializers.CharField(max_length=255)
    icon = serializers.CharField(max_length=80, required=False, allow_blank=True, allow_null=True)
    category = serializers.CharField(max_length=80, required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class PersonajeSerializer(RevisionMundoSerializer):
    characterKey = serializers.CharField(max_length=120)
    displayName = serializers.CharField(max_length=255)
    roleLabel = serializers.CharField(max_length=255, required=False, allow_blank=True)
    portraitKey = serializers.CharField(max_length=120, required=False, allow_blank=True)
    showInBrief = serializers.BooleanField(required=False)
    displayOrder = serializers.IntegerField(required=False, min_value=INT4_MIN, max_value=INT4_MAX)


class OrdenSerializer(RevisionMundoSerializer):
    order = serializers.ListField(child=serializers.IntegerField(min_value=1))

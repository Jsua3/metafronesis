"""Contratos de lectura disponibles para el estudiante."""
from rest_framework import serializers


class PortadaSerializer(serializers.Serializer):
    portada = serializers.CharField(allow_null=True, help_text="URL pública de la portada, relativa al sitio.")
    portadaPixelArt = serializers.BooleanField(help_text="Si la imagen se dibuja con escalado de pixel art.")


class CatalogoEstudianteSerializer(PortadaSerializer):
    case_version_id = serializers.IntegerField()
    case_id = serializers.IntegerField()
    title = serializers.CharField()
    completed = serializers.BooleanField()
    allowed = serializers.BooleanField()
    reason = serializers.CharField(
        allow_null=True, help_text="NOT_YET_OPEN, CLOSED o LOCKED_BY_SEQUENCE. Nulo si puede empezar.",
    )


class FichaSimulacionSerializer(PortadaSerializer):
    caseVersionId = serializers.IntegerField()
    code = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField(allow_null=True)
    narrativeContext = serializers.CharField(allow_null=True)
    learningObjectives = serializers.ListField(child=serializers.CharField())
    estimatedMinutes = serializers.IntegerField(allow_null=True)

from rest_framework import serializers


class FichaSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=80, required=False)
    title = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    narrativeContext = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    learningObjectives = serializers.ListField(child=serializers.CharField(), required=False)
    estimatedMinutes = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    revision = serializers.IntegerField(min_value=0, required=False, allow_null=True)


class CrearFichaSerializer(FichaSerializer):
    code = serializers.CharField(max_length=80)
    title = serializers.CharField(max_length=255)

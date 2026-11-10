from rest_framework import serializers


class AgendaSerializer(serializers.Serializer):
    caseVersionId = serializers.IntegerField(min_value=1)
    espacioAcademico = serializers.CharField(max_length=255)
    inicio = serializers.DateTimeField()
    fin = serializers.DateTimeField()
    tiempoMaximoMin = serializers.IntegerField(min_value=1)
    lugar = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    mensaje = serializers.CharField(required=False, allow_blank=True, default="")
    emails = serializers.ListField(child=serializers.EmailField(), required=False, default=list)

    def validate(self, datos):
        if datos["fin"] <= datos["inicio"]:
            raise serializers.ValidationError({"fin": "Debe ser posterior al inicio."})
        return datos

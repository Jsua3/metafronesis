from rest_framework import serializers


class SesionSerializer(serializers.Serializer):
    grupoId = serializers.IntegerField(min_value=1)
    caseVersionId = serializers.IntegerField(min_value=1)
    espacioAcademico = serializers.CharField(max_length=255)
    inicio = serializers.DateTimeField()
    fin = serializers.DateTimeField()
    tiempoMaximoMin = serializers.IntegerField(min_value=1)
    lugar = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    mensaje = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate(self, datos):
        if "inicio" in datos and "fin" in datos and datos["fin"] <= datos["inicio"]:
            raise serializers.ValidationError({"fin": "Debe ser posterior al inicio."})
        return datos

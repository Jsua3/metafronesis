from rest_framework import serializers

from apps.grupos.assignments import format_window_value, parse_window_value


class FechaBogotaField(serializers.Field):
    """Fecha ISO 8601 con o sin desfase, guardada naive en hora de Bogotá (igual que las asignaciones)."""

    default_error_messages = {"invalid": "Fecha inválida; usa ISO 8601, p. ej. 2026-10-20T08:00:00-05:00."}

    def to_internal_value(self, data):
        try:
            valor = parse_window_value(data)
        except (TypeError, ValueError, OverflowError):
            self.fail("invalid")
        if valor is None:
            self.fail("invalid")
        return valor

    def to_representation(self, value):
        return format_window_value(value)


class SesionSerializer(serializers.Serializer):
    grupoId = serializers.IntegerField(min_value=1)
    caseVersionId = serializers.IntegerField(min_value=1)
    inicio = FechaBogotaField()
    fin = FechaBogotaField()
    tiempoMaximoMin = serializers.IntegerField(min_value=1)
    lugar = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    mensaje = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate(self, datos):
        if "inicio" in datos and "fin" in datos and datos["fin"] <= datos["inicio"]:
            raise serializers.ValidationError({"fin": "Debe ser posterior al inicio."})
        return datos

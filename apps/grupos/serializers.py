from django.core.validators import RegexValidator
from rest_framework import serializers

from shared.plain_text import texto_visible_problem

#: Los largos de las columnas de ``grupos`` (S2-6b, SF-22): un campo más largo es un 400 con el campo, no un 500.
NOMBRE_MAX = 255
CODIGO_MAX = 50
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
CODIGO_FORMATO = RegexValidator(
    r"^[A-Za-z0-9_-]+$", message="Usa solo letras, números, guion y guion bajo, sin espacios."
)


def _nombre_de_grupo(value):
    """S2-6b · SF-23: el nombre sale en los correos de invitación, así que es texto plano de una línea. R1b: además,
    sin invisibles ni dominios. No es un nombre de persona: puede llevar cifras («Grupo 1A»)."""
    problema = texto_visible_problem(value, NOMBRE_MAX)
    if problema is not None:
        raise serializers.ValidationError(problema)
    return value.strip()


class CrearGrupoSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=NOMBRE_MAX)
    codigo = serializers.CharField(max_length=CODIGO_MAX, validators=[CODIGO_FORMATO])

    def validate_nombre(self, value):
        return _nombre_de_grupo(value)


class ActualizarGrupoSerializer(serializers.Serializer):
    nombre = serializers.CharField(required=False, max_length=NOMBRE_MAX)
    codigo = serializers.CharField(required=False, max_length=CODIGO_MAX, validators=[CODIGO_FORMATO])

    def validate_nombre(self, value):
        return _nombre_de_grupo(value)

    def validate(self, attrs):
        if "nombre" not in attrs and "codigo" not in attrs:
            raise serializers.ValidationError("Envía nombre o código para actualizar")
        return attrs


class AgregarEstudianteSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ImportarEstudiantesSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, value):
        name = (value.name or "").lower()
        if not name.endswith(".xlsx"):
            raise serializers.ValidationError("Carga un archivo .xlsx")
        return value


class AsignarCasoSerializer(serializers.Serializer):
    caseVersionId = serializers.IntegerField()


class AssignmentTargetSerializer(serializers.Serializer):
    """El destino de una asignación (C7): un grupo hoy, un estudiante después (decisión 5)."""

    type = serializers.ChoiceField(choices=["GROUP", "STUDENT"])
    groupId = serializers.IntegerField(required=False)
    studentId = serializers.IntegerField(required=False)

    def validate(self, attrs):
        needed = "groupId" if attrs["type"] == "GROUP" else "studentId"
        if needed not in attrs:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise serializers.ValidationError({needed: "Este campo es obligatorio para ese destino."})
        return attrs


class AssignmentCreateSerializer(serializers.Serializer):
    """``POST /api/assignments``: las fechas llegan como texto ISO 8601 y las valida el servicio."""

    caseVersionId = serializers.IntegerField()
    target = AssignmentTargetSerializer()
    opensAt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    closesAt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sortOrder = serializers.IntegerField(required=False)


class AssignmentUpdateSerializer(serializers.Serializer):
    """``PATCH /api/assignments/{id}``: solo lo que viene se toca; ``null`` borra una fecha."""

    opensAt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    closesAt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sortOrder = serializers.IntegerField(required=False)
    active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise serializers.ValidationError("Envía al menos un campo para actualizar la asignación.")
        return attrs

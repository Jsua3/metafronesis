"""Formas públicas de los informes de seguimiento."""

from rest_framework import serializers


class ClasesSerializer(serializers.Serializer):
    recommended = serializers.IntegerField()
    acceptable = serializers.IntegerField()
    risky = serializers.IntegerField()
    contraindicated = serializers.IntegerField()


class IntentoRecienteTableroSerializer(serializers.Serializer):
    id = serializers.CharField()
    attemptId = serializers.CharField()
    casoTitulo = serializers.CharField()
    estudiante = serializers.CharField(allow_blank=True)
    studentAlias = serializers.CharField()
    estado = serializers.CharField()


class TableroSerializer(serializers.Serializer):
    estudiantesActivos = serializers.IntegerField()
    simulacionesCompletadasHoy = serializers.IntegerField()
    simulacionesCompletadas = serializers.IntegerField()
    simulacionesEnProgreso = serializers.IntegerField()
    decisiones = ClasesSerializer()
    ultimosIntentos = IntentoRecienteTableroSerializer(many=True)
    intentosRecientes = IntentoRecienteTableroSerializer(many=True)


class HitoSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    decisive = serializers.BooleanField()
    cobertura = serializers.CharField(allow_null=True)
    porcentaje = serializers.IntegerField(required=False)


class EstudianteGrupoSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nombre = serializers.CharField(allow_blank=True)
    totalIntentos = serializers.IntegerField()
    intentosCompletados = serializers.IntegerField()
    intentosEnProgreso = serializers.IntegerField()
    intentosEnPausa = serializers.IntegerField()
    intentosSalidaSegura = serializers.IntegerField()
    clases = ClasesSerializer()
    hitosCumplidos = serializers.ListField(child=serializers.CharField(), allow_null=True)
    bitacorasRegistradas = serializers.IntegerField()
    rubricasAplicadas = serializers.IntegerField()
    estado = serializers.CharField()


class SimulacionGrupoSerializer(serializers.Serializer):
    totalIntentos = serializers.IntegerField()
    intentosCompletados = serializers.IntegerField()
    intentosEnProgreso = serializers.IntegerField()
    intentosEnPausa = serializers.IntegerField()
    intentosSalidaSegura = serializers.IntegerField()
    hitos = HitoSerializer(many=True)
    bitacorasRegistradas = serializers.IntegerField()
    rubricasAplicadas = serializers.IntegerField()
    estudiantes = EstudianteGrupoSerializer(many=True)


class ReporteGrupoSerializer(serializers.Serializer):
    grupoId = serializers.IntegerField()
    caseVersionId = serializers.IntegerField(allow_null=True)
    simulacion = SimulacionGrupoSerializer(allow_null=True)


class PersonaReporteSerializer(serializers.Serializer):
    ref = serializers.CharField()
    displayName = serializers.CharField(allow_blank=True)


class IntentoReporteSerializer(serializers.Serializer):
    attemptId = serializers.UUIDField()
    caseVersionId = serializers.IntegerField()
    caseTitle = serializers.CharField()
    status = serializers.CharField()
    startedAt = serializers.DateTimeField(allow_null=True)
    activeSeconds = serializers.IntegerField()
    clockSeconds = serializers.IntegerField(allow_null=True)
    ordinal = serializers.IntegerField()


class CoberturaSerializer(serializers.Serializer):
    shown = serializers.IntegerField()
    total = serializers.IntegerField()


class ReporteEstudianteSerializer(serializers.Serializer):
    student = PersonaReporteSerializer()
    attempts = IntentoReporteSerializer(many=True)
    coverage = CoberturaSerializer()

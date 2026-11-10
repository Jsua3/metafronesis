from django.conf import settings
from django.db import models


class EstadoSesion(models.TextChoices):
    SIN_INICIAR = "SIN_INICIAR"
    EN_CURSO = "EN_CURSO"
    FINALIZADA = "FINALIZADA"


class Sesion(models.Model):
    case_version = models.ForeignKey("simulation.CaseVersion", on_delete=models.PROTECT)
    espacio_academico = models.CharField(max_length=255)
    inicio = models.DateTimeField()
    fin = models.DateTimeField()
    tiempo_maximo_min = models.PositiveIntegerField()
    lugar = models.CharField(max_length=255, blank=True)
    mensaje = models.TextField(blank=True)
    estado = models.CharField(max_length=20, choices=EstadoSesion.choices, default=EstadoSesion.SIN_INICIAR)
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sesiones_creadas")


class EstadoConvocatoria(models.TextChoices):
    ACTIVA = "ACTIVA"
    RETIRADA = "RETIRADA"


class Convocatoria(models.Model):
    sesion = models.ForeignKey(Sesion, on_delete=models.CASCADE, related_name="convocatorias")
    estudiante = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="convocatorias")
    codigo_hash = models.CharField(max_length=255)
    estado = models.CharField(max_length=20, choices=EstadoConvocatoria.choices, default=EstadoConvocatoria.ACTIVA)
    creada_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["sesion", "estudiante"], name="sesion_estudiante_unico")]

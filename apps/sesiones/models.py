from django.conf import settings
from django.db import models


class EstadoSesion(models.TextChoices):
    PROGRAMADA = "PROGRAMADA"
    EN_CURSO = "EN_CURSO"
    PAUSADA = "PAUSADA"
    FINALIZADA = "FINALIZADA"
    CANCELADA = "CANCELADA"


#: Sesiones que todavía atan a sus convocados (las terminadas ya no).
NO_TERMINADAS = (EstadoSesion.PROGRAMADA, EstadoSesion.EN_CURSO, EstadoSesion.PAUSADA)
#: Sesiones con el caso habilitado a sus convocados.
ACTIVAS = (EstadoSesion.EN_CURSO, EstadoSesion.PAUSADA)


class Sesion(models.Model):
    """Una clase: un grupo, un caso de la biblioteca y un horario. Su comportamiento lo decide su estado
    (patrón State, ``estados.py``): esta clase es el contexto y solo le delega."""

    case_version = models.ForeignKey("simulation.CaseVersion", on_delete=models.PROTECT)
    # ``null`` solo por las sesiones anteriores a los grupos; la API lo exige.
    grupo = models.ForeignKey("grupos.Grupo", on_delete=models.PROTECT, null=True, blank=True, related_name="sesiones")
    espacio_academico = models.CharField(max_length=255)
    inicio = models.DateTimeField()
    fin = models.DateTimeField()
    tiempo_maximo_min = models.PositiveIntegerField()
    lugar = models.CharField(max_length=255, blank=True)
    mensaje = models.TextField(blank=True)
    estado = models.CharField(max_length=20, choices=EstadoSesion.choices, default=EstadoSesion.PROGRAMADA)
    iniciada_en = models.DateTimeField(null=True, blank=True)
    finalizada_en = models.DateTimeField(null=True, blank=True)
    cancelada_en = models.DateTimeField(null=True, blank=True)
    creada_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sesiones_creadas")

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(estado__in=EstadoSesion.values), name="sesion_estado_check"),
        ]

    def estado_actual(self):
        """El objeto de estado (patrón State) que decide qué puede hacer la sesión ahora."""
        from .estados import ESTADOS

        return ESTADOS[self.estado]


class EstadoConvocatoria(models.TextChoices):
    ACTIVA = "ACTIVA"
    RETIRADA = "RETIRADA"


class Convocatoria(models.Model):
    sesion = models.ForeignKey(Sesion, on_delete=models.CASCADE, related_name="convocatorias")
    estudiante = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="convocatorias")
    codigo_hash = models.CharField(max_length=255, blank=True, default="")
    estado = models.CharField(max_length=20, choices=EstadoConvocatoria.choices, default=EstadoConvocatoria.ACTIVA)
    creada_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["sesion", "estudiante"], name="sesion_estudiante_unico")]


class AutorizacionRepeticion(models.Model):
    convocatoria = models.ForeignKey(Convocatoria, on_delete=models.CASCADE, related_name="autorizaciones")
    autorizada_por = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    motivo = models.TextField()
    usada = models.BooleanField(default=False)
    creada_en = models.DateTimeField(auto_now_add=True)

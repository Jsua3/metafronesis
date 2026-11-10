from django.conf import settings
from django.utils import timezone

from apps.simulation.models import SimulationAttempt
from apps.simulation.models.attempt import OPEN_ATTEMPT_STATUSES
from shared.exceptions import ApiError
from .models import AutorizacionRepeticion, Convocatoria, EstadoConvocatoria, EstadoSesion


def verificar(estudiante, version):
    convocatorias = Convocatoria.objects.select_related("sesion").filter(estudiante=estudiante, sesion__case_version=version)
    if not convocatorias.exists():
        return
    ahora = timezone.now()
    vigente = convocatorias.filter(estado=EstadoConvocatoria.ACTIVA, sesion__estado=EstadoSesion.EN_CURSO, sesion__inicio__lte=ahora, sesion__fin__gt=ahora).order_by("sesion__inicio").first()
    if vigente is None:
        raise ApiError("SESSION_NOT_AVAILABLE", "La sesión no está disponible.", 409)
    sesion = vigente.sesion
    fraccion = getattr(settings, "SIEP_INGRESO_TARDIO_FRACCION", 0.5)
    if ahora > sesion.inicio + (sesion.fin - sesion.inicio) * fraccion:
        raise ApiError("LATE_ENTRY", "El plazo de ingreso ha terminado.", 409)
    intentos = SimulationAttempt.objects.filter(student=estudiante, case_version=version, started_at__gte=sesion.inicio, started_at__lt=sesion.fin)
    if intentos.exists() and not intentos.filter(status__in=OPEN_ATTEMPT_STATUSES).exists():
        autorizacion = AutorizacionRepeticion.objects.select_for_update().filter(convocatoria=vigente, usada=False).order_by("pk").first()
        if autorizacion is None:
            raise ApiError("SESSION_ALREADY_PARTICIPATED", "Ya existe una participación en la sesión.", 409)
        autorizacion.usada = True
        autorizacion.save(update_fields=["usada"])


def limite(intento):
    fecha = intento.started_at or timezone.now()
    convocatoria = Convocatoria.objects.filter(estudiante=intento.student, sesion__case_version=intento.case_version, sesion__inicio__lte=fecha, sesion__fin__gt=fecha).select_related("sesion").order_by("sesion__inicio").first()
    return convocatoria.sesion.tiempo_maximo_min if convocatoria else None

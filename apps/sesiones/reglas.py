"""Reglas de la sesión que el simulador consulta al empezar o reanudar un intento (``reglas_de_inicio``) y al medir
su tiempo máximo (``limites``). Quién entra lo decide el estado de la sesión (``verificar_ingreso``)."""
from django.conf import settings
from django.utils import timezone

from apps.simulation.models import SimulationAttempt
from apps.simulation.models.attempt import OPEN_ATTEMPT_STATUSES
from shared.exceptions import ApiError

from .models import ACTIVAS, AutorizacionRepeticion, Convocatoria, EstadoConvocatoria, EstadoSesion


def _convocatoria_vigente(estudiante, version):
    """La convocatoria que manda: primero la de una sesión activa; si no, la próxima programada. Las sesiones
    terminadas ya no atan al estudiante."""
    base = Convocatoria.objects.select_related("sesion").filter(
        estudiante=estudiante, estado=EstadoConvocatoria.ACTIVA, sesion__case_version=version,
    )
    return (
        base.filter(sesion__estado__in=ACTIVAS).order_by("-sesion__iniciada_en", "-sesion__pk").first()
        or base.filter(sesion__estado=EstadoSesion.PROGRAMADA).order_by("sesion__inicio", "sesion__pk").first()
    )


def verificar(estudiante, version):
    convocatoria = _convocatoria_vigente(estudiante, version)
    if convocatoria is None:
        return
    sesion = convocatoria.sesion
    sesion.estado_actual().verificar_ingreso()
    intentos = SimulationAttempt.objects.filter(student=estudiante, case_version=version, started_at__gte=sesion.iniciada_en)
    if intentos.filter(status__in=OPEN_ATTEMPT_STATUSES).exists():
        return  # vuelve a su intento abierto: el plazo de ingreso ya no aplica
    fraccion = getattr(settings, "SIEP_INGRESO_TARDIO_FRACCION", 0.5)
    if timezone.now() > sesion.iniciada_en + (sesion.fin - sesion.iniciada_en) * fraccion:
        raise ApiError("LATE_ENTRY", "El plazo de ingreso ha terminado.", 409)
    if intentos.exists():
        autorizacion = (
            AutorizacionRepeticion.objects.select_for_update()
            .filter(convocatoria=convocatoria, usada=False).order_by("pk").first()
        )
        if autorizacion is None:
            raise ApiError("SESSION_ALREADY_PARTICIPATED", "Ya existe una participación en la sesión.", 409)
        autorizacion.usada = True
        autorizacion.save(update_fields=["usada"])


def limite(intento):
    fecha = intento.started_at or timezone.now()
    convocatoria = (
        Convocatoria.objects.filter(
            estudiante=intento.student, sesion__case_version=intento.case_version,
            sesion__iniciada_en__lte=fecha, sesion__fin__gt=fecha,
        ).select_related("sesion").order_by("-sesion__iniciada_en").first()
    )
    return convocatoria.sesion.tiempo_maximo_min if convocatoria else None

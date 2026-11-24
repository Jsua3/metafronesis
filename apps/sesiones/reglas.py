"""Reglas de la sesión que el simulador consulta al empezar o reanudar un intento (``reglas_de_inicio``) y al medir
su tiempo máximo (``limites``). Quién entra lo decide el estado de la sesión (``verificar_ingreso``)."""
from django.conf import settings
from django.db import connection
from django.utils import timezone

from apps.simulation.models import SimulationAttempt
from apps.simulation.models.attempt import OPEN_ATTEMPT_STATUSES
from shared.exceptions import ApiError

from .models import ACTIVAS, AutorizacionRepeticion, Convocatoria, EstadoConvocatoria, EstadoSesion, Sesion


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


def _bloquear_sesion(sesion_id):
    """Cerrojo compartido (``FOR SHARE``) de la fila de la sesión hasta el fin de la transacción.

    Choca con el ``FOR UPDATE`` de las transiciones y de la gestión de convocados (``consultas.obtener``): si el
    docente está pausando o finalizando, el estudiante espera y, al despertar, lee el estado ya confirmado; mientras
    el estudiante lo tenga, el docente espera a que su inicio o reanudación confirme, y entonces los efectos ven ese
    intento. Entre estudiantes no choca: entrar a la vez no se serializa. Django no ofrece ``FOR SHARE``."""
    if connection.vendor != "postgresql":
        Sesion.objects.select_for_update().filter(pk=sesion_id).values_list("pk", flat=True).first()
        return
    tabla, columna = (connection.ops.quote_name(n) for n in (Sesion._meta.db_table, Sesion._meta.pk.column))
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT 1 FROM {tabla} WHERE {columna} = %s FOR SHARE", [sesion_id])


def _convocatoria_bloqueada(estudiante, version):
    """La convocatoria vigente leída DESPUÉS de bloquear su sesión. Si mientras esperábamos la sesión cambió (p. ej.
    terminó o retiraron al estudiante), la vigente puede ser otra: se bloquea esa y se vuelve a leer. Cada vuelta
    bloquea una sesión nueva, así que termina."""
    bloqueadas = set()
    convocatoria = _convocatoria_vigente(estudiante, version)
    while convocatoria is not None and convocatoria.sesion_id not in bloqueadas:
        _bloquear_sesion(convocatoria.sesion_id)
        bloqueadas.add(convocatoria.sesion_id)
        convocatoria = _convocatoria_vigente(estudiante, version)
    return convocatoria


def verificar(estudiante, version):
    """Se llama dentro de la transacción del inicio o la reanudación y ANTES de tomar el cerrojo del intento: el orden
    es sesión → intento, el mismo de los efectos de la sesión (``efectos.pausar_intentos`` / ``cerrar_intentos``)."""
    convocatoria = _convocatoria_bloqueada(estudiante, version)
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

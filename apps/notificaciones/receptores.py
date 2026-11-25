from django.conf import settings
from django.dispatch import receiver

from shared.eventos import convocados_cambiaron, intento_calificado, retroalimentacion_registrada, sesion_cancelada

from .servicios import crear


def _fecha(sesion):
    return sesion.inicio.strftime("%d/%m/%Y %H:%M")


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
def _convocar(sesion, estudiante):
    lineas = [
        f"Caso: {sesion.case_version.simulation_case.title}",
        f"Espacio académico: {sesion.espacio_academico}",
        f"Fecha: {_fecha(sesion)}",
    ]
    if sesion.lugar:
        lineas.append(f"Lugar: {sesion.lugar}")
    if sesion.mensaje:
        lineas.append(sesion.mensaje)
    lineas.append(f"Entra con tu cuenta en {getattr(settings, 'SIEP_PUBLIC_URL', '')}")
    crear(estudiante, sesion.creada_por, "CONVOCATORIA", "Convocatoria a una sesión", "\n".join(lineas))


@receiver(convocados_cambiaron, dispatch_uid="notificaciones.convocados")
def al_cambiar_convocados(sender, sesion, agregados, retirados, **kwargs):
    for estudiante in agregados:
        _convocar(sesion, estudiante)
    for estudiante in retirados:
        crear(estudiante, sesion.creada_por, "RETIRO", "Convocatoria retirada", "Has sido retirado de la sesión.")


@receiver(sesion_cancelada, dispatch_uid="notificaciones.sesion_cancelada")
def al_cancelar(sender, sesion, estudiantes, **kwargs):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    cuerpo = f"La sesión de «{sesion.case_version.simulation_case.title}» del {_fecha(sesion)} fue cancelada."
    for estudiante in estudiantes:
        crear(estudiante, sesion.creada_por, "CANCELACION", "Sesión cancelada", cuerpo)


@receiver(intento_calificado, dispatch_uid="notificaciones.calificacion")
def al_calificar(sender, intento, evaluacion, **kwargs):
    crear(intento.student, intento.case_version.simulation_case.created_by, "CALIFICACION",
          "Calificación disponible", "Tu calificación ya está disponible.")


@receiver(retroalimentacion_registrada, dispatch_uid="notificaciones.retroalimentacion")
def al_retroalimentar(sender, intento, docente, **kwargs):
    crear(intento.student, docente, "RETROALIMENTACION", "Retroalimentación disponible",
          "Tu docente registró una retroalimentación.")

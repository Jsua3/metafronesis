from django.conf import settings
from django.dispatch import receiver

from shared.eventos import convocatoria_emitida, convocados_cambiaron, intento_calificado, retroalimentacion_registrada

from .servicios import crear


def _convocar(sesion, estudiante, codigo):
    caso = sesion.case_version.simulation_case.title
    url = getattr(settings, "SIEP_PUBLIC_URL", "")
    cuerpo = f"Caso: {caso}\n{sesion.mensaje}\nAcceso: {url}\nCódigo: {codigo}"
    crear(estudiante, sesion.creada_por, "CONVOCATORIA", "Convocatoria a una sesión", cuerpo)


@receiver(convocatoria_emitida, dispatch_uid="notificaciones.convocatoria")
def al_convocar(sender, sesion, convocatorias, codigos, **kwargs):
    for convocatoria in convocatorias:
        estudiante = convocatoria.estudiante
        _convocar(sesion, estudiante, codigos[estudiante.pk])


@receiver(convocados_cambiaron, dispatch_uid="notificaciones.convocados")
def al_cambiar_convocados(sender, sesion, agregados, retirados, codigos, **kwargs):
    for estudiante in agregados:
        _convocar(sesion, estudiante, codigos[estudiante.pk])
    for estudiante in retirados:
        crear(estudiante, sesion.creada_por, "RETIRO", "Convocatoria retirada", "Has sido retirado de la sesión.")


@receiver(intento_calificado, dispatch_uid="notificaciones.calificacion")
def al_calificar(sender, intento, evaluacion, **kwargs):
    crear(intento.student, intento.case_version.simulation_case.created_by, "CALIFICACION",
          "Calificación disponible", "Tu calificación ya está disponible.")


@receiver(retroalimentacion_registrada, dispatch_uid="notificaciones.retroalimentacion")
def al_retroalimentar(sender, intento, docente, **kwargs):
    crear(intento.student, docente, "RETROALIMENTACION", "Retroalimentación disponible",
          "Tu docente registró una retroalimentación.")

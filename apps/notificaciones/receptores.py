from django.conf import settings
from django.dispatch import receiver

from shared.eventos import convocados_cambiaron, retroalimentacion_registrada, sesion_cancelada, sesion_por_comenzar

from .servicios import crear, crear_varios


def _enlace(ruta):
    return f"{(getattr(settings, 'SIEP_PUBLIC_URL', '') or '').strip().rstrip('/')}{ruta}"


def _fecha(sesion):
    return sesion.inicio.strftime("%d/%m/%Y %H:%M")


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
def _convocar(sesion, estudiantes):
    lineas = [
        f"Caso: {sesion.case_version.simulation_case.title}",
        f"Fecha: {_fecha(sesion)}",
    ]
    if sesion.lugar:
        lineas.append(f"Lugar: {sesion.lugar}")
    if sesion.mensaje:
        lineas.append(sesion.mensaje)
    lineas.append(f"Entra con tu cuenta y busca el caso en tu página de Casos: {_enlace('/portal/simulador')}")
    crear_varios(estudiantes, sesion.creada_por, "CONVOCATORIA", "Convocatoria a una sesión", "\n".join(lineas))


@receiver(convocados_cambiaron, dispatch_uid="notificaciones.convocados")
def al_cambiar_convocados(sender, sesion, agregados, retirados, **kwargs):
    if agregados:
        _convocar(sesion, agregados)
    crear_varios(retirados, sesion.creada_por, "RETIRO", "Convocatoria retirada", "Has sido retirado de la sesión.")


@receiver(sesion_cancelada, dispatch_uid="notificaciones.sesion_cancelada")
def al_cancelar(sender, sesion, estudiantes, **kwargs):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    cuerpo = f"La sesión de «{sesion.case_version.simulation_case.title}» del {_fecha(sesion)} fue cancelada."
    crear_varios(estudiantes, sesion.creada_por, "CANCELACION", "Sesión cancelada", cuerpo)


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
@receiver(sesion_por_comenzar, dispatch_uid="notificaciones.sesion_por_comenzar")
def al_por_comenzar(sender, sesion, estudiantes, **kwargs):
    lineas = [f"Tu sesión de «{sesion.case_version.simulation_case.title}» empieza el {_fecha(sesion)}."]
    if sesion.lugar:
        lineas.append(f"Lugar: {sesion.lugar}")
    lineas.append(f"Entra con tu cuenta en tu página de Casos: {_enlace('/portal/simulador')}")
    crear_varios(estudiantes, sesion.creada_por, "RECORDATORIO", "Tu sesión empieza pronto", "\n".join(lineas))


# La calificación automática del sistema no avisa por sí sola: el aviso sale cuando el docente registra su retroalimentación.
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
@receiver(retroalimentacion_registrada, dispatch_uid="notificaciones.retroalimentacion")
def al_retroalimentar(sender, intento, docente, **kwargs):
    enlace = _enlace(f"/portal/simulador/{intento.case_version_id}/cierre/{intento.pk}")
    crear(intento.student, docente, "RETROALIMENTACION", "Tu calificación y retroalimentación están disponibles",
          f"Tu docente registró su retroalimentación. Consulta tu calificación y sus comentarios aquí: {enlace}")

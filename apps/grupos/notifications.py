"""Avisos por correo de los grupos (E2-12, DJA-3).

Un aviso es **mejor esfuerzo**: un servidor de correo caído no rompe la operación (queda en el
aviso y en el registro). Y nunca revela nada: quien invita recibe la misma respuesta haya o no cuenta.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _cuerpo(grupo, teacher):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return (
        f"{teacher.nombre} {teacher.apellido} te invitó a su grupo «{grupo.nombre}» en SIEP.\n"
        "Para unirte, entra a SIEP y acepta la invitación; hasta entonces no verá tu actividad.\n"
        "Si no esperabas esta invitación, puedes rechazarla desde la misma pantalla.\n"
    )


def notify_invitations(students, grupo, teacher, limit=None):
    """Avisa a cada estudiante de ``students`` (hasta ``limit``, por defecto ``INVITATION_EMAIL_LIMIT``) que ``teacher``
    lo invitó a ``grupo``: queda un aviso en SIEP y sale su correo por una sola conexión. Devuelve cuántos correos
    salieron.

    Se llama FUERA de la transacción de la orden: un servidor de correo caído no la rompe (cada fallo queda en el aviso
    y en el registro del servidor).
    """
    from apps.notificaciones.servicios import crear_varios

    limit = settings.INVITATION_EMAIL_LIMIT if limit is None else limit
    elegidos = list(students)[: max(limit, 0)]
    try:
        avisos = crear_varios(elegidos, teacher, "INVITACION_GRUPO", f"[SIEP] Te invitaron al grupo {grupo.nombre}",
                              _cuerpo(grupo, teacher))
    except Exception:  # noqa: BLE001  (un aviso que no se guarda no debe romper la orden)
        logger.exception("No se pudieron registrar los avisos de invitación al grupo %s", grupo.id)
        return 0
    return sum(1 for aviso in avisos if aviso.correo_enviado)


def notify_invitation(student, grupo, teacher):
    """Avisa a UN estudiante (la invitación individual por correo)."""
    return notify_invitations([student], grupo, teacher)

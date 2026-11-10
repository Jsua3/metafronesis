"""Avisos por correo de los grupos (E2-12, DJA-3).

Un aviso es **mejor esfuerzo**: un servidor de correo caído no rompe la operación (queda en el
registro). Y nunca revela nada: quien invita recibe la misma respuesta haya o no cuenta.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _send_invitation(student, grupo, teacher):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    subject = f"[SIEP] Te invitaron al grupo {grupo.nombre}"
    body = (
        f"Hola {student.nombre},\n\n"
        f"{teacher.nombre} {teacher.apellido} te invitó a su grupo «{grupo.nombre}» en SIEP.\n"
        "Para unirte, entra a SIEP y acepta la invitación; hasta entonces no verá tu actividad.\n"
        "Si no esperabas esta invitación, puedes rechazarla desde la misma pantalla.\n"
    )
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [student.email], fail_silently=False)


def notify_invitations(students, grupo, teacher, limit=None):
    """Avisa a cada estudiante de ``students`` (hasta ``limit``, por defecto
    ``INVITATION_EMAIL_LIMIT``) que ``teacher`` lo invitó a ``grupo``. Devuelve cuántos salieron.

    Se llama FUERA de la transacción de la orden. Al primer fallo se corta: un servidor de correo
    caído no se vuelve a intentar con cada persona (eso sería un tiempo de espera por cada una).
    """
    limit = settings.INVITATION_EMAIL_LIMIT if limit is None else limit
    sent = 0
    for student in list(students)[: max(limit, 0)]:
        try:
            _send_invitation(student, grupo, teacher)
        except Exception:  # noqa: BLE001  (un servidor de correo caído no debe romper la orden)
            logger.exception("No se pudo enviar el aviso de invitación al usuario %s", student.id)
            break
        sent += 1
    return sent


def notify_invitation(student, grupo, teacher):
    """Avisa a UN estudiante (la invitación individual por correo)."""
    return notify_invitations([student], grupo, teacher)

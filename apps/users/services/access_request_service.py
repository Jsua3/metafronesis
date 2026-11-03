"""Solicitudes de acceso públicas: persistencia + notificación al administrador."""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.security.limiter import hit, key_hash
from apps.users.models import AccessRequest, AccessRequestStatus
from apps.users.serializers import normalize_email_value
from shared.background import run_in_background

from . import audit_events

User = get_user_model()
logger = logging.getLogger(__name__)

ASUNTO_AVISO = "[SIEP] Nueva solicitud de acceso"


def _texto_aviso(request: AccessRequest, pendientes: int) -> str:
    # BORRADOR: texto nuevo del aviso al administrador, pendiente de la aprobación de Psicología.
    # El nombre va marcado como sin verificar: lo escribió quien pidió el acceso, no el sistema.
    return (
        "Se registró una nueva solicitud de acceso en SIEP.\n\n"
        f"Solicitudes pendientes en total: {pendientes}\n"
        f'Nombre indicado (sin verificar): "{request.nombre} {request.apellido}"\n'
        f"Correo: {request.email}\n"
        f"Fecha: {request.created_at:%Y-%m-%d %H:%M}\n"
        f"ID solicitud: {request.id}\n\n"
        "Revisa el panel de administracion en Usuarios > Solicitudes pendientes."
    )


def _send_admin_notice(request_id, subject, body, recipients):
    """Corre en un hilo aparte: no toca la base (el texto ya viene calculado). Un fallo se registra con el id de
    la solicitud y sin datos personales (S1-3)."""
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=False)
    except Exception:
        logger.exception(
            "No se pudo enviar el aviso al administrador (solicitud %s); la solicitud quedó guardada.", request_id
        )


def _programar_aviso(request: AccessRequest) -> None:
    """Programa el aviso para cuando se confirme la transacción; solo si esta solicitud abre una ventana (S1-3)."""
    recipients = [email.strip() for email in settings.ACCESS_REQUEST_NOTIFY_EMAILS if email.strip()]
    if not recipients:
        logger.warning("ACCESS_REQUEST_NOTIFY_EMAILS vacío; no se envió correo para solicitud %s", request.id)
        return
    # Un aviso por ventana FIJA de 10 minutos (``LIMITS['access_request_notice']``): solo la primera solicitud de cada
    # ventana avisa. Una ventana deslizante dejaba sin aviso para siempre a quien recibiera una solicitud cada
    # menos de 10 minutos. Con el limitador apagado ``hit`` devuelve 0 y todas avisan.
    if hit("access_request_notice", key_hash("aviso")) > 1:
        return
    # El conteo y el texto se leen aquí, antes de que el hilo arranque: el hilo no toca la base.
    request_id = request.id
    pendientes = AccessRequest.objects.filter(status=AccessRequestStatus.PENDING).count()
    body = _texto_aviso(request, pendientes)
    transaction.on_commit(
        lambda: run_in_background(_send_admin_notice, request_id, ASUNTO_AVISO, body, recipients)
    )


def create_access_request(*, nombre, apellido, email):
    """Guarda la solicitud y avisa al administrador. Devuelve ``None`` sin crear nada si el correo ya tiene cuenta o
    una solicitud pendiente: la vista responde igual en ambos casos, así no se revela qué correos existen (S1-3)."""
    email = normalize_email_value(email)
    if User.objects.filter(email=email).exists():
        return None
    if AccessRequest.objects.filter(email=email, status=AccessRequestStatus.PENDING).exists():
        return None

    request = AccessRequest.objects.create(
        nombre=nombre.strip(),
        apellido=apellido.strip(),
        email=email,
    )

    audit_events.access_request_created(request)  # S4-1 · solo si se guardó: el campo trampa y los duplicados no llegan aquí
    _programar_aviso(request)
    return request


def list_access_requests(*, status=None):
    qs = AccessRequest.objects.all()
    if status:
        qs = qs.filter(status=status)
    return qs


def update_access_request_status(request_id, *, status):
    if status not in AccessRequestStatus.values:
        raise ValidationError("Estado de solicitud inválido.")

    request = AccessRequest.objects.filter(pk=request_id).first()
    if request is None:
        raise ValidationError("La solicitud no existe.")

    request.status = status
    request.reviewed_at = timezone.now()
    request.save(update_fields=["status", "reviewed_at"])
    audit_events.access_request_resolved(request)  # S4-1
    return request


def resolve_pending_for_email(email):
    """Resuelve (``REVIEWED``) las solicitudes pendientes de ese correo, p. ej. al crear su cuenta. Cada una deja su fila
    ``solicitud.resolver`` (S4-1): es un cambio del ADMIN aunque no lo haya pedido por la ruta de solicitudes."""
    email = normalize_email_value(email)
    pendientes = list(AccessRequest.objects.filter(email=email, status=AccessRequestStatus.PENDING))
    if not pendientes:
        return
    AccessRequest.objects.filter(pk__in=[solicitud.pk for solicitud in pendientes]).update(
        status=AccessRequestStatus.REVIEWED,
        reviewed_at=timezone.now(),
    )
    for solicitud in pendientes:
        solicitud.status = AccessRequestStatus.REVIEWED
        audit_events.access_request_resolved(solicitud)

"""Recuperar la contraseña olvidada con un enlace de un solo uso por correo.

1. ``request_password_reset(email)``: si el correo es de una cuenta activa, le manda un enlace
   ``<SIEP_PUBLIC_URL>/restablecer-contrasena?uid=…&token=…``. Exista o no la cuenta, la vista responde igual: así no
   se revela qué correos tienen cuenta (como la solicitud de acceso, S1-3).
2. ``confirm_password_reset(uid, token, password)``: si el enlace es válido, fija la contraseña nueva, apaga el cambio
   obligatorio y cierra todas las sesiones (S1-4).

El token es el generador de Django (firmado con ``SECRET_KEY``, sin tabla): caduca a los ``PASSWORD_RESET_TIMEOUT``
segundos y deja de valer en cuanto cambian la contraseña, la época de sesión o el estado de la cuenta, así que sirve una
sola vez. La URL del enlace sale SOLO de la configuración, nunca de la petición: una cabecera ``Host`` falsa no puede
mandar a nadie a otro sitio.
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status

from apps.simulation.services.audit_service import auditable
from apps.users.serializers import normalize_email_value
from shared.background import run_in_background
from shared.exceptions import ApiError

from .account_service import revoke_sessions

User = get_user_model()
logger = logging.getLogger(__name__)

ASUNTO = "[SIEP] Restablecer tu contraseña"
#: En desarrollo, sin ``SIEP_PUBLIC_URL``, el enlace apunta al frontend local (``npm start``).
URL_LOCAL = "http://localhost:4200"


class _GeneradorDeEnlaces(PasswordResetTokenGenerator):
    """Como el de Django, más la época de sesión y el estado: cerrar sesiones o desactivar la cuenta invalida el enlace."""

    key_salt = "siep.users.password_reset"

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.password}{user.session_epoch}{user.activo}{timestamp}"


generador = _GeneradorDeEnlaces()


def _url_publica():
    base = (getattr(settings, "SIEP_PUBLIC_URL", "") or "").strip().rstrip("/")
    if base:
        return base
    return URL_LOCAL if settings.DEBUG else ""


def enlace_para(user):
    """El enlace de restablecimiento de ``user`` (``None`` si no hay URL pública configurada en producción)."""
    base = _url_publica()
    if not base:
        return None
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    return f"{base}/restablecer-contrasena?uid={uid}&token={generador.make_token(user)}"


def _texto(user, enlace):
    minutos = max(1, settings.PASSWORD_RESET_TIMEOUT // 60)
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return (
        f"Hola {user.nombre},\n\n"
        "Recibimos una solicitud para restablecer la contraseña de tu cuenta en SIEP.\n"
        "Para elegir una contraseña nueva, abre este enlace:\n\n"
        f"{enlace}\n\n"
        f"El enlace sirve una sola vez y vence en {minutos} minutos.\n"
        "Si no fuiste tú, ignora este mensaje: tu contraseña sigue igual.\n"
    )


def _enviar(user_id, destinatario, cuerpo):
    """Corre en un hilo aparte (no retiene la petición). Un fallo se registra sin datos personales."""
    try:
        send_mail(ASUNTO, cuerpo, settings.DEFAULT_FROM_EMAIL, [destinatario], fail_silently=False)
    except Exception:
        logger.exception("No se pudo enviar el correo para restablecer la contraseña (cuenta %s).", user_id)


def request_password_reset(email):
    """Manda el enlace si ``email`` es de una cuenta activa. Devuelve la cuenta (o ``None``) solo para las pruebas: la
    vista responde igual en todos los casos."""
    user = User.objects.filter(email=normalize_email_value(email), activo=True).first()
    if user is None:
        return None
    enlace = enlace_para(user)
    if enlace is None:
        logger.error("SIEP_PUBLIC_URL no está configurada: no se puede mandar el enlace para restablecer la contraseña.")
        return None
    cuerpo = _texto(user, enlace)
    transaction.on_commit(lambda: run_in_background(_enviar, user.pk, user.email, cuerpo))
    return user


def _enlace_no_valido():
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError(
        "RESET_LINK_INVALID",
        "El enlace no es válido o ya venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?».",
        status.HTTP_400_BAD_REQUEST,
    )


def _cuenta_del_enlace(uid, token):
    try:
        pk = force_str(urlsafe_base64_decode(uid or ""))
        user = User.objects.filter(pk=int(pk), activo=True).first()
    except (TypeError, ValueError, OverflowError):
        user = None
    if user is None or not generador.check_token(user, token or ""):
        raise _enlace_no_valido()
    return user


def check_reset_link(uid, token):
    """``True`` si el enlace sigue sirviendo (la pantalla lo pregunta antes de pedir la contraseña nueva)."""
    try:
        _cuenta_del_enlace(uid, token)
    except ApiError:
        return False
    return True


@auditable("PASSWORD_CHANGED", "USER", resource_id=lambda args, kwargs, result: result.pk)
def confirm_password_reset(uid, token, password):
    """Fija la contraseña nueva de la cuenta del enlace y cierra todas sus sesiones. Devuelve la cuenta."""
    user = _cuenta_del_enlace(uid, token)
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as exc:
        raise ApiError("VALIDATION_ERROR", " ".join(exc.messages), status.HTTP_400_BAD_REQUEST, field="password") from None
    with transaction.atomic():
        user.set_password(password)
        user.must_change_password = False
        user.temp_password_set_at = None
        user.save(update_fields=["password", "must_change_password", "temp_password_set_at"])
        # S1-4 · quien tenía la contraseña vieja (o un token robado) queda fuera.
        user.session_epoch = revoke_sessions(user.id)
    return user

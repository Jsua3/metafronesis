"""Cuentas: aprobación por lote de las pendientes y cambio de contraseña (E2-9, RN-10).

Una cuenta **pendiente** es la que nació de una importación del docente: ``activo = False``,
``must_change_password = True`` y sin contraseña usable. El ADMIN la aprueba: se activa, recibe
una contraseña temporal **por correo** (nunca por la respuesta de la API ni por el log) y el
primer inicio la obliga a fijar una propia (``apps.users.authentication``).
"""
import functools
import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import status

from apps.simulation.services.audit_service import auditable
from apps.users.models import UserRole
from shared.background import run_in_background
from shared.exceptions import ApiError
from shared.plain_text import person_text_problem
from shared.policies import ADMIN

User = get_user_model()
logger = logging.getLogger(__name__)
#: Eventos de seguridad (una línea JSON cada uno, sin correos ni contraseñas: ``shared.jsonlog``).
security_logger = logging.getLogger("siep.security")

#: Sin caracteres ambiguos (0/O, 1/l/I): la persona la teclea desde un correo.
_TEMPORARY_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
_TEMPORARY_LENGTH = 14


def new_temporary_password():
    return get_random_string(_TEMPORARY_LENGTH, allowed_chars=_TEMPORARY_ALPHABET)


def _send_approval_email(user, temporary_password):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    send_mail(
        "[SIEP] Tu cuenta fue aprobada",
        (
            f"Hola {user.nombre},\n\n"
            "Tu cuenta en SIEP fue aprobada. Para entrar usa:\n\n"
            f"Correo: {user.email}\n"
            f"Contraseña temporal: {temporary_password}\n\n"
            "Al entrar te pediremos que la cambies por una propia antes de continuar.\n"
            "Si no esperabas este mensaje, ignóralo.\n"
        ),
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )


def _approval_audit_context(args, kwargs, result):
    return {
        "approvedIds": result["approvedIds"],
        "skippedIds": result["skipped"],
        "failedIds": result["failed"],
    }


def approval_email_failed():
    """409 de la activación individual cuando el correo no salió: la cuenta sigue pendiente."""
    return ApiError(
        "APPROVAL_EMAIL_FAILED",
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        "No se pudo enviar el correo con la contraseña temporal, así que la cuenta sigue "
        "pendiente. Revisa la configuración del correo e inténtalo de nuevo.",
        status.HTTP_409_CONFLICT,
    )


def _approve_one(user_id):
    """Aprueba UNA cuenta pendiente: ``"approved"``, ``"skipped"`` o ``"failed"``.

    El cerrojo de la fila serializa dos órdenes sobre la misma cuenta: la segunda ya la ve activa
    y la salta, en vez de mandar un segundo correo con una clave que no sirve. El correo sale con
    la fila bloqueada pero antes de confirmar: si falla, todo se deshace y la cuenta sigue
    pendiente (``failed``); nunca queda activa con una contraseña que nadie conoce.
    """
    with transaction.atomic():
        user = User.objects.select_for_update().filter(pk=user_id).first()
        if user is None or not user.is_pending_approval:
            return "skipped"
        temporary = new_temporary_password()
        user.set_password(temporary)
        user.activo = True
        user.must_change_password = True
        # S1-5 · la temporal caduca: el plazo cuenta desde aquí (``SIEP_TEMP_PASSWORD_DAYS``).
        user.temp_password_set_at = timezone.now()
        user.save(update_fields=["password", "activo", "must_change_password", "temp_password_set_at"])
        # S1-4 · reactivar la cuenta cierra las sesiones anteriores: no revive tokens viejos.
        revoke_sessions(user_id)
        try:
            _send_approval_email(user, temporary)
        except Exception:  # noqa: BLE001  (un servidor de correo caído no debe romper el lote)
            logger.exception("No se pudo enviar el correo de aprobación al usuario %s", user_id)
            transaction.set_rollback(True)
            return "failed"
    return "approved"


@auditable("USER_APPROVED", "USER", -1, context=_approval_audit_context)
def approve_pending(user_ids, actor):
    """Aprueba por lote: ``{approved, approvedIds, skipped, emailed, failed}``; nunca una contraseña.

    Solo las cuentas pendientes se aprueban; el resto va a ``skipped``.
    """
    approved, skipped, failed = [], [], []
    buckets = {"approved": approved, "skipped": skipped, "failed": failed}
    for user_id in dict.fromkeys(int(i) for i in user_ids):
        buckets[_approve_one(user_id)].append(user_id)
    return {
        "approved": len(approved),
        "approvedIds": approved,
        "skipped": skipped,
        "emailed": len(approved),
        "failed": failed,
    }


def approve_if_pending(user_id, actor):
    """«Activar» desde la pantalla de usuarios: una cuenta pendiente se aprueba por el mismo
    camino del lote (con el correo de la contraseña temporal), no se deja activa y sin clave.

    Devuelve el resultado del lote, o ``None`` si la cuenta no es una pendiente.
    """
    candidate = User.objects.filter(pk=user_id, activo=False, must_change_password=True).first()
    if candidate is None or not candidate.is_pending_approval:
        return None
    return approve_pending([user_id], actor)


def lock_admins():
    """Cerrojo sobre TODAS las filas de ADMIN, en orden de id (primero, antes que el destino).

    Dos administradores que se desactivan entre sí toman los mismos cerrojos en el mismo orden:
    se serializan en vez de cruzarse (interbloqueo) y la segunda orden ya ve el resultado de la
    primera. Debe llamarse dentro de una transacción.
    """
    return list(
        User.objects.select_for_update().filter(role=ADMIN).order_by("pk").values_list("pk", flat=True)
    )


def ensure_not_erased(user):
    """409 ``ACCOUNT_ERASED`` si la cuenta fue suprimida con ``erase_personal_data`` (S3-4).

    Reactivarla o editarla volvería a ligar su historial seudonimizado (intentos, eventos, decisiones) a un nombre y un
    correo: justo lo que la supresión deshizo. Una cuenta suprimida es la que lleva el correo seudonimo de su id y está inactiva.
    """
    # Importación perezosa: ``apps.privacy`` importa servicios de este paquete.
    from apps.privacy.data_subject import correo_seudonimo

    if not user.activo and user.email == correo_seudonimo(user.pk):
        raise ApiError(
            "ACCOUNT_ERASED",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Esta cuenta fue suprimida a petición de su titular y no puede reactivarse ni editarse.",
            status.HTTP_409_CONFLICT,
        )


def ensure_not_last_admin(user, *, role=None, activo=None):
    """400 ``LAST_ADMIN`` si el cambio dejaría al sistema sin un ADMIN activo (D-6).

    Se llama dentro de una transacción que ya tomó ``lock_admins()``.
    """
    steps_down = (role is not None and role != ADMIN) or activo is False
    if not (user.role == ADMIN and user.activo and steps_down):
        return
    active_admins = list(
        User.objects.filter(role=ADMIN, activo=True).order_by("pk").values_list("pk", flat=True)
    )
    if not [pk for pk in active_admins if pk != user.pk]:
        raise ApiError(
            "LAST_ADMIN",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "No puedes desactivar ni quitar el rol al último administrador activo.",
            status.HTTP_400_BAD_REQUEST,
        )


# El id de la persona es el primer argumento: la fila de auditoría lo guarda como recurso (-1 lo dejaría vacío).
@auditable("SESSIONS_REVOKED", "USER", 0)
def revoke_sessions(user_id):
    """Cierra todas las sesiones de ``user_id``: sus tokens emitidos antes dejan de valer (S1-4).

    Una sola sentencia ``UPDATE ... SET session_epoch = session_epoch + 1``: dos revocaciones simultáneas suman dos
    y ninguna se pierde. Devuelve la época nueva. Debe llamarse dentro de la transacción del cambio que la motiva.
    """
    User.objects.filter(pk=user_id).update(session_epoch=F("session_epoch") + 1)
    return User.objects.filter(pk=user_id).values_list("session_epoch", flat=True).first()


def _field_error(field, message):
    return ApiError("VALIDATION_ERROR", message, status.HTTP_400_BAD_REQUEST, field=field)


@auditable("PASSWORD_CHANGED", "USER", -1)
def change_password(user, current_password, new_password):
    """Cambia la contraseña de ``user``, apaga el cambio obligatorio y cierra sus sesiones (S1-4).

    Devuelve ``user`` con la época de sesión nueva: la vista le reemite un token a quien la cambió, así su sesión
    actual sigue y solo mueren las demás (un token robado deja de servir).
    """
    if not user.check_password(current_password or ""):
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise _field_error("currentPassword", "La contraseña actual no es correcta.")
    if new_password == current_password:
        raise _field_error("newPassword", "La nueva contraseña debe ser distinta de la actual.")
    try:
        password_validation.validate_password(new_password, user)
    except DjangoValidationError as exc:
        raise _field_error("newPassword", " ".join(exc.messages)) from None
    # S1-4 · la contraseña nueva y el cierre de las sesiones van en la misma transacción.
    with transaction.atomic():
        user.set_password(new_password)
        user.must_change_password = False
        # S1-5 · una clave propia no caduca: se borra la fecha de la temporal.
        user.temp_password_set_at = None
        user.save(update_fields=["password", "must_change_password", "temp_password_set_at"])
        # La instancia lleva la época nueva: el token que se reemite a quien cambió la clave nace vigente.
        user.session_epoch = revoke_sessions(user.id)
    return user


def temporary_password_expired(user, now=None):
    """``True`` si la contraseña temporal de ``user`` caducó (S1-5): sigue siendo temporal y se fijó hace más de
    ``SIEP_TEMP_PASSWORD_DAYS`` días. Una clave propia (sin fecha de temporal) nunca caduca."""
    if not user.must_change_password or user.temp_password_set_at is None:
        return False
    ahora = timezone.now() if now is None else now
    return ahora - user.temp_password_set_at > timedelta(days=settings.SIEP_TEMP_PASSWORD_DAYS)


def return_expired_to_pending(user_id, now=None):
    """Devuelve a «pendiente» la cuenta cuya temporal caducó (S1-5). Devuelve ``True`` si la devolvió.

    Un ADMIN no vuelve a pendiente: no se bloquea a los administradores; su clave caducada deja de servir y otro ADMIN
    la repone. Se vuelve a mirar con la fila bloqueada, así dos intentos a la vez no la devuelven dos veces. En el
    registro solo va el id de la cuenta, nunca el correo.
    """
    with transaction.atomic():
        user = User.objects.select_for_update().filter(pk=user_id).first()
        if user is None or not temporary_password_expired(user, now=now):
            return False
        security_logger.info(
            "security_event", extra={"fields": {"event": "temp_password_expired", "userId": user_id}}
        )
        if user.role == ADMIN:
            return False
        user.activo = False
        user.set_password(None)
        user.must_change_password = True
        user.temp_password_set_at = None
        user.save(update_fields=["activo", "password", "must_change_password", "temp_password_set_at"])
        # S1-4 · las sesiones que quedaban abiertas con la temporal dejan de valer.
        revoke_sessions(user_id)
    return True


def _contexto_de_la_cuenta(args, kwargs, result):
    """Solo el id de la cuenta en la auditoría: nunca la contraseña que fijó el ADMIN (S1-5)."""
    user = args[0] if args else kwargs["user"]
    return {"targetId": user.pk}


@auditable("PASSWORD_SET_BY_ADMIN", "USER", -1, context=_contexto_de_la_cuenta)
def set_password_by_admin(user, password):
    """Un ADMIN fija la contraseña de ``user`` (S1-5 · SF-21): la clave queda temporal, con cambio obligatorio y fecha.

    Guarda solo la clave y su marca. Quien llama guarda el resto de la cuenta y, si la cuenta ya existía, cierra sus
    sesiones. La contraseña no sale de aquí: ni a la auditoría ni al registro ni a la respuesta.
    """
    user.set_password(password)
    user.must_change_password = True
    user.temp_password_set_at = timezone.now()
    user.save(update_fields=["password", "must_change_password", "temp_password_set_at"])
    return user


def _contexto_del_admin_creado(args, kwargs, result):
    """Solo el id de la cuenta nueva en la auditoría: ni el correo ni la clave (SF-21)."""
    return {"targetId": result.pk}


def _recurso_de_la_cuenta(args, kwargs, result):
    """El comando no recibe el id: el recurso de la fila es la cuenta que acaba de crear o reponer (S7-5)."""
    return result.pk


@auditable(
    "ADMIN_CREATED_BY_COMMAND", "USER", -1, context=_contexto_del_admin_creado, resource_id=_recurso_de_la_cuenta
)
def create_admin_account(email, nombre, apellido, password):
    """Crea una cuenta ADMIN activa cuya clave es TEMPORAL (cambio obligatorio y fecha de caducidad).

    Lo llama el comando ``create_admin``, que ya normalizó el correo (``apps.users.serializers.normalize_email_value``).
    Un correo ya registrado, una clave que no pasa ``AUTH_PASSWORD_VALIDATORS`` o un dato vacío fallan sin tocar nada.
    La clave no sale de aquí: ni a la auditoría, ni al registro, ni a la respuesta.
    """
    # BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
    for campo, valor in (("nombre", nombre), ("apellido", apellido)):
        if not (valor or "").strip():
            raise _field_error(campo, f"El {campo} es obligatorio.")
        problema = person_text_problem(valor, 100)
        if problema is not None:
            raise _field_error(campo, problema)
    if not password:
        raise _field_error("password", "La contraseña es obligatoria.")
    try:
        validate_email(email)
    except DjangoValidationError:
        raise _field_error("email", "El correo no es válido.") from None
    with transaction.atomic():
        if User.objects.filter(email=email).exists():
            raise _field_error("email", "El email ya está registrado")
        cuenta = User(email=email, nombre=nombre.strip(), apellido=apellido.strip(), role=UserRole.ADMIN, activo=True)
        try:
            password_validation.validate_password(password, cuenta)
        except DjangoValidationError as exc:
            raise _field_error("password", " ".join(exc.messages)) from None
        cuenta.set_password(password)
        # S1-5 · la clave del primer administrador es temporal: el primer acceso la cambia, y la fecha cuenta el plazo.
        cuenta.must_change_password = True
        cuenta.temp_password_set_at = timezone.now()
        cuenta.save()
    return cuenta


def _contexto_del_admin_repuesto(args, kwargs, result):
    """Solo el id de la cuenta repuesta en la auditoría: ni el correo ni la clave (R1b2)."""
    return {"targetId": result.pk}


@auditable(
    "ADMIN_RESET_BY_COMMAND", "USER", -1, context=_contexto_del_admin_repuesto, resource_id=_recurso_de_la_cuenta
)
def reset_admin_account(email, password):
    """Repone la clave de un ADMIN existente (R1b2): clave TEMPORAL nueva, cuenta activa y sesiones cerradas.

    Lo llama ``create_admin --reset`` para el único administrador cuando pierde su clave o su temporal caducó antes del
    primer acceso (SD-15: no hay recuperación por correo). Solo acepta cuentas de rol ADMIN: nunca convierte a nadie en
    ADMIN ni repone a un estudiante o a un docente. Un correo sin cuenta, una cuenta que no es ADMIN o una clave que no
    pasa ``AUTH_PASSWORD_VALIDATORS`` fallan sin tocar nada. La clave no sale de aquí.
    """
    # BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
    if not password:
        raise _field_error("password", "La contraseña es obligatoria.")
    with transaction.atomic():
        cuenta = User.objects.select_for_update().filter(email=email).first()
        if cuenta is None:
            raise ApiError(
                "ADMIN_RESET_NOT_FOUND",
                "No hay una cuenta con ese correo para reponer.",
                status.HTTP_404_NOT_FOUND,
            )
        if cuenta.role != UserRole.ADMIN:
            raise ApiError(
                "ADMIN_RESET_NOT_ADMIN",
                "Solo se repone una cuenta de administrador: esta cuenta no es de ADMIN y no se ha tocado.",
                status.HTTP_400_BAD_REQUEST,
            )
        try:
            password_validation.validate_password(password, cuenta)
        except DjangoValidationError as exc:
            raise _field_error("password", " ".join(exc.messages)) from None
        cuenta.set_password(password)
        cuenta.activo = True
        cuenta.must_change_password = True
        # S1-5 · la temporal cuenta su plazo desde la reposición: no hereda la fecha de la anterior.
        cuenta.temp_password_set_at = timezone.now()
        cuenta.save(update_fields=["password", "activo", "must_change_password", "temp_password_set_at"])
        # S1-4 · las sesiones anteriores dejan de valer, también las de la clave perdida. La instancia queda al día.
        cuenta.session_epoch = revoke_sessions(cuenta.pk)
    return cuenta


def notify_admin_password_change(user):
    """Avisa a la persona de que un ADMIN le cambió la contraseña (S1-5 · SF-21).

    El aviso sale al confirmarse el cambio y en segundo plano: no bloquea la petición ni la rompe si el correo falla. No
    lleva la contraseña ni enlaces, y dice «un administrador», no quién.
    """
    cuando = timezone.now().strftime("%d/%m/%Y %H:%M")
    transaction.on_commit(
        functools.partial(run_in_background, _enviar_aviso_de_cambio, user.id, user.email, user.nombre, cuando)
    )


def _enviar_aviso_de_cambio(user_id, email, nombre, cuando):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    try:
        send_mail(
            "[SIEP] Un administrador cambió tu contraseña",
            (
                f"Hola {nombre},\n\n"
                f"Un administrador cambió la contraseña de tu cuenta en SIEP el {cuando}.\n\n"
                "Al entrar te pediremos que la cambies por una propia antes de continuar.\n"
                "Si no esperabas este cambio, comunícate con la institución cuanto antes.\n"
            ),
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
    except Exception as exc:  # noqa: BLE001  (el aviso no rompe nada; el registro no lleva el correo)
        logger.error("No se pudo avisar a la cuenta %s del cambio de contraseña (%s)", user_id, type(exc).__name__)

from django.conf import settings
import logging

from django.core.mail import get_connection, send_mail
from django.db import transaction
from django.http import Http404

from apps.simulation.services.audit_service import auditable
from shared import policies

from .models import Notificacion

logger = logging.getLogger(__name__)


def _describir(error):
    detalle = str(error).strip()
    return f"{type(error).__name__}: {detalle}"[:500] if detalle else type(error).__name__


def enviar_correo(aviso, connection=None):
    """Envía el correo de un aviso y deja el resultado en el aviso; un fallo queda además en el registro del servidor."""
    try:
        enviados = send_mail(aviso.titulo, aviso.cuerpo, settings.DEFAULT_FROM_EMAIL, [aviso.destinatario.email],
                             connection=connection)
        aviso.correo_enviado = bool(enviados)
        aviso.error_correo = "" if enviados else "No se envió el correo."
        if not enviados:
            logger.error("El correo del aviso %s (%s) no salió.", aviso.pk, aviso.tipo)
    except Exception as error:
        aviso.correo_enviado = False
        aviso.error_correo = _describir(error)
        logger.exception("No se pudo enviar el correo del aviso %s (%s).", aviso.pk, aviso.tipo)
    aviso.save(update_fields=["correo_enviado", "error_correo"])


def enviar_correos(avisos):
    """Envía varios avisos por una sola conexión SMTP (un grupo entero no abre una conexión por estudiante)."""
    if not avisos:
        return
    try:
        conexion = get_connection()
        conexion.open()
    except Exception as error:
        logger.exception("No se pudo abrir la conexión de correo para %s avisos.", len(avisos))
        for aviso in avisos:
            aviso.correo_enviado = False
            aviso.error_correo = _describir(error)
            aviso.save(update_fields=["correo_enviado", "error_correo"])
        return
    try:
        for aviso in avisos:
            enviar_correo(aviso, connection=conexion)
    finally:
        try:
            conexion.close()
        except Exception:
            logger.warning("No se pudo cerrar la conexión de correo.", exc_info=True)


def al_confirmar(funcion):
    """Punto único donde los correos esperan a la confirmación (las pruebas lo sustituyen para enviar al momento)."""
    transaction.on_commit(funcion)


def crear_varios(destinatarios, originador, tipo, titulo, cuerpo):
    """Guarda los avisos y manda sus correos cuando la transacción se confirma: si la operación se deshace no sale
    ningún correo, y la conexión SMTP no retiene los bloqueos de la base."""
    avisos = [Notificacion.objects.create(destinatario=d, originador=originador, tipo=tipo, titulo=titulo, cuerpo=cuerpo)
              for d in destinatarios]
    if avisos:
        al_confirmar(lambda: enviar_correos(avisos))
    return avisos


def crear(destinatario, originador, tipo, titulo, cuerpo):
    return crear_varios([destinatario], originador, tipo, titulo, cuerpo)[0]


def dto(aviso):
    return {"id": aviso.pk, "tipo": aviso.tipo, "titulo": aviso.titulo, "cuerpo": aviso.cuerpo,
            "leida": aviso.leida, "creadaEn": aviso.creada_en.isoformat()}


@auditable("NOTIFICATION_READ", "NOTIFICACION", resource_id_param_index=1)
@transaction.atomic
def marcar_leida(usuario, pk):
    aviso = Notificacion.objects.filter(pk=pk, destinatario=usuario).first()
    if aviso is None:
        raise Http404
    aviso.leida = True
    aviso.save(update_fields=["leida"])
    return aviso


@auditable("NOTIFICATION_RESENT", "NOTIFICACION", resource_id_param_index=1)
@transaction.atomic
def reenviar(usuario, pk):
    aviso = Notificacion.objects.select_related("destinatario").filter(pk=pk).first()
    if aviso is None or not (policies.can(usuario, "user", "manage") or
                              (policies.has_role(usuario, policies.PROFESOR) and aviso.originador_id == usuario.pk)):
        raise Http404
    enviar_correo(aviso)
    return aviso

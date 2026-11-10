from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.http import Http404

from apps.simulation.services.audit_service import auditable
from shared import policies

from .models import Notificacion


def enviar_correo(aviso):
    try:
        enviados = send_mail(aviso.titulo, aviso.cuerpo, settings.DEFAULT_FROM_EMAIL, [aviso.destinatario.email])
        aviso.correo_enviado = bool(enviados)
        aviso.error_correo = "" if enviados else "No se envió el correo."
    except Exception as error:
        aviso.correo_enviado = False
        aviso.error_correo = type(error).__name__
    aviso.save(update_fields=["correo_enviado", "error_correo"])


def crear(destinatario, originador, tipo, titulo, cuerpo):
    aviso = Notificacion.objects.create(destinatario=destinatario, originador=originador, tipo=tipo, titulo=titulo, cuerpo=cuerpo)
    enviar_correo(aviso)
    return aviso


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

"""Recordatorio por correo poco antes de una sesión programada (un solo envío por horario)."""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.simulation.services.audit_service import auditable
from shared.eventos import sesion_por_comenzar

from .efectos import convocados
from .models import EstadoSesion, Sesion


def minutos_de_anticipacion():
    return int(getattr(settings, "SIEP_SESION_RECORDATORIO_MIN", 30))


def _en_ventana(sesion, ahora):
    return ahora < sesion.inicio <= ahora + timedelta(minutes=minutos_de_anticipacion())


def pendientes(ahora=None):
    ahora = ahora or timezone.now()
    return Sesion.objects.filter(
        estado=EstadoSesion.PROGRAMADA, recordatorio_enviado_en__isnull=True,
        inicio__gt=ahora, inicio__lte=ahora + timedelta(minutes=minutos_de_anticipacion()),
    ).order_by("pk")


@auditable("SESION_RECORDATORIO", "SESION")
def _auditar(sesion_id):
    """Solo deja la huella de auditoría; se llama únicamente cuando el correo salió."""


@transaction.atomic
def enviar(sesion_id):
    """Devuelve ``True`` si envió el recordatorio y ``False`` si no había nada que enviar."""
    ahora = timezone.now()
    sesion = Sesion.objects.select_for_update().select_related("case_version__simulation_case").get(pk=sesion_id)
    if sesion.estado != EstadoSesion.PROGRAMADA or sesion.recordatorio_enviado_en is not None or not _en_ventana(sesion, ahora):
        return False
    sesion_por_comenzar.send(sender=Sesion, sesion=sesion, estudiantes=[c.estudiante for c in convocados(sesion)])
    sesion.recordatorio_enviado_en = ahora
    sesion.save(update_fields=["recordatorio_enviado_en"])
    transaction.on_commit(lambda: _auditar(sesion_id))
    return True

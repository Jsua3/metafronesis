from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.simulation.services.audit_service import auditable

from .models import NO_TERMINADAS, Sesion


def vencidas():
    return Sesion.objects.filter(estado__in=NO_TERMINADAS, fin__lte=timezone.now() - timedelta(days=1)).order_by("pk")


@auditable("SESION_CIERRE_AUTOMATICO", "SESION")
@transaction.atomic
def cerrar(sesion_id):
    from .servicios import aplicar

    sesion = Sesion.objects.select_for_update().get(pk=sesion_id)
    if sesion.fin > timezone.now() - timedelta(days=1):
        return
    aplicar(sesion, sesion.estado_actual().cerrar_automatico(sesion))

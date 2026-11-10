from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.grupos.models import CaseAssignment
from apps.simulation.models import SimulationAttempt
from apps.simulation.models.attempt import OPEN_ATTEMPT_STATUSES
from apps.simulation.services.cierre import cerrar_como_incompleto
from apps.simulation.services.audit_service import auditable
from .estados import ESTADOS
from .models import Sesion


def vencidas():
    return Sesion.objects.filter(fin__lte=timezone.now() - timedelta(days=1)).order_by("pk")


@auditable("SESION_CIERRE_AUTOMATICO", "SESION")
@transaction.atomic
def cerrar(sesion_id):
    sesion = Sesion.objects.select_for_update().get(pk=sesion_id)
    if sesion.fin > timezone.now() - timedelta(days=1):
        return
    estudiantes = sesion.convocatorias.values_list("estudiante_id", flat=True)
    intentos = SimulationAttempt.objects.select_for_update().filter(
        student_id__in=estudiantes, case_version=sesion.case_version,
        started_at__gte=sesion.inicio, started_at__lt=sesion.fin, status__in=OPEN_ATTEMPT_STATUSES,
    )
    for intento in intentos:
        cerrar_como_incompleto(intento, "CIERRE_DE_SESION")
    CaseAssignment.objects.filter(
        estudiante_id__in=estudiantes, case_version=sesion.case_version,
        opens_at=sesion.inicio, closes_at=sesion.fin, active=True,
    ).update(active=False)
    estado = ESTADOS[sesion.estado].cerrar_automatico()
    if estado != sesion.estado:
        sesion.estado = estado
        sesion.save(update_fields=["estado"])

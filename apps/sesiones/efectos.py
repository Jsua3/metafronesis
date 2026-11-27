"""Efectos de los estados de la sesión sobre el simulador (los llama ``estados.py``).

Corren dentro de la transacción de la transición, con la fila de la sesión bloqueada: si uno falla, la sesión no
cambia de estado."""
from django.utils import timezone

from apps.grupos.models import CaseAssignment
from apps.simulation.models import AttemptEvent, AttemptStatus, SimulationAttempt
from apps.simulation.models.attempt import OPEN_ATTEMPT_STATUSES
from apps.simulation.services import attempt_lifecycle
from apps.simulation.services.attempt_duration import touch
from apps.simulation.services.attempt_lock import lock_attempt_row
from apps.simulation.services.cierre import cerrar_como_incompleto
from shared.eventos import sesion_cancelada
from shared.exceptions import ApiError

from .models import ACTIVAS, Convocatoria, EstadoConvocatoria, Sesion
from .nombres import nombre_de

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
PAUSA_POR_SESION = "Sesión pausada por el docente"


def convocados(sesion):
    return Convocatoria.objects.filter(sesion=sesion, estado=EstadoConvocatoria.ACTIVA).select_related("estudiante")


def _ids(sesion, estudiantes_ids):
    if estudiantes_ids is None:
        return list(convocados(sesion).values_list("estudiante_id", flat=True))
    return list(estudiantes_ids)


def habilitar_caso(sesion, estudiantes_ids=None):
    """El caso aparece en «Casos» de cada convocado, en la ventana [inicio real, fin)."""
    if sesion.fin <= sesion.iniciada_en:
        # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
        raise ApiError("SESSION_EXPIRED", "La hora de fin ya pasó. Edita la sesión antes de iniciarla.", 409)
    ids = _ids(sesion, estudiantes_ids)
    otras = (
        Convocatoria.objects.filter(
            estudiante_id__in=ids, estado=EstadoConvocatoria.ACTIVA,
            sesion__case_version=sesion.case_version, sesion__estado__in=ACTIVAS,
        ).exclude(sesion=sesion).select_related("estudiante")
    )
    nombres = sorted({nombre_de(convocatoria.estudiante) for convocatoria in otras})
    if nombres:
        raise ApiError(
            "CONVOCADO_EN_OTRA_SESION",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "Algunos convocados están en otra sesión activa con este caso.", 409, estudiantes=nombres,
        )
    for estudiante_id in ids:
        CaseAssignment.objects.update_or_create(
            case_version=sesion.case_version, estudiante_id=estudiante_id,
            defaults={"opens_at": sesion.iniciada_en, "closes_at": sesion.fin, "active": True, "assigned_by": sesion.creada_por},
        )


def deshabilitar_caso(sesion, estudiantes_ids=None):
    if sesion.iniciada_en is None:
        return
    CaseAssignment.objects.filter(
        case_version=sesion.case_version, estudiante_id__in=_ids(sesion, estudiantes_ids),
        opens_at=sesion.iniciada_en, active=True,
    ).update(active=False)


def _intentos(sesion, estados):
    if sesion.iniciada_en is None:
        return SimulationAttempt.objects.none()
    return SimulationAttempt.objects.filter(
        convocatoria__sesion=sesion, is_rehearsal=False, status__in=estados,
    )


def _ids_de_intentos(sesion, estados):
    """Solo los ids: cada efecto toma el cerrojo de cada intento y lo vuelve a leer, porque entre esta lectura y el
    cerrojo un estudiante pudo pausarlo, terminarlo o cerrarlo (la sesión bloqueada no bloquea sus intentos)."""
    return list(_intentos(sesion, estados).order_by("pk").values_list("pk", flat=True))


def pausar_intentos(sesion):
    """Como la salida segura: registra el tiempo activo, pausa y deja el evento."""
    ahora = timezone.now()
    for intento_id in _ids_de_intentos(sesion, (AttemptStatus.IN_PROGRESS,)):
        lock_attempt_row(intento_id)
        intento = SimulationAttempt.objects.select_related("current_node").get(pk=intento_id)
        if not attempt_lifecycle.state_of(intento).can(attempt_lifecycle.PAUSE):
            continue
        touch(intento, ahora)
        attempt_lifecycle.apply(intento, attempt_lifecycle.PAUSE)
        intento.save()
        AttemptEvent.objects.create(attempt=intento, node=intento.current_node, event_type="PAUSE", detail=PAUSA_POR_SESION)


def cerrar_intentos(sesion):
    for intento_id in _ids_de_intentos(sesion, OPEN_ATTEMPT_STATUSES):
        lock_attempt_row(intento_id)
        intento = SimulationAttempt.objects.filter(pk=intento_id).first()
        if intento is None or intento.status not in OPEN_ATTEMPT_STATUSES:
            continue  # el estudiante lo terminó mientras tanto: ya no hay nada que cerrar
        cerrar_como_incompleto(intento, "CIERRE_DE_SESION")


def avisar_cancelacion(sesion):
    sesion_cancelada.send(sender=Sesion, sesion=sesion, estudiantes=[c.estudiante for c in convocados(sesion)])

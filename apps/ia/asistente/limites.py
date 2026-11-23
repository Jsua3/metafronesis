"""Cupo del asistente de autoría: tope diario por persona y tope mensual del programa.

El cupo se RESERVA antes de llamar al proveedor (``consumir``) y se devuelve si el proveedor falla (``devolver``): una
respuesta 502 no gasta ayuda. La reserva es atómica: la fila del día se toma con ``select_for_update``, así dos
peticiones simultáneas al borde del límite no pasan las dos.
"""
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework import status

from apps.simulation.models import AuthoringAssistantUsage
from shared.exceptions import ApiError

from . import config as config_del_asistente

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
MENSAJE_DIARIO = "Llegaste al límite de ayuda de la IA por hoy."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
MENSAJE_MENSUAL = "El programa agotó la ayuda de la IA de este mes."


@dataclass(frozen=True)
class Cupo:
    """Lo que le queda a la persona hoy, después de reservar un uso."""

    remaining_today: int


class LimiteSuperado(ApiError):
    """Se agotó el cupo; ``scope`` es ``"daily"`` o ``"monthly"``. Responde 429 ``AI_LIMIT_EXCEEDED``."""

    def __init__(self, scope):
        mensaje = MENSAJE_DIARIO if scope == "daily" else MENSAJE_MENSUAL
        super().__init__("AI_LIMIT_EXCEEDED", mensaje, status.HTTP_429_TOO_MANY_REQUESTS)
        self.scope = scope


def hoy():
    return timezone.localtime().date() if settings.USE_TZ else timezone.now().date()


def usados_hoy(usuario) -> int:
    fila = AuthoringAssistantUsage.objects.filter(user=usuario, day=hoy()).first()
    return fila.count if fila else 0


def restante_hoy(usuario, config=None) -> int:
    """Lo que le queda hoy a ``usuario`` (nunca negativo)."""
    config = config or config_del_asistente.actual()
    return max(0, config.daily_limit - usados_hoy(usuario))


def consumir(usuario) -> Cupo:
    """Reserva un uso para ``usuario`` o lanza ``LimiteSuperado``."""
    config = config_del_asistente.actual()
    dia = hoy()
    with transaction.atomic():
        AuthoringAssistantUsage.objects.get_or_create(user=usuario, day=dia)
        fila = AuthoringAssistantUsage.objects.select_for_update().get(user=usuario, day=dia)
        if fila.count >= config.daily_limit:
            raise LimiteSuperado("daily")
        total_del_mes = (
            AuthoringAssistantUsage.objects.filter(day__year=dia.year, day__month=dia.month)
            .aggregate(total=Sum("count"))["total"]
            or 0
        )
        if total_del_mes >= config.monthly_limit:
            raise LimiteSuperado("monthly")
        fila.count += 1
        fila.save(update_fields=["count"])
        return Cupo(remaining_today=max(0, config.daily_limit - fila.count))


def devolver(usuario) -> None:
    """Devuelve un uso a ``usuario`` (sin bajar de cero), en su propia transacción."""
    with transaction.atomic():
        AuthoringAssistantUsage.objects.filter(user=usuario, day=hoy(), count__gt=0).update(count=F("count") - 1)

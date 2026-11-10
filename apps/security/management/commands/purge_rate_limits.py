"""Borra por alcance los contadores del limitador que ya no se leen (S1-2, DJA-2; revisión de la ola A, hallazgo #4).

Cada alcance de ``LIMITS`` conserva dos veces su ventana (``2 × window``): una ventana que ya acabó no la lee nunca
``peek``. Los contadores (``CONTADORES``, p. ej. ``audit_failure``, que ``security_report`` cuenta en varios días) y los
alcances que ya no están en ``LIMITS`` conservan dos días. El corte es estricto: la fila exactamente en el corte se
conserva. El borrado va por lotes de ``LOTE`` filas, para no bloquear la tabla en una sola sentencia.
"""
from django.core.management.base import BaseCommand
from django.db import connection

from apps.security import limiter
from apps.security.limits import CONTADORES, LIMITS
from apps.security.models import RateLimitBucket

DIA = 86400
RETENCION_DOS_DIAS = 2 * DIA
#: Filas por sentencia ``DELETE``.
LOTE = 5000


def _retenciones() -> dict[str, int]:
    """Segundos que se conservan las ventanas de cada alcance que hay en la tabla."""
    retenciones = {
        alcance: RETENCION_DOS_DIAS if alcance in CONTADORES else 2 * limite.window
        for alcance, limite in LIMITS.items()
    }
    retirados = RateLimitBucket.objects.exclude(scope__in=list(LIMITS)).values_list("scope", flat=True).distinct()
    for alcance in retirados:
        retenciones[alcance] = RETENCION_DOS_DIAS
    return retenciones


def _borrar_por_lotes(alcance: str, corte: int) -> int:
    """Borra las ventanas de ``alcance`` anteriores a ``corte``, ``LOTE`` filas cada vez, hasta que no queden."""
    total = 0
    while True:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM rate_limit_buckets WHERE ctid IN ("
                "SELECT ctid FROM rate_limit_buckets WHERE scope = %s AND window_start < %s LIMIT %s)",
                [alcance, corte, LOTE],
            )
            borradas = cursor.rowcount
        total += borradas
        if borradas < LOTE:  # un lote corto significa que no quedaba nada que borrar en ese momento
            return total


class Command(BaseCommand):
    help = "Borra los contadores del limitador cuya ventana ya no se lee."  # BORRADOR

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Cuenta lo que borraría, sin borrar nada.",  # BORRADOR
        )

    def handle(self, *args, **options):
        ahora = int(limiter._now())
        total = 0
        for alcance, retencion in _retenciones().items():
            corte = ahora - retencion
            if options["dry_run"]:
                cuenta = RateLimitBucket.objects.filter(scope=alcance, window_start__lt=corte).count()
            else:
                cuenta = _borrar_por_lotes(alcance, corte)
            if cuenta:
                self.stdout.write(f"  {alcance}: {cuenta}")  # BORRADOR
            total += cuenta
        if options["dry_run"]:
            self.stdout.write(f"Se borrarían {total} contadores vencidos (--dry-run).")  # BORRADOR
        else:
            self.stdout.write(f"Se borraron {total} contadores vencidos.")  # BORRADOR

"""Borra lo vencido: los contadores del limitador, la auditoría pasada de su plazo y las solicitudes de acceso resueltas vencidas (S3-4).

    python manage.py purge_expired_data --executed-by CORREO_DEL_ADMIN --dry-run
    python manage.py purge_expired_data --executed-by CORREO_DEL_ADMIN --confirm

Aplica lo mismo que ``purge_rate_limits`` y ``purge_audit_logs`` (la auditoría se borra pasados ``retention_until``, que nunca baja
de 360 días) y, solo si la institución lo configuró con ``SIEP_RETENTION_ACCESS_REQUEST_DAYS``, las solicitudes de acceso YA
RESUELTAS más viejas que ese plazo. Con la variable vacía o en 0 no se borra ninguna solicitud: el plazo es de la institución
(SD-9). Una solicitud pendiente nunca se borra. La salida solo da recuentos.
"""
from django.core.management.base import CommandError

from apps.privacy import services
from apps.privacy.management.commands._comun import ComandoDeDerechos
from shared.exceptions import ApiError


class Command(ComandoDeDerechos):
    con_persona = False

    # BORRADOR: texto de ayuda nuevo, pendiente de revisión.
    help = (
        "Borra lo vencido: contadores del limitador, auditoría pasada de su plazo (360 días como mínimo) y, si la institución "
        "lo configuró, solicitudes de acceso resueltas vencidas. Usa --dry-run primero."
    )

    def handle(self, *args, **options):
        ejecutor, _ = self.preparar(options)
        try:
            informe = services.purge_expired(dry_run=options["dry_run"], executed_by=ejecutor)
        except ApiError as exc:
            raise CommandError(str(exc.detail)) from None
        # BORRADOR: textos nuevos para quien opera la plataforma, pendientes de revisión. Solo recuentos.
        verbo = "se borrarían" if informe["simulacro"] else "se borraron"
        modo = " (simulacro: no se borró nada)" if informe["simulacro"] else ""
        retencion = (
            f"plazo de {informe['diasDeSolicitudes']} día(s)"
            if informe["diasDeSolicitudes"] else "sin plazo configurado: no se borra ninguna"
        )
        for linea in (
            f"Depuración de lo vencido, pedida por la cuenta {ejecutor.pk}{modo}:",
            f"  contadores del limitador: {verbo} {informe['contadores']}",
            f"  auditoría vencida (plazo de {informe['diasDeAuditoria']} día(s) como mínimo): {verbo} {informe['auditoria']}",
            f"  solicitudes de acceso resueltas ({retencion}): {verbo} {informe['solicitudes']}",
        ):
            self.stdout.write(linea)

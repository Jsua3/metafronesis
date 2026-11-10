from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.simulation.models import AuditLog
from apps.simulation.services.audit_service import retention_days


class Command(BaseCommand):
    help = "Elimina registros de auditoría cuya retención ha terminado."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        ahora = timezone.now()
        registros = AuditLog.objects.filter(
            occurred_at__lt=ahora - timedelta(days=retention_days()), retention_until__lte=ahora
        )
        cantidad = registros.count()
        if not options["dry_run"]:
            registros.delete()
        self.stdout.write(f"Registros {'a eliminar' if options['dry_run'] else 'eliminados'}: {cantidad}")

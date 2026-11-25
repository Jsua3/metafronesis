from django.core.management.base import BaseCommand

from apps.sesiones import recordatorio


class Command(BaseCommand):
    help = "Envía el recordatorio por correo de las sesiones programadas que empiezan en pocos minutos."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        ids = list(recordatorio.pendientes().values_list("pk", flat=True))
        if not options["dry_run"]:
            for sesion_id in ids:
                recordatorio.enviar(sesion_id)
        self.stdout.write(f"Sesiones por recordar: {len(ids)}")

from django.core.management.base import BaseCommand

from apps.sesiones import cierre


class Command(BaseCommand):
    help = "Finaliza las sesiones vencidas y cierra sus intentos abiertos."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        ids = list(cierre.vencidas().values_list("pk", flat=True))
        if not options["dry_run"]:
            for sesion_id in ids:
                cierre.cerrar(sesion_id)
        self.stdout.write(f"Sesiones vencidas: {len(ids)}")

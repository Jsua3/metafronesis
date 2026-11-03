"""Devuelve a «pendiente» las cuentas cuya contraseña temporal caducó (S1-5, ``SIEP_TEMP_PASSWORD_DAYS``).

Es lo mismo que hace el inicio de sesión con una clave caducada, para todas las cuentas de una vez (por ejemplo, desde una
tarea programada). Los ADMIN no se desactivan: su clave caducada solo deja de servir. No imprime correos ni contraseñas,
solo recuentos.

    python manage.py expire_temporary_passwords --dry-run
    python manage.py expire_temporary_passwords
"""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.users.services import account_service

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Devuelve a «pendiente» las cuentas con una contraseña temporal caducada (SIEP_TEMP_PASSWORD_DAYS). "
        "Los administradores no se desactivan: su clave caducada solo deja de servir."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Solo cuenta lo que devolvería a pendiente; no escribe nada.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        ahora = timezone.now()
        limite = ahora - timedelta(days=settings.SIEP_TEMP_PASSWORD_DAYS)
        caducadas = User.objects.filter(must_change_password=True, temp_password_set_at__lt=limite)
        administradores = caducadas.filter(role="ADMIN").count()
        personas = list(caducadas.exclude(role="ADMIN").order_by("pk").values_list("pk", flat=True))

        if dry_run:
            devueltas = len(personas)
        else:
            devueltas = sum(1 for pk in personas if account_service.return_expired_to_pending(pk, now=ahora))

        etiqueta = "Se devolverían a pendiente" if dry_run else "Devueltas a pendiente"
        suffix = " (simulacro: no se escribió nada)" if dry_run else ""
        self.stdout.write(
            f"Cuentas con la contraseña temporal caducada: {len(personas) + administradores}. "
            f"{etiqueta}: {devueltas}. "
            f"Administradores con clave caducada (no se tocan): {administradores}.{suffix}"
        )

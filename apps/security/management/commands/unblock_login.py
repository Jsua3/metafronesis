"""Levanta el bloqueo por fallos de inicio de sesión de una cuenta (S1-2; revisión de la ola A, hallazgo #2).

``python manage.py unblock_login --email X [--ip Y]`` borra los contadores de fallos de esa cuenta (todas las ventanas).
Con ``--ip`` borra también el de la pareja cuenta + IP, con la misma agrupación que el inicio de sesión. Solo imprime
recuentos: nunca el correo ni la dirección.
"""
import ipaddress

from django.core.management.base import BaseCommand, CommandError

from apps.security import limiter
from apps.security.models import RateLimitBucket
from apps.users.serializers import normalize_email_value
from shared.client_ip import agrupar_ip


class Command(BaseCommand):
    help = "Levanta el bloqueo por fallos de inicio de sesión de una cuenta."  # BORRADOR

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Correo de la cuenta bloqueada.")  # BORRADOR
        parser.add_argument("--ip", help="Además, el contador de esa IP para esa cuenta.")  # BORRADOR

    def handle(self, *args, **options):
        correo = normalize_email_value(options["email"])
        if not correo:
            raise CommandError("Indica un correo con --email.")  # BORRADOR
        borrados = RateLimitBucket.objects.filter(
            scope="login_fail_account", key_hash=limiter.key_hash(correo)
        ).delete()[0]
        self.stdout.write(f"Contadores de la cuenta borrados: {borrados}.")  # BORRADOR
        if options["ip"]:
            try:
                ipaddress.ip_address(options["ip"])
            except ValueError as exc:
                raise CommandError("--ip no es una dirección IP válida.") from exc  # BORRADOR
            pareja = RateLimitBucket.objects.filter(
                scope="login_fail_account_ip", key_hash=limiter.key_hash(correo, agrupar_ip(options["ip"]))
            ).delete()[0]
            self.stdout.write(f"Contadores de la pareja cuenta e IP borrados: {pareja}.")  # BORRADOR

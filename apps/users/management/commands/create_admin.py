"""Crea la primera cuenta ADMIN de un despliegue (SIEP-RNF-03, plan 03 R1b) y repone la de un ADMIN (R1b2).

    python manage.py create_admin --email X --nombre N --apellido A [--password-env NOMBRE_DE_VARIABLE]
    python manage.py create_admin --reset --email X [--password-env NOMBRE_DE_VARIABLE]

La clave NO va como argumento: quedaría en el historial del terminal. Sale de la variable indicada (por defecto
``SIEP_ADMIN_PASSWORD``) o, si esa variable no existe y hay terminal interactiva, se pide dos veces con ``getpass``.
La cuenta queda con una clave TEMPORAL: la persona la cambia en su primer acceso. La lógica vive en
``account_service.create_admin_account`` y ``account_service.reset_admin_account``; este comando solo lee la entrada y
muestra el resultado.

Con ``--reset`` se repone el ADMIN que ya existe (si perdió su clave o su temporal caducó antes del primer acceso): queda
activo, con clave temporal nueva y sus sesiones cerradas. Nunca convierte a nadie en ADMIN: si el correo no tiene cuenta o
no es de un ADMIN, falla sin tocar nada. Con ``--reset`` no hacen falta ``--nombre`` ni ``--apellido``.
"""
import getpass
import os
import sys

from django.core.management.base import BaseCommand, CommandError

from apps.users.serializers import normalize_email_value
from apps.users.services import account_service
from shared.exceptions import ApiError

VARIABLE_POR_DEFECTO = "SIEP_ADMIN_PASSWORD"


# BORRADOR: textos de consola nuevos para el operador, pendientes de revisión.
def _clave(nombre_variable):
    valor = os.environ.get(nombre_variable, "")
    if valor:
        return valor
    if sys.stdin is not None and sys.stdin.isatty():
        primera = getpass.getpass("Contraseña temporal del administrador: ")
        segunda = getpass.getpass("Repite la contraseña: ")
        if primera != segunda:
            raise CommandError("Las dos contraseñas no coinciden. No se creó ninguna cuenta.")
        return primera
    raise CommandError(
        "Falta la contraseña temporal: define la variable de entorno indicada con --password-env "
        f"(por defecto {VARIABLE_POR_DEFECTO}) o ejecuta el comando en una terminal interactiva."
    )


class Command(BaseCommand):
    # BORRADOR: texto de ayuda nuevo, pendiente de revisión.
    help = (
        "Crea la primera cuenta ADMIN con una clave temporal, o repone la de un ADMIN existente con --reset. "
        "La clave sale de una variable o de la terminal."
    )

    def create_parser(self, prog_name, subcommand, **kwargs):
        # Sin abreviaturas: «--password» no debe colarse como «--password-env» y tomar la clave como nombre de variable.
        kwargs.setdefault("allow_abbrev", False)
        return super().create_parser(prog_name, subcommand, **kwargs)

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        # Obligatorios sin --reset (los comprueba handle); con --reset no hacen falta: la cuenta ya existe.
        parser.add_argument("--nombre")
        parser.add_argument("--apellido")
        parser.add_argument("--password-env", default=VARIABLE_POR_DEFECTO)
        # BORRADOR: texto de ayuda nuevo, pendiente de revisión.
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Repone la clave de un ADMIN que ya existe: queda activo, con clave temporal y sin sesiones abiertas.",
        )

    def handle(self, *args, **options):
        if not options["reset"] and (options["nombre"] is None or options["apellido"] is None):
            # BORRADOR: texto nuevo para el operador, pendiente de revisión.
            raise CommandError("Faltan --nombre y --apellido: sin --reset son obligatorios para crear la cuenta.")
        clave = _clave(options["password_env"])
        correo = normalize_email_value(options["email"])
        try:
            if options["reset"]:
                cuenta = account_service.reset_admin_account(correo, clave)
                # BORRADOR: texto nuevo para el operador, pendiente de revisión.
                mensaje = (
                    f"Administrador repuesto (id {cuenta.pk}). "
                    "La contraseña es temporal: la cambia en su primer acceso."
                )
            else:
                cuenta = account_service.create_admin_account(correo, options["nombre"], options["apellido"], clave)
                mensaje = (
                    f"Cuenta ADMIN creada (id {cuenta.pk}). "
                    "La contraseña es temporal: la cambia en su primer acceso."
                )
        except ApiError as exc:
            raise CommandError(str(exc.detail)) from None
        # Solo el id: ni el correo ni la clave se imprimen.
        self.stdout.write(mensaje)

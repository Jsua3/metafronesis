"""Deja un entorno listo para mostrar el simulador (SIEP-234). Corre también en producción.

    SIEP_SEMILLA_CLAVE=... python manage.py sembrar_demostracion --confirmar --publicador admin@ejemplo.org

La contraseña temporal común llega por ``SIEP_SEMILLA_CLAVE`` y no se imprime nunca. Es idempotente: crea lo que falta.
"""
import os

from django.core.management.base import BaseCommand, CommandError

from apps.publicacion import siembra_demostracion as siembra


class Command(BaseCommand):
    help = "Siembra docentes, estudiantes, grupos, una rúbrica y el caso insignia publicado y asignado."

    def add_arguments(self, parser):
        parser.add_argument("--confirmar", action="store_true", help="Obligatorio: confirma que se quiere escribir en este entorno.")
        parser.add_argument("--publicador", required=True, help="Correo de un ADMIN que ya existe; publica el caso.")

    def handle(self, *args, **options):
        if not options["confirmar"]:
            raise CommandError("Falta --confirmar: este comando escribe en la base del entorno actual.")
        try:
            informe = siembra.sembrar(options["publicador"], os.environ.get("SIEP_SEMILLA_CLAVE", ""))
        except siembra.ErrorDeSiembra as error:
            raise CommandError(str(error)) from None
        self.stdout.write(f"Creado ({len(informe.creado)}):")
        for linea in informe.creado:
            self.stdout.write(f"  {linea}")
        self.stdout.write(f"Ya existía ({len(informe.existente)}):")
        for linea in informe.existente:
            self.stdout.write(f"  {linea}")
        self.stdout.write("Las cuentas nuevas tienen una contraseña temporal y deben cambiarla al primer ingreso.")

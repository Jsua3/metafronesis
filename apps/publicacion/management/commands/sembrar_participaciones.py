"""Siembra de demostración más sesiones ya jugadas, para ver reportes con datos. Solo en desarrollo.

    SIEP_SEMILLA_CLAVE=... python manage.py sembrar_participaciones --publicador admin@psychosim.edu.co

Corre primero ``sembrar_demostracion`` (docentes, estudiantes, grupos, rúbrica y caso insignia) y luego juega las
sesiones de ``apps/publicacion/siembra_participaciones.py``. La contraseña temporal no se imprime. Es idempotente.
"""
import os

from django.core.management.base import BaseCommand, CommandError

from apps.publicacion import siembra_participaciones as siembra
from shared.dev_only import require_dev_environment

PUBLICADOR_DEMO = "admin@psychosim.edu.co"


class Command(BaseCommand):
    help = "Siembra la demostración y agrega sesiones finalizadas con intentos, informes y retroalimentación."

    def add_arguments(self, parser):
        parser.add_argument("--publicador", default=PUBLICADOR_DEMO, help="Correo de un ADMIN que ya existe; publica el caso.")

    def handle(self, *args, **options):
        require_dev_environment("sembrar_participaciones")
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
        for linea in informe.archivado:
            self.stdout.write(f"  archivado: {linea}")
        self.stdout.write("Las cuentas nuevas tienen una contraseña temporal y deben cambiarla al primer ingreso.")

"""Carga local del documento del caso insignia."""

import json
from collections import Counter
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.simulation.casedef.escritor_insignia import ErrorDeCarga
from apps.simulation.casedef.insignia import cargar, traducir
from apps.users.models import CustomUser, UserRole
from shared.dev_only import require_dev_environment

RUTA_DOCUMENTO = Path(__file__).resolve().parents[2] / 'data/casos/SIM-VBG-002.dsl.json'
AUTOR_DEMO = 'profesora@psychosim.edu.co'


class Command(BaseCommand):
    help = 'Carga el caso insignia en un entorno de desarrollo.'

    def add_arguments(self, parser):
        parser.add_argument('--autor', default=AUTOR_DEMO, help='Correo del docente autor.')

    def handle(self, *args, **options):
        require_dev_environment('cargar_caso_insignia')
        autor = CustomUser.objects.filter(email=options['autor'], role=UserRole.PROFESOR).first()
        if not autor:
            raise CommandError('No se encontró el docente autor; crea la semilla o indica --autor.')
        plan = traducir(json.loads(RUTA_DOCUMENTO.read_text(encoding='utf-8')))
        self.stdout.write(f'No soportado: {len(plan.no_soportado)}')
        for aviso in plan.no_soportado:
            self.stdout.write(aviso)
        try:
            version = cargar(plan, autor)
        except ErrorDeCarga as error:
            raise CommandError(str(error)) from error
        self.stdout.write(f'Caso {version.simulation_case.code}, versión {version.semantic_version}: '
                          f'{len(plan.nodos)} nodos, {len(plan.opciones)} opciones, {len(plan.salas)} salas, '
                          f'{len(plan.objetos)} objetos, {len(plan.zonas)} zonas, {len(plan.dialogos)} diálogos, '
                          f'{len(plan.personajes)} personajes y {len(plan.herramientas)} herramientas.')
        self.stdout.write(f'Estado de publicación: {version.status}')
        motivos = Counter(str(getattr(motivo, "message", motivo)) for motivo in version.motivos_publicacion)
        for motivo, cantidad in motivos.items():
            self.stdout.write(f'- {cantidad}: {motivo}')

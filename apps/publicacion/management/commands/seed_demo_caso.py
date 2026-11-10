import os
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.grupos.models import CaseAssignment
from apps.publicacion.huella import huella_de
from apps.simulation.models import (CaseVersion, DecisionOption, Rubric, RubricCriterion,
                                    SimulationCase, SimulationNode, SimulationRubricAssignment)
from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR


class Command(BaseCommand):
    help = "Crea un caso genérico para demostración."

    @transaction.atomic
    def handle(self, *args, **options):
        if os.environ.get("SIEP_ALLOW_DEMO_SEED", "").lower() not in {"1", "true", "yes", "on"}:
            raise CommandError("La semilla de demostración no está habilitada.")
        docente = CustomUser.objects.filter(email="profesora@psychosim.edu.co", role=PROFESOR).first()
        estudiante = CustomUser.objects.filter(email="estudiante@psychosim.edu.co", role=ESTUDIANTE).first()
        if not docente or not estudiante:
            raise CommandError("Primero crea los usuarios de demostración.")
        caso, creado = SimulationCase.objects.get_or_create(
            code="DEMO", defaults={"title": "Caso de demostración", "description": "Ejercicio genérico.", "created_by": docente}
        )
        if not creado:
            self.stdout.write("El caso de demostración ya existe.")
            return
        version = CaseVersion.objects.create(
            simulation_case=caso, semantic_version="1.0.0", created_by=docente,
            narrative_context="Una situación de ejemplo.", learning_objectives='["Practicar decisiones"]',
            estimated_minutes=10,
        )
        inicio = SimulationNode.objects.create(case_version=version, node_key="inicio", title="Inicio",
            narrative="Se presenta una situación de ejemplo.", decision_prompt="¿Qué harías?", start_node=True)
        fin = SimulationNode.objects.create(case_version=version, node_key="fin", title="Fin",
            narrative="El ejercicio ha terminado.", terminal_node=True)
        for clave, texto, clase in [("analizar", "Analizar la situación", "RECOMMENDED"),
                                     ("ignorar", "Ignorar la situación", "RISKY")]:
            DecisionOption.objects.create(case_version=version, source_node=inicio, target_node=fin,
                option_key=clave, text=texto, response_class=clase, feedback_text="Reflexiona sobre la decisión.",
                theory_basis="Ejercicio de práctica.", effects='{"competencies":["ANALISIS"]}')
        rubrica = Rubric.objects.create(name="Rúbrica de demostración", created_by=docente)
        RubricCriterion.objects.create(rubric=rubrica, competency="ANALISIS", title="Análisis", weight=Decimal("100"))
        SimulationRubricAssignment.objects.create(case_version=version, rubric=rubrica, assigned_by=docente)
        CaseAssignment.objects.create(case_version=version, estudiante=estudiante, assigned_by=docente)
        version.status = "PUBLISHED"
        version.published_at = version.validated_at = timezone.now()
        version.definition_hash = huella_de(version)
        version.save(update_fields=["status", "published_at", "validated_at", "definition_hash"])
        self.stdout.write("Caso de demostración creado.")

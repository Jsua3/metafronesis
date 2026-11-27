"""La nota total de las rúbricas va en la escala de la universidad: de 0 (la más baja) a 5 (la más alta)."""
from decimal import Decimal
from importlib import import_module

import pytest
from django.apps import apps as django_apps

from apps.simulation.models import CriterionScore, Rubric, RubricCriterion, RubricEvaluation
from apps.simulation.models.rubric import FormativeLevel, nota_ponderada


@pytest.mark.parametrize("nivel, nota", [
    (FormativeLevel.EN_INICIO, "0.00"), (FormativeLevel.EN_PROCESO, "1.67"),
    (FormativeLevel.LOGRADO, "3.33"), (FormativeLevel.DESTACADO, "5.00"),
])
def test_cada_nivel_vale_su_nota_lineal(nivel, nota):
    assert nota_ponderada([(nivel, 100)]) == Decimal(nota)


def test_la_nota_se_pondera_por_peso_y_sin_peso_es_cero():
    assert nota_ponderada([(FormativeLevel.DESTACADO, 25), (FormativeLevel.EN_INICIO, 75)]) == Decimal("1.25")
    assert nota_ponderada([]) == Decimal("0.00")


@pytest.mark.django_db
def test_la_migracion_convierte_las_evaluaciones_guardadas(intento_con_rubrica):
    # Sistema: (4 − 1) × 60 + (3 − 1) × 40 → 4,33. Docente con Riesgo sin nivel: (4 − 1) × 60 → 3,00.
    intento, rubrica, (escucha, riesgo), docente_id = intento_con_rubrica
    sistema = RubricEvaluation.objects.create(attempt=intento, rubric=rubrica, origin="SISTEMA", status="EVALUATED", total_score=Decimal("3.60"))
    docente = RubricEvaluation.objects.create(attempt=intento, rubric=rubrica, origin="DOCENTE", instructor_id=docente_id, status="PENDING", total_score=Decimal("2.40"))
    for evaluacion, niveles in ((sistema, ("DESTACADO", "LOGRADO")), (docente, ("DESTACADO", None))):
        for criterio, nivel in zip((escucha, riesgo), niveles):
            if nivel:
                CriterionScore.objects.create(rubric_evaluation=evaluacion, rubric_criterion=criterio, level=nivel)
    migracion = import_module("apps.simulation.migrations.0019_nota_total_escala_0_5")
    migracion.a_escala_0_5(django_apps, None)
    sistema.refresh_from_db(), docente.refresh_from_db()
    assert (sistema.total_score, docente.total_score) == (Decimal("4.33"), Decimal("3.00"))
    migracion.a_escala_1_4(django_apps, None)
    sistema.refresh_from_db(), docente.refresh_from_db()
    assert (sistema.total_score, docente.total_score) == (Decimal("3.60"), Decimal("2.40"))


@pytest.fixture
def intento_con_rubrica(scene):
    from apps.simulation.models import SimulationAttempt
    rubrica = Rubric.objects.create(name="Rúbrica", created_by=scene["teacher"])
    escucha = RubricCriterion.objects.create(rubric=rubrica, competency="CARE", title="Escucha", weight=60)
    riesgo = RubricCriterion.objects.create(rubric=rubrica, competency="OTHER", title="Riesgo", weight=40)
    intento = SimulationAttempt.objects.create(student=scene["student"], case_version=scene["version"], current_node=scene["node"], attempt_token_hash="token")
    return intento, rubrica, (escucha, riesgo), scene["teacher"].pk

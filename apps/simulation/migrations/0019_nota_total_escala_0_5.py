"""Pasa ``total_score`` de las evaluaciones con rúbrica a la escala de la universidad, de 0 a 5.

El total se recalcula desde los niveles guardados de cada criterio: cada nivel vale (índice − 1) / 3 × 5
(En inicio 0, En proceso 1,67, Logrado 3,33, Destacado 5).

- Evaluación del sistema: promedio ponderado de los criterios con nivel; un ausente queda en 0,00.
- Valoración docente: los pesos suman 100 y un criterio aún sin nivel cuenta como En inicio (0).

La reversa recalcula la escala anterior (índice 1–4) con las mismas reglas que se usaban antes.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations

INDICE = {"EN_INICIO": 1, "EN_PROCESO": 2, "LOGRADO": 3, "DESTACADO": 4}
CENTESIMA = Decimal("0.01")


def _pares(evaluacion):
    return [(INDICE[p.level], Decimal(p.rubric_criterion.weight or p.rubric_criterion.max_score))
            for p in evaluacion.criterion_scores.all() if p.level in INDICE]


def _recalcular(apps, nota):
    RubricEvaluation = apps.get_model("simulation", "RubricEvaluation")
    evaluaciones = RubricEvaluation.objects.prefetch_related("criterion_scores__rubric_criterion")
    for evaluacion in evaluaciones.iterator(chunk_size=500):
        if evaluacion.status == "ABSENT":
            total = Decimal("0.00")
        else:
            pares = _pares(evaluacion)
            if evaluacion.origin == "DOCENTE":
                divisor = Decimal(100)
            else:
                divisor = sum((peso for _, peso in pares), Decimal(0))
            total = nota(pares, divisor).quantize(CENTESIMA, rounding=ROUND_HALF_UP) if divisor else Decimal("0.00")
        if total != evaluacion.total_score:
            RubricEvaluation.objects.filter(pk=evaluacion.pk).update(total_score=total)


def a_escala_0_5(apps, schema_editor):
    _recalcular(apps, lambda pares, divisor: sum((Decimal(i - 1) * p for i, p in pares), Decimal(0)) * 5 / (3 * divisor))


def a_escala_1_4(apps, schema_editor):
    _recalcular(apps, lambda pares, divisor: sum((Decimal(i) * p for i, p in pares), Decimal(0)) / divisor)


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0018_une_coautoria_y_portada"),
    ]

    operations = [
        migrations.RunPython(a_escala_0_5, a_escala_1_4),
    ]

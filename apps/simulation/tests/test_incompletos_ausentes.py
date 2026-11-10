import json
from decimal import Decimal

import pytest

from apps.simulation.models import AttemptEvent, Rubric, RubricCriterion, SimulationAttempt, SimulationRubricAssignment
from apps.simulation.services import calificacion
from shared.eventos import intento_calificado

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-41")]


@pytest.fixture
def datos(scene):
    rubrica = Rubric.objects.create(name="Rúbrica", created_by=scene["teacher"])
    primero = RubricCriterion.objects.create(rubric=rubrica, competency="CARE", title="Cuidado", weight=60)
    segundo = RubricCriterion.objects.create(rubric=rubrica, competency="OTHER", title="Otra", weight=40)
    SimulationRubricAssignment.objects.create(case_version=scene["version"], rubric=rubrica)
    intento = SimulationAttempt.objects.create(student=scene["student"], case_version=scene["version"], current_node=scene["node"], attempt_token_hash="token")
    scene["option"].effects = json.dumps({"competencies": ["CARE"]})
    scene["option"].save()
    AttemptEvent.objects.create(attempt=intento, node=scene["node"], decision_option=scene["option"], event_type="DECISION_SELECTED", detail=json.dumps({"response_class": "RECOMMENDED"}))
    return scene, rubrica, primero, segundo, intento


def test_cerrar_incompleto_califica_parcial(datos):
    from apps.simulation.services.cierre import cerrar_como_incompleto
    _, _, primero, segundo, intento = datos
    avisos = []
    def receptor(sender, intento, evaluacion, **kwargs):
        avisos.append((intento.pk, evaluacion.pk))
    intento_calificado.connect(receptor, weak=False)
    try:
        cerrado = cerrar_como_incompleto(intento, "TIEMPO")
        evaluacion = cerrado.rubric_evaluations.get(origin="SISTEMA")
        assert cerrado.status == "INCOMPLETE" and cerrado.ended_at and cerrado.locked_at
        assert evaluacion.status == "PARTIAL" and evaluacion.total_score == Decimal("2.80")
        assert evaluacion.criterion_scores.get(rubric_criterion=primero).level == "DESTACADO"
        assert evaluacion.criterion_scores.get(rubric_criterion=segundo).level == "EN_INICIO"
        assert cerrado.evaluation.snapshot
        assert avisos == [(cerrado.pk, evaluacion.pk)]
    finally:
        intento_calificado.disconnect(receptor)


def test_ausente_es_cero(datos):
    scene, rubrica, primero, segundo, _ = datos
    resultado = calificacion.CeroParaAusentes().calificar(None, rubrica)
    assert resultado.total == Decimal("0.00") and resultado.estado == "ABSENT"
    assert resultado.niveles == {primero.pk: "EN_INICIO", segundo.pk: "EN_INICIO"}
    assert calificacion.calificacion_de_ausente(scene["version"].pk) == resultado
    assert calificacion.calificacion_de_ausente(-1) is None


@pytest.mark.parametrize("estado", ["IN_PROGRESS", "PAUSED"])
def test_no_se_cierra_dos_veces(datos, estado):
    from apps.simulation.services.cierre import cerrar_como_incompleto
    intento = datos[4]
    intento.status = estado
    intento.save(update_fields=["status"])
    avisos = []
    def receptor(sender, **kwargs):
        avisos.append(kwargs["evaluacion"].pk)
    intento_calificado.connect(receptor, weak=False)
    try:
        primero = cerrar_como_incompleto(intento, "TIEMPO")
        segundo = cerrar_como_incompleto(intento, "OTRO")
        assert primero.ended_at == segundo.ended_at
        assert segundo.rubric_evaluations.count() == 1
        assert len(avisos) == 1
    finally:
        intento_calificado.disconnect(receptor)


def test_incompleto_no_admite_decisiones(datos):
    from apps.simulation.services.cierre import cerrar_como_incompleto
    scene, _, _, _, intento = datos
    cerrar_como_incompleto(intento, "TIEMPO")
    response = scene["client"].post(f"/api/simulation/attempts/{intento.pk}/decisions", {"decision_option_id": scene["option"].pk, "request_id": "nueva"}, format="json")
    assert response.status_code == 400
    assert intento.events.filter(event_type="DECISION_SELECTED").count() == 1

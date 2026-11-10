import pytest

from apps.simulation.models import AuditLog, Rubric, SimulationAttempt, SimulationRubricAssignment
from apps.simulation.services.evaluacion import registrar_retroalimentacion_docente, retroalimentacion_docente_de
from shared.exceptions import ApiError

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-32")]


@pytest.fixture
def intento(scene):
    return SimulationAttempt.objects.create(student=scene["student"], case_version=scene["version"], current_node=scene["node"], attempt_token_hash="token")


def test_retro_vacia_400(scene, intento):
    with pytest.raises(ApiError) as error:
        registrar_retroalimentacion_docente(intento, scene["teacher"], "  ")
    assert (error.value.api_code, error.value.status_code) == ("FEEDBACK_EMPTY", 400)


def test_retro_se_guarda_y_se_actualiza(scene, intento):
    with pytest.raises(ApiError) as error:
        registrar_retroalimentacion_docente(intento, scene["teacher"], "Texto")
    assert (error.value.api_code, error.value.status_code) == ("RUBRIC_MISSING", 409)
    rubric = Rubric.objects.create(name="Rúbrica", created_by=scene["teacher"])
    SimulationRubricAssignment.objects.create(case_version=scene["version"], rubric=rubric)
    primera = registrar_retroalimentacion_docente(intento, scene["teacher"], " Primera ")
    segunda = registrar_retroalimentacion_docente(intento, scene["teacher"], "Segunda")
    assert primera.pk == segunda.pk
    assert segunda.origin == "DOCENTE"
    assert retroalimentacion_docente_de(intento) == "Segunda"
    assert intento.rubric_evaluations.count() == 1
    assert AuditLog.objects.filter(action="ATTEMPT_FEEDBACK_SAVED", resource_id=str(intento.pk)).count() == 2


def test_retro_mas_reciente_ignora_fechas_de_actualizacion_nulas(scene, intento):
    from apps.simulation.models import RubricEvaluation
    rubric = Rubric.objects.create(name="Rúbrica", created_by=scene["teacher"])
    SimulationRubricAssignment.objects.create(case_version=scene["version"], rubric=rubric)
    RubricEvaluation.objects.create(attempt=intento, rubric=rubric, instructor=scene["stranger"], origin="DOCENTE", comment="Anterior")
    registrar_retroalimentacion_docente(intento, scene["teacher"], "Reciente")
    assert retroalimentacion_docente_de(intento) == "Reciente"

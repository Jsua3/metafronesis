"""Las órdenes concurrentes se serializan por intento."""

import pytest
from rest_framework.test import APIClient

from apps.progression.models import StudentCaseCompletion
from apps.simulation.models import AttemptReport, AuditLog, ReflectionJournal, SimulationAttempt
from apps.simulation.services.audit_service import audit_purge_window
from shared.testing import run_concurrently
from .conftest import scene

pytestmark = pytest.mark.req("SF-22", "REGLA-004", "RNF-08")


@pytest.fixture
def intento_concurrencia(real_commits):
    datos = scene.__wrapped__()
    intento = SimulationAttempt.objects.create(student=datos["student"], case_version=datos["version"],
                                                current_node=datos["node"], attempt_token_hash="concurrencia-bitacora")
    yield {**datos, "intento": intento, "base": f"/api/simulation/attempts/{intento.pk}"}
    intento.delete()
    StudentCaseCompletion.objects.filter(student_id=datos["student"].pk, simulation_case_id=datos["case"].pk).delete()
    datos["assignment"].delete()
    datos["option"].delete()
    datos["node"].delete()
    datos["end"].delete()
    datos["version"].delete()
    datos["case"].delete()
    with audit_purge_window():
        AuditLog.objects.filter(actor_id__in=[datos["teacher"].pk, datos["student"].pk, datos["stranger"].pk]).delete()
    for usuario in (datos["teacher"], datos["student"], datos["stranger"]):
        usuario.delete()


def _enviar(datos, ruta, cuerpo):
    cliente = APIClient()
    cliente.force_authenticate(datos["student"])
    return cliente.post(datos["base"] + ruta, cuerpo, format="json")


def test_salidas_simultaneas_registran_un_solo_evento(intento_concurrencia):
    datos = intento_concurrencia
    primero, segundo = run_concurrently(
        lambda: _enviar(datos, "/safe-exit", {"reason": "Pausa"}),
        lambda: _enviar(datos, "/safe-exit", {"reason": "Pausa"}),
    )
    assert primero.error is None and segundo.error is None
    assert primero.value.status_code == segundo.value.status_code == 200
    assert datos["intento"].events.filter(event_type="SAFE_EXIT_REQUESTED").count() == 1


def test_cierre_concurrente_con_reflexion_no_deja_bitacora_abierta(intento_concurrencia):
    datos = intento_concurrencia
    reflexion, cierre = run_concurrently(
        lambda: _enviar(datos, "/reflections", {"nodeId": datos["node"].pk, "text": "Reflexión"}),
        lambda: _enviar(datos, "/decisions", {"decision_option_id": datos["option"].pk, "request_id": "cierre-carrera"}),
    )
    assert reflexion.error is None and cierre.error is None
    assert cierre.value.status_code == 200
    assert reflexion.value.status_code in (200, 400)
    assert not ReflectionJournal.objects.filter(attempt=datos["intento"], locked=False).exists()
    informe = AttemptReport.objects.get(attempt=datos["intento"]).report_json
    assert informe["reflectionsCount"] == ReflectionJournal.objects.filter(attempt=datos["intento"]).count()


@pytest.mark.req("RF-22", "RF-23", "CU-12")
def test_cierres_simultaneos_congelan_un_solo_informe(intento_concurrencia):
    datos = intento_concurrencia
    cuerpo = {"decision_option_id": datos["option"].pk, "request_id": "cierre-unico"}
    primero, segundo = run_concurrently(
        lambda: _enviar(datos, "/decisions", cuerpo),
        lambda: _enviar(datos, "/decisions", cuerpo),
    )
    assert primero.error is None and segundo.error is None
    assert primero.value.status_code == segundo.value.status_code == 200
    assert primero.value.data == segundo.value.data
    assert AttemptReport.objects.filter(attempt=datos["intento"]).count() == 1

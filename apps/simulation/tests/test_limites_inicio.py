import pytest
from django.utils import timezone
from datetime import timedelta

from apps.simulation.models import AttemptEvent, SimulationAttempt
from shared.exceptions import ApiError

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-40")]


@pytest.fixture
def registros(monkeypatch):
    from apps.simulation.services import limites, reglas_de_inicio

    monkeypatch.setattr(limites, "_fuentes", [])
    monkeypatch.setattr(reglas_de_inicio, "_reglas", [])
    return reglas_de_inicio, limites


def iniciar(scene):
    return scene["client"].post(
        "/api/simulation/attempts", {"case_version_id": scene["version"].pk}, format="json"
    )


def test_una_regla_registrada_niega_el_inicio(scene, registros):
    reglas, _ = registros

    def negar(estudiante, version):
        assert estudiante == scene["student"] and version == scene["version"]
        raise ApiError("INICIO_DENEGADO", "Inicio denegado", 403)

    reglas.registrar(negar)
    respuesta = iniciar(scene)
    assert respuesta.status_code == 403
    assert respuesta.data["code"] == "INICIO_DENEGADO"
    assert not SimulationAttempt.objects.exists()


def test_sin_reglas_inicia_como_antes(scene, registros):
    assert iniciar(scene).status_code == 201


@pytest.mark.parametrize("metodo", ["get", "post"])
def test_vencido_el_tiempo_se_cierra_incompleto(scene, registros, metodo):
    _, limites = registros
    intento = SimulationAttempt.objects.get(pk=iniciar(scene).data["id"])
    intento.active_seconds = 61
    intento.save(update_fields=["active_seconds"])
    limites.registrar(lambda intento: 3)
    limites.registrar(lambda intento: None)
    limites.registrar(lambda intento: 1)
    ruta = f"/api/simulation/attempts/{intento.pk}"
    if metodo == "post":
        respuesta = scene["client"].post(ruta + "/decisions", {"decision_option_id": scene["option"].pk, "request_id": "nueva"}, format="json")
    else:
        respuesta = scene["client"].get(ruta)
    assert respuesta.status_code == 409
    assert respuesta.data["code"] == "ATTEMPT_TIME_EXPIRED"
    intento.refresh_from_db()
    assert intento.status == "INCOMPLETE"
    assert intento.events.filter(event_type="ATTEMPT_EXPIRED", detail="TIEMPO").count() == 1


def test_las_respuestas_se_conservan_al_vencer(scene, registros):
    _, limites = registros
    intento = SimulationAttempt.objects.get(pk=iniciar(scene).data["id"])
    evento = AttemptEvent.objects.create(attempt=intento, node=scene["node"], decision_option=scene["option"], event_type="DECISION_SELECTED", detail='{"response_class": "RECOMMENDED"}')
    intento.active_seconds = 61
    intento.save(update_fields=["active_seconds"])
    limites.registrar(lambda intento: 1)
    respuesta = scene["client"].get(f"/api/simulation/attempts/{intento.pk}")
    assert respuesta.status_code == 409
    assert AttemptEvent.objects.filter(pk=evento.pk, decision_option=scene["option"]).exists()
    assert intento.evaluation.snapshot["evidence"]


def test_el_intervalo_actual_cuenta_al_decidir(scene, registros):
    _, limites = registros
    intento = SimulationAttempt.objects.get(pk=iniciar(scene).data["id"])
    intento.last_activity_at = timezone.now() - timedelta(seconds=61)
    intento.save(update_fields=["last_activity_at"])
    limites.registrar(lambda intento: 1)
    respuesta = scene["client"].post(f"/api/simulation/attempts/{intento.pk}/decisions", {"decision_option_id": scene["option"].pk, "request_id": "nueva"}, format="json")
    assert respuesta.status_code == 409
    intento.refresh_from_db()
    assert intento.status == "INCOMPLETE"
    assert intento.active_seconds >= 61

from datetime import timedelta

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from apps.grupos.models import CaseAssignment
from apps.simulation.models import AuditLog, SimulationAttempt, SimulationCase
from apps.simulation.services import attempt_api
from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR


@pytest.mark.django_db
@pytest.mark.req("SIEP-29")
def test_ficha_publicada_sin_justificaciones(scene):
    version, client = scene["version"], scene["client"]
    respuesta = client.get(f"/api/simulation/cases/{version.pk}/brief")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["title"] == scene["case"].title
    assert "Explicación" not in str(respuesta.data)
    client.force_authenticate(scene["stranger"])
    assert client.get(f"/api/simulation/cases/{version.pk}/brief").status_code == 404


@pytest.mark.django_db
@pytest.mark.req("SIEP-29")
def test_intento_activo_propio(scene):
    version, client = scene["version"], scene["client"]
    intento, _ = attempt_api.start(scene["student"], version.pk)
    respuesta = client.get(f"/api/simulation/cases/{version.pk}/active-attempt")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["attemptId"] == str(intento.pk)
    client.force_authenticate(scene["stranger"])
    assert client.get(f"/api/simulation/cases/{version.pk}/active-attempt").status_code == 404


@pytest.mark.django_db
@pytest.mark.req("SIEP-29")
def test_historial_solo_propio(scene):
    intento, _ = attempt_api.start(scene["student"], scene["version"].pk)
    SimulationAttempt.objects.create(student=scene["stranger"], case_version=scene["version"],
        current_node=scene["node"], attempt_token_hash="otro")
    respuesta = scene["client"].get("/api/simulation/attempts/history")
    assert respuesta.status_code == 200
    assert [fila["attemptId"] for fila in respuesta.data["data"]] == [str(intento.pk)]


@pytest.mark.django_db
@pytest.mark.req("SIEP-29")
def test_purga_respeta_retencion_y_simulacion(settings):
    settings.AUDIT_RETENTION_DAYS = 360
    ahora = timezone.now()
    viejo = AuditLog.objects.create(action="TEST", retention_until=ahora - timedelta(days=1))
    reciente = AuditLog.objects.create(action="TEST", retention_until=ahora + timedelta(days=360))
    AuditLog.objects.filter(pk=viejo.pk).update(occurred_at=ahora - timedelta(days=361))
    call_command("purge_audit_logs", "--dry-run")
    assert AuditLog.objects.filter(pk=viejo.pk).exists()
    call_command("purge_audit_logs")
    assert not AuditLog.objects.filter(pk=viejo.pk).exists()
    assert AuditLog.objects.filter(pk=reciente.pk).exists()

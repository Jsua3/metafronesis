"""Se ejecuta en PostgreSQL en CI; SQLite no demuestra bloqueo de filas."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import pytest
from django.db import connection, close_old_connections
from rest_framework.test import APIClient
from apps.simulation.models import SimulationAttempt

pytestmark = pytest.mark.django_db(transaction=True)


def parallel(student, request):
    barrier = Barrier(2)

    def run(_):
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(student)
            barrier.wait(timeout=10)
            return request(client)
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        return list(pool.map(run, range(2)))


def test_concurrent_start_creates_one_open_attempt(scene):
    if connection.vendor != "postgresql":
        pytest.skip("Requiere SELECT FOR UPDATE de PostgreSQL")
    responses = parallel(
        scene["student"],
        lambda client: client.post(
            "/api/simulation/attempts", {"case_version_id": scene["version"].pk}, format="json"
        ),
    )
    assert sorted(r.status_code for r in responses) == [200, 201]
    assert SimulationAttempt.objects.count() == 1
    assert responses[0].data["id"] == responses[1].data["id"]


def test_concurrent_decision_applies_once(scene):
    if connection.vendor != "postgresql":
        pytest.skip("Requiere SELECT FOR UPDATE de PostgreSQL")
    attempt = (
        scene["client"]
        .post("/api/simulation/attempts", {"case_version_id": scene["version"].pk}, format="json")
        .data["id"]
    )
    responses = parallel(
        scene["student"],
        lambda client: client.post(
            "/api/simulation/attempts/" + attempt + "/decisions",
            {"decision_option_id": scene["option"].pk, "request_id": "same-command"},
            format="json",
        ),
    )
    assert all(r.status_code == 200 for r in responses)
    assert responses[0].data == responses[1].data
    assert (
        SimulationAttempt.objects.get().events.filter(request_id="same-command").count()
        == 1
    )

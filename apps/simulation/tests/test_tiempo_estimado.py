import pytest

from apps.simulation.models import CaseVersion, SimulationCase
from apps.users.models import CustomUser

pytestmark = pytest.mark.django_db


def _version(**campos):
    autor = CustomUser.objects.create_user(email="autor@example.test", password="test-only", role="PROFESOR")
    caso = SimulationCase.objects.create(code="TIEMPO", title="Tiempo", created_by=autor)
    return CaseVersion.objects.create(simulation_case=caso, semantic_version="1.0.0", created_by=autor, **campos)


@pytest.mark.req("SIEP-22")
def test_la_version_guarda_el_tiempo_estimado():
    version = _version(estimated_minutes=45)
    version.refresh_from_db()
    assert version.estimated_minutes == 45


def test_sin_tiempo_estimado_queda_nulo():
    version = _version()
    version.refresh_from_db()
    assert version.estimated_minutes is None

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.models import CaseVersion, SimulationCase
from shared.policies import PROFESOR


@pytest.fixture
def caso_publicado(db):
    autor = get_user_model().objects.create_user(
        email="autor_caso_grupos@example.test", password="test-only", role=PROFESOR
    )
    caso = SimulationCase.objects.create(code="SIM-VBG-001", title="Caso de prueba", created_by=autor)
    return CaseVersion.objects.create(
        simulation_case=caso, semantic_version="1.0.0", status="PUBLISHED", created_by=autor
    )

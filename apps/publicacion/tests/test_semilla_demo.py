import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.grupos.models import CaseAssignment
from apps.publicacion.huella import huella_de
from apps.simulation.models import SimulationCase
from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR

@pytest.mark.django_db
@pytest.mark.req("SIEP-29")
def test_semilla_demo_exige_autorizacion_y_crea_caso(monkeypatch):
    monkeypatch.delenv("SIEP_ALLOW_DEMO_SEED", raising=False)
    with pytest.raises(CommandError):
        call_command("seed_demo_caso")
    monkeypatch.setenv("SIEP_ALLOW_DEMO_SEED", "1")
    estudiante = CustomUser.objects.create_user(email="estudiante@psychosim.edu.co", password="x", role=ESTUDIANTE)
    CustomUser.objects.create_user(email="profesora@psychosim.edu.co", password="x", role=PROFESOR)
    call_command("seed_demo_caso")
    call_command("seed_demo_caso")
    version = SimulationCase.objects.get(code="DEMO").versions.get(status="PUBLISHED")
    assert version.definition_hash == huella_de(version)
    assert version.rubric_assignments.filter(active=True, rubric__criteria__weight=100).exists()
    assert CaseAssignment.objects.filter(case_version=version, estudiante=estudiante, active=True).exists()
    assert version.nodes.filter(start_node=True).exists()

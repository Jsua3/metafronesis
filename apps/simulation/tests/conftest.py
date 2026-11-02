import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from apps.users.models import CustomUser
from apps.grupos.models import CaseAssignment
from apps.simulation.models import (
    SimulationCase,
    CaseVersion,
    SimulationNode,
    DecisionOption,
)


@pytest.fixture
def scene():
    teacher = CustomUser.objects.create_user(
        email="teacher@example.test", password="test-only", role="PROFESOR"
    )
    student = CustomUser.objects.create_user(
        email="student@example.test", password="test-only"
    )
    stranger = CustomUser.objects.create_user(
        email="stranger@example.test", password="test-only"
    )
    case = SimulationCase.objects.create(
        code="TEST", title="Prueba", created_by=teacher
    )
    version = CaseVersion.objects.create(
        simulation_case=case,
        semantic_version="1.0.0",
        status="PUBLISHED",
        created_by=teacher,
        validated_at=timezone.now(),
        definition_hash="sha256:" + "a" * 64,
    )
    node = SimulationNode.objects.create(
        case_version=version,
        node_key="start",
        title="Inicio",
        narrative="Inicio",
        start_node=True,
    )
    end = SimulationNode.objects.create(
        case_version=version,
        node_key="end",
        title="Fin",
        narrative="Fin",
        terminal_node=True,
    )
    option = DecisionOption.objects.create(
        case_version=version,
        source_node=node,
        target_node=end,
        option_key="finish",
        text="Terminar",
        response_class="RECOMMENDED",
        immediate_feedback="Explicación",
    )
    assignment = CaseAssignment.objects.create(case_version=version, estudiante=student)
    client = APIClient()
    client.force_authenticate(student)
    return locals()

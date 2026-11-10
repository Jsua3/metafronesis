import pytest
from rest_framework.test import APIClient
from apps.users.models import CustomUser
from apps.simulation.models import (SimulationCase, CaseVersion, SimulationNode, DecisionOption,
    Rubric, RubricCriterion, SimulationRubricAssignment)
from shared.policies import PROFESOR


@pytest.fixture
def caso(db):
    autor = CustomUser.objects.create_user(email='autor@example.test', password='test-only', role=PROFESOR)
    caso = SimulationCase.objects.create(code='CASO', title='Caso', created_by=autor)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version='1.0.0', created_by=autor, estimated_minutes=45)
    inicio = SimulationNode.objects.create(case_version=version, node_key='inicio', title='Inicio', narrative='Inicio', start_node=True, decision_prompt='¿Qué hacer?')
    fin = SimulationNode.objects.create(case_version=version, node_key='fin', title='Fin', narrative='Fin', terminal_node=True)
    opciones = [DecisionOption.objects.create(case_version=version, source_node=inicio, target_node=fin, option_key=f'opcion-{i}', text='Opción', response_class=clase, feedback_text='Explicación', theory_basis='Fundamento') for i, clase in enumerate(('RECOMMENDED', 'ACCEPTABLE'))]
    rubrica = Rubric.objects.create(name='Rúbrica', created_by=autor)
    criterio = RubricCriterion.objects.create(rubric=rubrica, competency='C', title='Criterio', weight=100)
    asignacion = SimulationRubricAssignment.objects.create(case_version=version, rubric=rubrica, assigned_by=autor)
    cliente = APIClient()
    cliente.force_authenticate(autor)
    return locals()

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.models import CaseVersion, SimulationAttempt, SimulationNode
from apps.grupos.assignment_service import assignment_dto, list_assignments


@pytest.mark.django_db
def test_avance_por_estudiante_y_permisos(caso_publicado):
    users = get_user_model().objects
    teacher = users.create_user(email='g2b-docente@example.test', password='test-only', role='PROFESOR')
    other = users.create_user(email='g2b-otro@example.test', password='test-only', role='PROFESOR')
    admin = users.create_user(email='g2b-admin@example.test', password='test-only', role='ADMIN')
    students = [users.create_user(email=f'g2b-{i}@example.test', password='test-only', role='ESTUDIANTE') for i in range(4)]
    group = Grupo.objects.create(nombre='Grupo', codigo='G2B', profesor=teacher)
    for i, student in enumerate(students):
        GrupoEstudiante.objects.create(grupo=group, estudiante=student, status=MembershipStatus.INVITED if i == 3 else MembershipStatus.ACTIVE)
    CaseAssignment.objects.create(grupo=group, case_version=caso_publicado, assigned_by=teacher)
    node = SimulationNode.objects.create(case_version=caso_publicado, node_key='start', title='Inicio', narrative='Inicio', start_node=True)
    for i, (student, state, rehearsal) in enumerate([(students[0], 'COMPLETED', False), (students[0], 'IN_PROGRESS', False), (students[1], 'PAUSED', False), (students[2], 'COMPLETED', True), (students[3], 'COMPLETED', False)]):
        SimulationAttempt.all_objects.create(student=student, case_version=caso_publicado, current_node=node, status=state, is_rehearsal=rehearsal, attempt_token_hash=f'g2b-{i}')
    client = APIClient()
    for actor in (teacher, admin):
        client.force_authenticate(actor)
        response = client.get('/api/assignments', {'groupId': group.id})
        assert response.status_code == 200
        assert response.data['data'][0]['progress'] == {'students': 3, 'completed': 1, 'inProgress': 1}
    for actor in (other, students[0]):
        client.force_authenticate(actor)
        assert client.get('/api/assignments', {'groupId': group.id}).status_code in (403, 404)

    client.force_authenticate(teacher)
    recent = client.get('/api/instructor/attempts/recent', {'groupId': group.id, 'caseVersionId': caso_publicado.id})
    assert recent.status_code == 200
    assert len(recent.data['data']) == 3  # excluye la invitación y el ensayo
    client.force_authenticate(other)
    assert client.get('/api/instructor/attempts/recent', {'groupId': group.id, 'caseVersionId': caso_publicado.id}).status_code == 404

    with CaptureQueriesContext(connection) as one:
        [assignment_dto(row) for row in list_assignments(teacher, group.id)]
    version2 = CaseVersion.objects.create(simulation_case=caso_publicado.simulation_case, semantic_version='2.0.0', status='PUBLISHED', created_by=teacher)
    CaseAssignment.objects.create(grupo=group, case_version=version2, assigned_by=teacher, active=False)
    with CaptureQueriesContext(connection) as two:
        result = [assignment_dto(row) for row in list_assignments(teacher, group.id)]
    assert len(one) == len(two) == 2
    assert result[1]['progress'] == {'students': 3, 'completed': 0, 'inProgress': 0}

    # El resumen del listado suma oportunidades de persona y caso, sin contar ensayos ni invitados.
    client.force_authenticate(teacher)
    with CaptureQueriesContext(connection) as first:
        response = client.get('/api/grupos')
    assert response.data['data'][0]['resumenCasos'] == {'asignados': 2, 'terminados': 1, 'oportunidades': 6}
    second_group = Grupo.objects.create(nombre='Otro', codigo='G6', profesor=teacher)
    CaseAssignment.objects.create(grupo=second_group, case_version=caso_publicado, assigned_by=teacher)
    with CaptureQueriesContext(connection) as second:
        response = client.get('/api/grupos')
    assert len(first) == len(second) == 3  # grupos, membresías y agregado de asignaciones
    assert next(g for g in response.data['data'] if g['id'] == second_group.id)['resumenCasos'] == {'asignados': 1, 'terminados': 0, 'oportunidades': 0}
    client.force_authenticate(admin)
    assert next(g for g in client.get('/api/grupos').data['data'] if g['id'] == group.id)['resumenCasos']['asignados'] == 2
    client.force_authenticate(other)
    assert all(g['id'] != group.id for g in client.get('/api/grupos').data['data'])
    client.force_authenticate(students[0])
    assert client.get('/api/grupos').status_code == 403

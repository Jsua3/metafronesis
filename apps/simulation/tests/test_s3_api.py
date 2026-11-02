from datetime import timedelta
import pytest
from django.utils import timezone
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient
from apps.users.models import CustomUser
from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.simulation.models import SimulationCase, CaseVersion, SimulationNode, SimulationAttempt, DecisionOption

pytestmark = pytest.mark.django_db

@pytest.fixture
def scene():
    teacher = CustomUser.objects.create_user(email='teacher@example.test', password='test-only', role='PROFESOR')
    student = CustomUser.objects.create_user(email='student@example.test', password='test-only')
    stranger = CustomUser.objects.create_user(email='stranger@example.test', password='test-only')
    case = SimulationCase.objects.create(code='TEST', title='Prueba', created_by=teacher)
    version = CaseVersion.objects.create(simulation_case=case, semantic_version='1.0.0', status='PUBLISHED', created_by=teacher, validated_at=timezone.now(), definition_hash='sha256:'+'a'*64)
    node = SimulationNode.objects.create(case_version=version, node_key='start', title='Inicio', narrative='Inicio', start_node=True)
    end = SimulationNode.objects.create(case_version=version, node_key='end', title='Fin', narrative='Fin', terminal_node=True)
    option = DecisionOption.objects.create(case_version=version, source_node=node, target_node=end, option_key='finish', text='Terminar', response_class='RECOMMENDED', immediate_feedback='Explicación')
    assignment = CaseAssignment.objects.create(case_version=version, estudiante=student)
    client = APIClient()
    client.force_authenticate(student)
    return locals()


def start(s):
    return s['client'].post('/api/attempts', {'case_version_id':s['version'].pk}, format='json')


def test_anonymous_cannot_read_or_start():
    c = APIClient()
    assert c.get('/api/cases').status_code in (401,403)
    assert c.post('/api/attempts', {}).status_code in (401,403)


def test_start_is_idempotent_and_owner_only(scene):
    a,b=start(scene),start(scene)
    assert (a.status_code,b.status_code)==(201,200)
    assert a.data['id']==b.data['id']
    assert SimulationAttempt.objects.count()==1
    assert 'attempt_token_hash' not in a.data
    scene['client'].force_authenticate(scene['stranger'])
    assert scene['client'].get('/api/attempts/'+a.data['id']).status_code==404

@pytest.mark.parametrize('change', ['inactive','expired','future','draft','case_inactive'])
def test_unavailable_assignment_denies_start(scene,change):
    a=scene['assignment'];v=scene['version']
    if change=='inactive':a.active=False
    if change=='expired':a.closes_at=timezone.now()-timedelta(seconds=1)
    if change=='future':a.opens_at=timezone.now()+timedelta(days=1)
    if change=='draft':v.status='DRAFT';v.save()
    if change=='case_inactive':scene['case'].active=False;scene['case'].save()
    a.save()
    assert start(scene).status_code==404
    assert scene['client'].get('/api/cases').data==[]


def test_revocation_rechecked_on_reads_and_commands(scene):
    a=start(scene).data
    scene['assignment'].active=False;scene['assignment'].save()
    url='/api/attempts/'+a['id']
    assert scene['client'].get(url).status_code==404
    assert scene['client'].post(url+'/pause').status_code==404


def test_group_requires_active_membership(scene):
    scene['assignment'].delete()
    group=Grupo.objects.create(nombre='Grupo',codigo='G',profesor=scene['teacher'])
    membership=GrupoEstudiante.objects.create(grupo=group,estudiante=scene['student'],status='INVITED')
    CaseAssignment.objects.create(case_version=scene['version'],grupo=group)
    assert start(scene).status_code==404
    membership.status='ACTIVE';membership.save()
    assert start(scene).status_code==201


def test_teacher_creation_student_denied_and_other_teacher_hidden(scene):
    assert scene['client'].post('/api/cases',{'code':'NEW','title':'Nuevo'}).status_code==403
    scene['client'].force_authenticate(scene['teacher'])
    r=scene['client'].post('/api/cases',{'code':'NEW','title':'Nuevo'},format='json')
    assert r.status_code==201
    scene['stranger'].role='PROFESOR';scene['stranger'].save()
    scene['client'].force_authenticate(scene['stranger'])
    assert scene['client'].get('/api/cases/'+str(r.data['id'])).status_code==404


def test_pause_resume_replace_and_invalid_transition(scene):
    url='/api/attempts/'+start(scene).data['id']
    assert scene['client'].post(url+'/pause').data['status']=='PAUSED'
    assert scene['client'].post(url+'/pause').status_code==400
    assert scene['client'].post(url+'/resume').data['status']=='IN_PROGRESS'
    assert scene['client'].post(url+'/replace').data['status']=='REPLACED'
    assert scene['client'].post(url+'/resume').status_code==400
    assert start(scene).status_code==201


def test_decision_completion_replay_and_conflicting_key(scene):
    url='/api/attempts/'+start(scene).data['id']+'/decisions'
    data={'decision_option_id':scene['option'].pk,'request_id':'unique-command'}
    first=scene['client'].post(url,data,format='json')
    replay=scene['client'].post(url,data,format='json')
    assert first.status_code==replay.status_code==200
    assert first.data==replay.data
    assert first.data['status']=='COMPLETED'
    assert SimulationAttempt.objects.get().events.filter(request_id='unique-command').count()==1
    data['decision_option_id']+=100
    assert scene['client'].post(url,data,format='json').status_code==400


def test_decisions_denied_while_paused(scene):
    url='/api/attempts/'+start(scene).data['id']
    scene['client'].post(url+'/pause')
    r=scene['client'].post(url+'/decisions',{'decision_option_id':scene['option'].pk,'request_id':'x'},format='json')
    assert r.status_code==400
    assert not SimulationAttempt.objects.get().events.filter(request_id='x').exists()


def test_database_prevents_two_open_attempts(scene):
    start(scene)
    with pytest.raises(IntegrityError), transaction.atomic():
        SimulationAttempt.objects.create(student=scene['student'],case_version=scene['version'],current_node=scene['node'],attempt_token_hash='other')


def test_session_authentication_and_csrf(scene):
    client=APIClient(enforce_csrf_checks=True)
    assert client.login(email='student@example.test', password='test-only')
    assert client.get('/api/cases').status_code==200
    assert client.post('/api/attempts',{'case_version_id':scene['version'].pk},format='json').status_code==403


def test_missing_publication_seal_blocks_start(scene):
    version=scene['version'];version.validated_at=None;version.definition_hash=None;version.save()
    assert start(scene).status_code==404


def test_missing_or_ambiguous_start_rolls_back(scene):
    node=scene['node'];node.start_node=False;node.save()
    assert start(scene).status_code==400
    assert SimulationAttempt.objects.count()==0


def test_decision_from_other_node_cannot_change_attempt(scene):
    result=start(scene)
    scene['option'].source_node=scene['end'];scene['option'].save()
    response=scene['client'].post('/api/attempts/'+result.data['id']+'/decisions',{'decision_option_id':scene['option'].pk,'request_id':'bad'},format='json')
    assert response.status_code==404
    assert SimulationAttempt.objects.get().current_node_id==scene['node'].pk

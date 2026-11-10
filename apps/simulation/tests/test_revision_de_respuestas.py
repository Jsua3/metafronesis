import json

import pytest

from apps.simulation.models import DecisionOption, SimulationNode, Rubric, RubricCriterion, SimulationRubricAssignment
from .test_s3_api import start
from .test_s4_engine import choose

pytestmark = pytest.mark.django_db


def preparar(scene):
    medio = SimulationNode.objects.create(case_version=scene['version'], node_key='medio', title='Medio', narrative='Medio')
    scene['option'].target_node = medio
    scene['option'].effects = json.dumps({'persona': {'bond': 1}, 'competencies': ['CARE']})
    scene['option'].save()
    cambio = DecisionOption.objects.create(case_version=scene['version'], source_node=scene['node'], target_node=medio, option_key='cambio', text='Cambio', response_class='ACCEPTABLE', effects=json.dumps({'persona': {'bond': -1}, 'competencies': ['CARE']}))
    final = DecisionOption.objects.create(case_version=scene['version'], source_node=medio, target_node=scene['end'], option_key='final', text='Final', response_class='RECOMMENDED')
    rubrica = Rubric.objects.create(name='Rúbrica', created_by=scene['teacher'])
    RubricCriterion.objects.create(rubric=rubrica, competency='CARE', title='Cuidado', weight=100)
    SimulationRubricAssignment.objects.create(case_version=scene['version'], rubric=rubrica)
    return medio, cambio, final


def post(scene, intento, opcion, solicitud):
    return scene['client'].post(f'/api/simulation/attempts/{intento}/decisions', {'decision_option_id': opcion.pk, 'request_id': solicitud}, format='json')


@pytest.mark.req('SIEP-27')
def test_volver_y_cambiar_usa_la_ultima_respuesta(scene):
    medio, cambio, final = preparar(scene)
    intento = start(scene).data['id']
    assert choose(scene, intento).status_code == 200
    respuesta = scene['client'].post(f'/api/simulation/attempts/{intento}/revisit', {'nodeId': scene['node'].pk}, format='json')
    assert respuesta.status_code == 200
    assert post(scene, intento, cambio, 'cambio').status_code == 200
    assert post(scene, intento, final, 'final').status_code == 200
    objeto = scene['student'].simulationattempt_set.get(pk=intento)
    assert objeto.state_json['persona']['bond'] == -1
    assert objeto.events.filter(event_type='DECISION_CHANGED').count() == 1
    resultado = scene['client'].get(f'/api/simulation/attempts/{intento}/result').data['data']
    assert [d['option'] for d in resultado['decisions']] == ['Cambio', 'Final']
    assert resultado['evaluation']['counts']['recommended'] == 1
    assert resultado['evaluation']['counts']['acceptable'] == 1
    assert str(resultado['rubric']['total']) == '3.00'


@pytest.mark.req('SIEP-27')
def test_no_se_vuelve_a_escena_no_visitada_400(scene):
    medio, _, _ = preparar(scene)
    intento = start(scene).data['id']
    assert scene['client'].post(f'/api/simulation/attempts/{intento}/revisit', {'nodeId': medio.pk}, format='json').status_code == 400


@pytest.mark.req('SIEP-27')
def test_no_se_vuelve_con_intento_terminado_409(scene):
    intento = start(scene).data['id']
    choose(scene, intento)
    assert scene['client'].post(f'/api/simulation/attempts/{intento}/revisit', {'nodeId': scene['node'].pk}, format='json').status_code == 409


@pytest.mark.req('SIEP-28')
def test_progreso_cuenta_respuestas(scene):
    medio, cambio, _ = preparar(scene)
    intento = start(scene).data['id']
    choose(scene, intento)
    url = f'/api/simulation/attempts/{intento}'
    datos = scene['client'].get(url + '/progress').data['data']
    assert datos == {'answered': 1, 'total': 2, 'percent': 50, 'visitedNodes': [scene['node'].pk]}
    scene['client'].post(url + '/revisit', {'nodeId': scene['node'].pk}, format='json')
    post(scene, intento, cambio, 'cambio')
    assert scene['client'].get(url + '/progress').data['data'] == datos

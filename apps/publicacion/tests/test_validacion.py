import pytest

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-26")]


def codigos(caso):
    from apps.publicacion.arbol import arbol_de
    return {p.code for p in arbol_de(caso['version']).problemas()}


def test_case_no_start(caso):
    caso['inicio'].start_node = False
    caso['inicio'].save()
    assert 'CASE_NO_START' in codigos(caso)


def test_case_multiple_start(caso):
    caso['fin'].start_node = True
    caso['fin'].save()
    assert 'CASE_MULTIPLE_START' in codigos(caso)


def test_case_no_terminal(caso):
    caso['fin'].terminal_node = False
    caso['fin'].save()
    assert 'CASE_NO_TERMINAL' in codigos(caso)


def test_case_no_rubric(caso):
    caso['asignacion'].active = False
    caso['asignacion'].save()
    assert 'CASE_NO_RUBRIC' in codigos(caso)


def test_rubric_weights(caso):
    caso['criterio'].weight = 50
    caso['criterio'].save()
    assert 'RUBRIC_WEIGHTS' in codigos(caso)


def test_case_no_time(caso):
    caso['version'].estimated_minutes = 0
    caso['version'].save()
    assert 'CASE_NO_TIME' in codigos(caso)


def test_node_no_question(caso):
    caso['inicio'].decision_prompt = '  '
    caso['inicio'].save()
    assert 'NODE_NO_QUESTION' in codigos(caso)


def test_node_few_options(caso):
    caso['opciones'][1].delete()
    assert 'NODE_FEW_OPTIONS' in codigos(caso)


def test_node_no_recommended(caso):
    caso['opciones'][0].response_class = 'RISKY'
    caso['opciones'][0].save()
    assert 'NODE_NO_RECOMMENDED' in codigos(caso)


def test_option_no_justification(caso):
    caso['opciones'][0].feedback_text = ' '
    caso['opciones'][0].theory_basis = None
    caso['opciones'][0].save()
    assert 'OPTION_NO_JUSTIFICATION' in codigos(caso)


def test_caso_completo_es_valido(caso):
    respuesta = caso['cliente'].post(f"/api/authoring/cases/{caso['version'].pk}/validate", {}, format='json')
    assert respuesta.status_code == 200
    assert respuesta.data['data'] == {'valid': True, 'problems': []}


def test_arbol_con_consultas_constantes(caso, django_assert_max_num_queries):
    from apps.publicacion.arbol import arbol_de
    from apps.simulation.models import SimulationNode, DecisionOption
    for i in range(5):
        escena = SimulationNode.objects.create(case_version=caso['version'], node_key=f'extra-{i}', title='Extra', narrative='Extra', terminal_node=True)
        DecisionOption.objects.create(case_version=caso['version'], source_node=escena, target_node=caso['fin'], option_key=f'extra-{i}', text='Opcion', response_class='ACCEPTABLE', feedback_text='Justificacion')
    with django_assert_max_num_queries(4):
        arbol_de(caso['version']).problemas()


def test_huella_cambia_con_el_contenido(caso):
    from apps.publicacion.huella import huella_de
    antes = huella_de(caso['version'])
    assert antes == huella_de(caso['version'])
    caso['inicio'].narrative = 'Otra narrativa'
    caso['inicio'].save()
    assert huella_de(caso['version']) != antes


def test_validacion_de_caso_ajeno_404(caso):
    otro = CustomUser.objects.create_user(email='otro@example.test', password='test-only', role=PROFESOR)
    caso['cliente'].force_authenticate(otro)
    respuesta = caso['cliente'].post(f"/api/authoring/cases/{caso['version'].pk}/validate", {}, format='json')
    assert respuesta.status_code == 404

from apps.users.models import CustomUser
from shared.policies import PROFESOR

def test_respuesta_invalida_incluye_problemas(caso):
    caso['inicio'].decision_prompt = ''
    caso['inicio'].save()
    respuesta = caso['cliente'].post(f"/api/authoring/cases/{caso['version'].pk}/validate", {}, format='json')
    assert respuesta.status_code == 200
    assert respuesta.data['data']['valid'] is False
    assert any(p['code'] == 'NODE_NO_QUESTION' and p['where'] and p['message'] for p in respuesta.data['data']['problems'])


def test_estudiante_no_valida(caso):
    estudiante = CustomUser.objects.create_user(email='estudiante@example.test', password='test-only')
    caso['cliente'].force_authenticate(estudiante)
    assert caso['cliente'].post(f"/api/authoring/cases/{caso['version'].pk}/validate", {}, format='json').status_code == 403

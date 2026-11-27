"""El caso insignia lineal SIM-VBG-002 se publica, se recorre por la API y cada final sale de lo que se hizo.

El diseño está en docs/diseno/caso-insignia-lineal.md. Cada recorrido elige una opción por escena; una respuesta riesgosa
o inadecuada se envía dos veces, porque con segunda oportunidad la primera no cuenta.
"""

import json
from pathlib import Path

import pytest
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment
from apps.publicacion import ciclo
from apps.publicacion.huella import huella_de
from apps.simulation.casedef.escritor_insignia import ErrorDeCarga
from apps.simulation.casedef.insignia import cargar, traducir
from apps.simulation.models import AttemptEvaluation, AttemptWorldState, Rubric, RubricCriterion, SimulationAttempt
from apps.simulation.services import limites, rubricas
from apps.users.models import CustomUser

pytestmark = [pytest.mark.django_db, pytest.mark.req('RF-07', 'RF-11', 'RF-17', 'RF-19', 'RF-21')]
RUTA = Path(__file__).parents[1] / 'data/casos/SIM-VBG-002.dsl.json'

# La mejor respuesta de cada escena, en el orden de la historia.
MEJOR = {
    'c1-entrada': 'n1-mirar-y-presentarse', 'c1-sala-espera': 'h1-pap-contencion', 'c1-enfermeria': 'n3-una-sola-voz',
    'c1-lugar-para-hablar': 'n2-sala-escucha', 'c2-antes-de-decir': 'n4-percepcion', 'c2-tras-el-silencio': 'n5-silencio-validar',
    'c2-pasillo': 'n6-conectar', 'c2-la-llamada': 'll-reservar', 'c2-marco-hospital': 'o2-459-1257', 'c2-plan': 'o3-integral',
    'c2-habitacion': 'n7-verdad-cuidada', 'c2-entrega-ruta': 'ru-ruta-activada', 'c2-informe': 'in-completo',
    'c3-recepcion': 'o4-proteccion', 'c3-consultorio-relato': 'v-desde-informe', 'c3-despacho-marco': 'o5-2126-1098-1257',
    'c3-pasillo': 'n9-acompanar', 'c3-sala-espera': 'n10-valorar-red', 'c3-despacho-actuacion': 'o6-integral',
    'c3-bitacora': 'bi-reflexion',
}


@pytest.fixture
def version():
    autor = CustomUser.objects.create_user(email='docente@example.test', password='prueba', role='PROFESOR')
    admin = CustomUser.objects.create_user(email='admin@example.test', password='prueba', role='ADMIN')
    version = cargar(traducir(json.loads(RUTA.read_text(encoding='utf-8'))), autor)
    assert version.status == 'DRAFT'
    version.estimated_minutes = 40
    version.save(update_fields=['estimated_minutes'])
    rubrica = Rubric.objects.create(name='Atención inicial', created_by=autor)
    RubricCriterion.objects.create(rubric=rubrica, competency='CARE', title='Cuidado', weight=100)
    rubricas.asociar_a_version(autor, rubrica.pk, version.pk)
    ciclo.enviar_a_revision(autor, version.pk)
    return ciclo.publicar(admin, version.pk)


def _iniciar(version):
    estudiante = CustomUser.objects.create_user(email='estudiante@example.test', password='prueba')
    CaseAssignment.objects.create(case_version=version, estudiante=estudiante)
    cliente = APIClient()
    cliente.force_authenticate(estudiante)
    creado = cliente.post('/api/simulation/attempts', {'case_version_id': version.pk}, format='json')
    assert creado.status_code == 201, creado.content
    intento = SimulationAttempt.objects.get(pk=creado.json()['id'])
    return cliente, f'/api/simulation/attempts/{intento.pk}', intento


def _avanzar(cliente, base, intento, hasta, cambios):
    for _ in MEJOR:
        nodo = intento.current_node
        if nodo.node_key == hasta or nodo.terminal_node:
            break
        assert cliente.get(base + '/world').status_code == 200
        opcion = nodo.options.get(option_key=cambios.get(nodo.node_key, MEJOR[nodo.node_key]))
        for vez in range(2):
            respuesta = cliente.post(base + '/decisions', {'decision_option_id': opcion.pk, 'request_id': f'{nodo.node_key}-{vez}'},
                                     format='json')
            assert respuesta.status_code == 200, (nodo.node_key, respuesta.content)
            if not respuesta.json()['retry_required']:
                break
        intento.refresh_from_db()
        assert intento.current_node_id != nodo.pk
    if hasta:
        assert intento.current_node.node_key == hasta


def _jugar(version, cambios):
    cliente, base, intento = _iniciar(version)
    _avanzar(cliente, base, intento, None, cambios)
    assert intento.status == 'COMPLETED'
    respuesta = cliente.get(base + '/evaluation')
    assert respuesta.status_code == 200, respuesta.content
    return respuesta.json()


def test_el_caso_lineal_es_publicable_y_lineal(version):
    assert version.status == 'PUBLISHED'
    assert version.validated_at and version.published_at
    assert version.definition_hash == huella_de(version)
    assert rubricas.rubrica_activa_de(version.pk) is not None
    destinos = {}
    for opcion in version.decisions.select_related('source_node', 'target_node'):
        destinos.setdefault(opcion.source_node.node_key, set()).add(opcion.target_node.node_key)
    assert all(len(siguientes) == 1 for siguientes in destinos.values()), 'cada escena lleva a una sola escena siguiente'
    assert len(destinos) == 20


def test_la_mejor_ruta_termina_en_proteccion_integral(version):
    evaluacion = _jugar(version, {})
    assert evaluacion['ending']['key'] == 'proteccion_integral'
    assert evaluacion['counts']['contraindicated'] == 0
    for hito in ('seguridad_cuidada', 'ruta_hospital_activada', 'riesgo_feminicidio_valorado',
                 'asesoria_derechos_realizada', 'medidas_proteccion_activadas', 'relato_protegido'):
        assert hito in evaluacion['milestones']


def test_un_informe_pobre_obliga_a_preguntar_otra_vez(version):
    evaluacion = _jugar(version, {'c2-informe': 'in-una-linea', 'c3-consultorio-relato': 'v-sin-informe'})
    assert 'relato_protegido' not in evaluacion['milestones']
    assert evaluacion['ending']['key'] == 'proteccion_con_brechas'


def test_sin_ruta_desde_el_hospital_el_riesgo_sigue_abierto(version):
    evaluacion = _jugar(version, {'c2-entrega-ruta': 'ru-esperar-alta'})
    assert evaluacion['ending']['key'] == 'riesgo_abierto'


def test_dos_respuestas_inadecuadas_rompen_la_ruta(version):
    evaluacion = _jugar(version, {'c1-entrada': 'n1-retirar-al-hermano', 'c2-habitacion': 'n7-mentira-piadosa'})
    assert evaluacion['counts']['contraindicated'] == 2
    assert evaluacion['ending']['key'] == 'ruta_rota'


def test_sin_informe_completo_no_se_ofrece_partir_del_informe(version):
    cliente, base, intento = _iniciar(version)
    _avanzar(cliente, base, intento, 'c3-consultorio-relato', {'c2-informe': 'in-una-linea'})
    oculta = intento.current_node.options.get(option_key='v-desde-informe')
    respaldo = intento.current_node.options.get(option_key='v-sin-informe')
    mundo = cliente.get(base + '/world')
    assert mundo.status_code == 200, mundo.content
    ofrecidas = {opcion['id'] for opcion in mundo.json()['data']['decisionOptions']}
    assert oculta.pk not in ofrecidas and respaldo.pk in ofrecidas
    rechazo = cliente.post(base + '/decisions', {'decision_option_id': oculta.pk, 'request_id': 'e15-oculta'}, format='json')
    assert rechazo.status_code == 400, rechazo.content
    assert rechazo.json()['code'] == 'VALIDATION_ERROR'
    assert rechazo.json()['message'] == 'La opción aún no está disponible.'
    intento.refresh_from_db()
    assert intento.current_node.node_key == 'c3-consultorio-relato'


def test_solo_una_version_mayor_renueva_los_metadatos_del_caso():
    autor = CustomUser.objects.create_user(email='docente2@example.test', password='prueba', role='PROFESOR')
    documento = json.loads(RUTA.read_text(encoding='utf-8'))
    documento['caso'].update(version='2.0.9', titulo='Título anterior', descripcion='Descripción anterior.')
    anterior = cargar(traducir(documento), autor)
    documento['caso'].update(version='2.0.10', titulo='Título nuevo', descripcion='Descripción nueva.')
    version = cargar(traducir(documento), autor)
    assert version.semantic_version == '2.0.10'
    assert cargar(traducir(documento), autor).pk == version.pk
    documento['caso']['version'] = '2.0.9'
    assert cargar(traducir(documento), autor).pk == anterior.pk
    documento['caso'].update(titulo='Título anterior', descripcion='Descripción anterior.')
    with pytest.raises(ErrorDeCarga, match='huella diferente'):
        cargar(traducir(documento), autor)
    caso = version.simulation_case
    caso.refresh_from_db()
    assert (caso.title, caso.description) == ('Título nuevo', 'Descripción nueva.')
    assert set(caso.versions.values_list('semantic_version', flat=True)) == {'2.0.9', '2.0.10'}


def test_rechaza_una_version_menor_inedita_sin_renovar_el_caso():
    autor = CustomUser.objects.create_user(email='docente@example.test', password='prueba', role='PROFESOR')
    documento = json.loads(RUTA.read_text(encoding='utf-8'))
    documento['caso'].update(version='2.0.10', titulo='Título vigente', descripcion='Descripción vigente.')
    caso = cargar(traducir(documento), autor).simulation_case
    documento['caso'].update(version='2.0.9', titulo='Título de descenso', descripcion='Descripción de descenso.')
    with pytest.raises(ErrorDeCarga, match=r'2\.0\.9.*menor.*2\.0\.10'):
        cargar(traducir(documento), autor)
    caso.refresh_from_db()
    assert (caso.title, caso.description) == ('Título vigente', 'Descripción vigente.')
    assert list(caso.versions.values_list('semantic_version', flat=True)) == ['2.0.10']


def test_vencer_el_tiempo_en_e01_devuelve_el_recorrido_incompleto(version, monkeypatch):
    monkeypatch.setattr(limites, '_fuentes', [lambda intento: 1])
    cliente, base, intento = _iniciar(version)
    assert intento.current_node.node_key == 'c1-entrada'
    intento.active_seconds = 61
    intento.save(update_fields=['active_seconds'])
    vencido = cliente.get(base + '/world')
    assert vencido.status_code == 409
    assert vencido.json()['code'] == 'ATTEMPT_TIME_EXPIRED'
    intento.refresh_from_db()
    assert intento.status == 'INCOMPLETE'
    assert intento.events.filter(node=intento.current_node, event_type='ATTEMPT_EXPIRED', detail='TIEMPO').count() == 1
    respuesta = cliente.get(base + '/evaluation')
    assert respuesta.status_code == 200, respuesta.content
    evaluacion = respuesta.json()
    assert evaluacion == intento.evaluation.snapshot
    assert evaluacion['evidence'] == []
    final = evaluacion['ending']
    assert final == {
        'key': 'incompleto', 'title': 'Recorrido incompleto', 'tone': 'neutral',
        'message': 'El caso no se terminó. Las decisiones tomadas quedan en el informe.',
    }
    informe = cliente.get(base + '/student-report')
    assert informe.status_code == 200, informe.content
    assert informe.json()['data']['ending'] == {**final, 'reason': []}

    # Una instantánea anterior al arreglo conserva la evidencia y omite el epílogo clínico al entregarse.
    AttemptEvaluation.objects.filter(attempt=intento).update(
        snapshot={**evaluacion, 'ending': {'key': 'riesgo_abierto', 'message': 'Epílogo de la historia'}},
    )
    assert cliente.get(base + '/evaluation').json() == evaluacion


def test_la_herramienta_muestra_lo_que_el_caso_escribio_para_ese_objetivo(version):
    cliente, base, _ = _iniciar(version)
    cliente.get(base + '/world')
    mapa = 'hosp-entrada-urgencias'
    assert cliente.patch(base + '/world-state', {'currentMapKey': mapa, 'playerX': 560, 'playerY': 440}, format='json').status_code == 200
    assert cliente.post(base + '/interactions/tool-pap', {}, format='json').status_code == 200
    assert cliente.patch(base + '/world-state', {'currentMapKey': mapa, 'playerX': 340, 'playerY': 360}, format='json').status_code == 200
    uso = cliente.post(base + '/tools/use', {'toolCode': 'PAP', 'targetInteractionKey': 'efrain'}, format='json')
    assert uso.status_code == 200, uso.content
    cuerpo = uso.json().get('data', uso.json())
    assert cuerpo['pertinent'] is True
    assert cuerpo['feedbackMessage'].startswith('PAP · Observar')


def test_hablar_con_gloria_cuenta_en_el_nodo_actual(version):
    cliente, base, intento = _iniciar(version)
    for escena in ('c1-sala-espera', 'c1-lugar-para-hablar'):
        _avanzar(cliente, base, intento, escena, {})
        mundo = cliente.get(base + '/world').json()['data']
        assert mundo['viewedNpcKeysHere'] == []
        if escena == 'c1-lugar-para-hablar':
            assert 'gloria' in mundo['flags']['viewedNpcKeys']

        gloria = next(objeto for objeto in mundo['objects'] if objeto['key'] == 'gloria')
        AttemptWorldState.objects.filter(attempt=intento).update(player_x=gloria['x'], player_y=gloria['y'])
        for _ in range(2):
            respuesta = cliente.post(base + '/interactions/gloria', {}, format='json')
            assert respuesta.status_code == 200, respuesta.content
            datos = respuesta.json()['data']
            assert datos['dialogue']
            assert datos['world']['viewedNpcKeysHere'] == ['gloria']
            assert datos['dialogue']['key'] in datos['world']['viewedDialogueKeys']
        assert cliente.get(base + '/world').json()['data']['viewedNpcKeysHere'] == ['gloria']


def test_spikes_con_gloria_se_registra_en_cada_escena(version):
    cliente, base, intento = _iniciar(version)
    _avanzar(cliente, base, intento, 'c1-enfermeria', {})

    def acercar(clave):
        mundo = cliente.get(base + '/world').json()['data']
        objeto = next(objeto for objeto in mundo['objects'] if objeto['key'] == clave)
        # Sincroniza la posición al alcance de la interacción; el caso decide qué objetos hay en cada escena.
        AttemptWorldState.objects.filter(attempt=intento).update(player_x=objeto['x'], player_y=objeto['y'])
        return mundo

    acercar('tool-spikes')
    recogida = cliente.post(base + '/interactions/tool-spikes', {}, format='json')
    assert recogida.status_code == 200, recogida.content
    uso = {'toolCode': 'SPIKES', 'targetInteractionKey': 'gloria'}
    escenas = ('c2-antes-de-decir', 'c2-tras-el-silencio')
    for numero, escena in enumerate(escenas):
        _avanzar(cliente, base, intento, escena, {})
        mundo = acercar('gloria')
        assert mundo['usedToolKeys'] == (['SPIKES@gloria'] if numero else [])
        assert mundo['usedToolKeysHere'] == []
        solicitud = {**uso, 'requestId': f'spikes-{escena}'}
        if numero:
            duplicada = cliente.post(base + '/tools/use', {**uso, 'requestId': f'spikes-{escenas[0]}'}, format='json')
            assert duplicada.status_code == 400, duplicada.content
            assert duplicada.json()['message'] == 'requestId ya corresponde a otra acción.'
        aplicada = cliente.post(base + '/tools/use', solicitud, format='json')
        assert aplicada.status_code == 200, aplicada.content
        datos = aplicada.json()['data']
        assert datos['pertinent'] is True and datos['alreadyUsed'] is False
        assert datos['world']['usedToolKeys'] == datos['world']['usedToolKeysHere'] == ['SPIKES@gloria']
        repetida = cliente.post(base + '/tools/use', uso, format='json')
        assert repetida.json()['data']['alreadyUsed'] is True
    assert list(intento.events.filter(event_type='TOOL_USED').values_list('node__node_key', flat=True)) == list(escenas)

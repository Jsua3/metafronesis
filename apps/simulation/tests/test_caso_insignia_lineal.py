"""El caso insignia lineal (SIM-VBG-002 2.0.0): se publica, se recorre por la API y cada final sale de lo que se hizo.

El diseño está en docs/diseno/caso-insignia-lineal.md. Cada recorrido elige una opción por escena; una respuesta riesgosa
o inadecuada se envía dos veces, porque con segunda oportunidad la primera no cuenta.
"""

import json
from pathlib import Path

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment
from apps.publicacion.arbol import arbol_de
from apps.publicacion.huella import huella_de
from apps.simulation.assessment.evaluation import build
from apps.simulation.casedef.insignia import cargar, traducir
from apps.simulation.models import SimulationAttempt
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
    version = cargar(traducir(json.loads(RUTA.read_text(encoding='utf-8'))), autor)
    version.status = 'PUBLISHED'
    version.validated_at = version.published_at = timezone.now()
    version.definition_hash = huella_de(version)
    version.save(update_fields=['status', 'validated_at', 'published_at', 'definition_hash'])
    return version


def _jugar(version, cambios):
    estudiante = CustomUser.objects.create_user(email=f'e{CustomUser.objects.count()}@example.test', password='prueba')
    CaseAssignment.objects.create(case_version=version, estudiante=estudiante)
    cliente = APIClient()
    cliente.force_authenticate(estudiante)
    creado = cliente.post('/api/simulation/attempts', {'case_version_id': version.pk}, format='json')
    assert creado.status_code == 201, creado.content
    intento = SimulationAttempt.objects.get(pk=creado.json()['id'])
    base = '/api/simulation/attempts/' + str(intento.pk)
    elegidas = {**MEJOR, **cambios}
    for _ in range(40):
        intento.refresh_from_db()
        nodo = intento.current_node
        if nodo.terminal_node:
            break
        assert cliente.get(base + '/world').status_code == 200
        opcion = nodo.options.get(option_key=elegidas[nodo.node_key])
        for vez in range(2):
            respuesta = cliente.post(base + '/decisions', {'decision_option_id': opcion.pk, 'request_id': f'{nodo.node_key}-{vez}'},
                                     format='json')
            assert respuesta.status_code == 200, (nodo.node_key, respuesta.content)
            cuerpo = respuesta.json()
            if not cuerpo.get('data', cuerpo)['retry_required']:
                break
    intento.refresh_from_db()
    assert intento.status == 'COMPLETED'
    return build(intento)


def test_el_caso_lineal_es_publicable_y_lineal(version):
    version.estimated_minutes = 40
    version.save(update_fields=['estimated_minutes'])
    problemas = [p for p in arbol_de(version).problemas() if p.code != 'CASE_NO_RUBRIC']
    assert problemas == []
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
    with pytest.raises(AssertionError):
        _jugar(version, {'c2-informe': 'in-una-linea'})


def test_una_version_nueva_renueva_la_descripcion_del_caso():
    autor = CustomUser.objects.create_user(email='docente2@example.test', password='prueba', role='PROFESOR')
    documento = json.loads(RUTA.read_text(encoding='utf-8'))
    anterior = json.loads(RUTA.read_text(encoding='utf-8'))
    anterior['caso'].update(version='1.0.0', descripcion='La versión anterior del caso.')
    cargar(traducir(anterior), autor)
    version = cargar(traducir(documento), autor)
    assert version.semantic_version == '2.0.0'
    assert version.simulation_case.description == documento['caso']['descripcion']
    assert version.simulation_case.versions.count() == 2
    # La misma versión con otra descripción sigue siendo un choque de huellas.
    from apps.simulation.casedef.escritor_insignia import ErrorDeCarga
    documento['caso']['descripcion'] = 'Otra descripción'
    with pytest.raises(ErrorDeCarga, match='huella diferente'):
        cargar(traducir(documento), autor)


def test_la_herramienta_muestra_lo_que_el_caso_escribio_para_ese_objetivo(version):
    estudiante = CustomUser.objects.create_user(email='herramienta@example.test', password='prueba')
    CaseAssignment.objects.create(case_version=version, estudiante=estudiante)
    cliente = APIClient()
    cliente.force_authenticate(estudiante)
    base = '/api/simulation/attempts/' + cliente.post('/api/simulation/attempts', {'case_version_id': version.pk}, format='json').json()['id']
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

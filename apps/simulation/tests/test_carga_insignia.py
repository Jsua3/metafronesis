"""Pruebas de la persistencia del caso insignia."""

import json
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment
from apps.publicacion.clonado import _copiar_arbol
from apps.publicacion.huella import huella_de

from apps.simulation.casedef.escritor_insignia import ErrorDeCarga
from apps.simulation.casedef.insignia import cargar, traducir
from apps.simulation.models import CaseVersion, SimulationCase
from apps.users.models import CustomUser

pytestmark = [pytest.mark.django_db, pytest.mark.req('RF-07', 'RF-11', 'RF-17', 'RF-19', 'RF-21')]
RUTA = Path(__file__).parents[1] / 'data/casos/SIM-VBG-002.dsl.json'


@pytest.fixture
def documento():
    return json.loads(RUTA.read_text(encoding='utf-8'))


@pytest.fixture
def autor():
    return CustomUser.objects.create_user(email='docente@example.test', password='prueba', role='PROFESOR')


def test_carga_completa_e_idempotente(documento, autor):
    plan = traducir(documento)
    version = cargar(plan, autor)
    assert version.nodes.count() == 18
    assert version.decisions.count() == 49
    assert version.scene_maps.count() == 18
    assert version.characters.count() == 13
    assert version.clinical_tools.count() == 5
    assert sum(sala.map_objects.count() for sala in version.scene_maps.all()) == 223
    otro_autor = CustomUser.objects.create_user(email='otro@example.test', password='prueba', role='PROFESOR')
    assert cargar(plan, otro_autor).pk == version.pk
    assert SimulationCase.objects.count() == 1
    assert version.nodes.count() == 18
    assert all(sala.node.case_version_id == version.pk for sala in version.scene_maps.select_related('node'))
    assert all(opcion.source_node.case_version_id == version.pk and opcion.target_node.case_version_id == version.pk
               for opcion in version.decisions.select_related('source_node', 'target_node'))
    for sala in version.scene_maps.all():
        for objeto in sala.map_objects.select_related('character', 'decision_option'):
            assert objeto.character is None or objeto.character.case_version_id == version.pk
            assert objeto.decision_option is None or objeto.decision_option.case_version_id == version.pk


def test_rechaza_contenido_no_soportado_sin_escribir(documento, autor):
    documento['x-siep']['escenas'][0]['novedad'] = True
    with pytest.raises(ErrorDeCarga, match='no soportado'):
        cargar(traducir(documento), autor)
    assert not SimulationCase.objects.exists()


def test_rechaza_cambio_de_huella_y_conserva_version(documento, autor):
    version = cargar(traducir(documento), autor)
    documento['x-siep']['escenas'][0]['objetivo'] = 'Objetivo diferente'
    with pytest.raises(ErrorDeCarga, match='huella diferente'):
        cargar(traducir(documento), autor)
    assert version.simulation_case.versions.count() == 1


def test_objetivo_participa_en_huella_y_clonado(documento, autor):
    version = cargar(traducir(documento), autor)
    huella = huella_de(version)
    nodo = version.nodes.get(start_node=True)
    nodo.goal = 'Un objetivo distinto'
    nodo.save(update_fields=['goal'])
    assert huella_de(version) != huella
    copia = CaseVersion.objects.create(simulation_case=version.simulation_case, semantic_version='9.9.9',
        created_by=autor, narrative_context=version.narrative_context, learning_objectives=version.learning_objectives,
        world_schema_version=version.world_schema_version, rules=version.rules)
    _copiar_arbol(version, copia)
    assert copia.nodes.get(node_key=nodo.node_key).goal == nodo.goal


def test_comando_informa_estado(documento, autor):
    salida = StringIO()
    call_command('cargar_caso_insignia', autor=autor.email, stdout=salida)
    assert 'No soportado: 0' in salida.getvalue()
    assert 'Estado de publicación: DRAFT' in salida.getvalue()


def test_recorrido_por_api_sobre_caso_cargado(documento, autor):
    version = cargar(traducir(documento), autor)
    version.status = 'PUBLISHED'
    version.validated_at = version.published_at = timezone.now()
    version.definition_hash = huella_de(version)
    version.save(update_fields=['status', 'validated_at', 'published_at', 'definition_hash'])
    estudiante = CustomUser.objects.create_user(email='estudiante@example.test', password='prueba')
    CaseAssignment.objects.create(case_version=version, estudiante=estudiante)
    cliente = APIClient()
    cliente.force_authenticate(estudiante)
    respuesta = cliente.post('/api/simulation/attempts', {'case_version_id': version.pk}, format='json')
    assert respuesta.status_code == 201, respuesta.content
    base = '/api/simulation/attempts/' + respuesta.json()['id']
    mundo = cliente.get(base + '/world')
    assert mundo.status_code == 200
    assert mundo.json()['data']['map']['key'] == version.scene_maps.get(node__start_node=True).map_key
    salida = cliente.post(base + '/safe-exit', {}, format='json')
    assert salida.json()['data']['currentNode']['goal'] == version.nodes.get(start_node=True).goal
    assert cliente.post(base + '/resume', {}, format='json').status_code == 200
    sala = version.scene_maps.get(node__start_node=True)
    movimiento = cliente.patch(base + '/world-state', {'currentMapKey': sala.map_key, 'playerX': 600, 'playerY': 300}, format='json')
    assert movimiento.status_code == 200, movimiento.content
    entrada = cliente.post(base + '/enter-room', {'targetNodeKey': 'c1-sala-espera', 'doorKey': 'a-espera'}, format='json')
    assert entrada.status_code == 200, entrada.content
    opcion = version.nodes.get(start_node=True).options.first()
    decision = cliente.post(base + '/decisions', {'decision_option_id': opcion.pk, 'request_id': 'decision-prueba'}, format='json')
    assert decision.status_code == 200, decision.content

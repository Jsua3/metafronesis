import pytest
from apps.simulation.models import CaseVersion

pytestmark = [pytest.mark.django_db, pytest.mark.req('SIEP-26')]


def clonar(caso):
    return caso['cliente'].post(f"/api/authoring/cases/{caso['version'].pk}/clone-version", {}, format='json')


def test_clon_es_borrador_con_todo_copiado(caso):
    original = caso['version']
    original.status = 'PUBLISHED'
    original.save()
    respuesta = clonar(caso)
    assert respuesta.status_code == 201
    clon = CaseVersion.objects.get(pk=respuesta.data['data']['versionId'])
    assert clon.status == 'DRAFT' and clon.semantic_version == '1.1.0' and clon.cloned_from_id == original.pk
    assert clon.estimated_minutes == original.estimated_minutes
    assert clon.nodes.count() == 2 and clon.decisions.count() == 2
    assert clon.rubric_assignments.get(active=True).rubric_id == caso['rubrica'].pk
    for opcion in clon.decisions.all():
        assert opcion.source_node.case_version_id == clon.pk and opcion.target_node.case_version_id == clon.pk


def test_editar_el_clon_no_toca_el_original(caso):
    caso['version'].status = 'ARCHIVED'
    caso['version'].save()
    respuesta = clonar(caso)
    clon = CaseVersion.objects.get(pk=respuesta.data['data']['versionId'])
    nodo = clon.nodes.get(node_key='inicio')
    nodo.narrative = 'Modificado'
    nodo.save()
    clon.decisions.update(text='Cambiado')
    caso['inicio'].refresh_from_db()
    caso['opciones'][0].refresh_from_db()
    assert caso['inicio'].narrative == 'Inicio' and caso['opciones'][0].text == 'Opción'


def test_no_se_clona_un_borrador_409(caso):
    respuesta = clonar(caso)
    assert respuesta.status_code == 409 and respuesta.data['code'] == 'INVALID_TRANSITION'


def test_clon_usa_la_siguiente_version_menor_libre(caso):
    original = caso['version']
    original.status = 'PUBLISHED'
    original.save()
    CaseVersion.objects.create(simulation_case=caso['caso'], semantic_version='1.1.0', created_by=caso['autor'])
    respuesta = clonar(caso)
    assert respuesta.status_code == 201
    assert CaseVersion.objects.get(pk=respuesta.data['data']['versionId']).semantic_version == '1.2.0'


def test_clon_de_caso_ajeno_404(caso):
    from apps.users.models import CustomUser
    from shared.policies import PROFESOR
    otro = CustomUser.objects.create_user(email='otro-clon@example.test', password='test-only', role=PROFESOR)
    caso['version'].status = 'PUBLISHED'
    caso['version'].save()
    caso['cliente'].force_authenticate(otro)
    assert clonar(caso).status_code == 404

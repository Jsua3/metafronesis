from io import BytesIO

import pytest
from PIL import Image

from apps.publicacion.ciclo import publicar
from apps.simulation.models import CaseVersion
from apps.simulation.services.portadas import crear_portada
from apps.users.models import CustomUser
from shared.policies import ADMIN

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


def test_el_clon_publicado_hereda_la_portada(caso, settings):
    settings.REVIEW_WORKFLOW_STRICT = False
    original = caso["version"]
    imagen = BytesIO()
    Image.new("RGB", (240, 132)).save(imagen, "PNG")
    imagen.seek(0)
    original.cover = crear_portada(imagen)
    original.cover_pixel_art = True
    original.status = "PUBLISHED"
    original.save(update_fields=["status", "cover", "cover_pixel_art"])
    respuesta = clonar(caso)
    assert respuesta.status_code == 201
    admin = CustomUser.objects.create_user(email="admin-portada@example.test", role=ADMIN)
    publicada = publicar(admin, respuesta.data["data"]["versionId"])
    assert publicada.status == "PUBLISHED"
    assert publicada.cover_id == original.cover_id and publicada.cover_pixel_art


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


def test_clon_rechaza_un_codigo_de_herramienta_con_arroba(caso):
    original = caso['version']
    original.status = 'ARCHIVED'
    original.save(update_fields=['status'])
    original.clinical_tools.create(tool_code='PAP@gloria', label='PAP')

    respuesta = clonar(caso)
    assert respuesta.status_code == 400, respuesta.content
    assert respuesta.json()['field'] == 'toolCode'
    assert "'@' está reservado" in respuesta.json()['message']
    assert list(caso['caso'].versions.values_list('pk', flat=True)) == [original.pk]


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


def test_clon_de_la_archivada_ajena_404_y_de_la_publicada_ajena_201(caso):
    from apps.users.models import CustomUser
    from shared.policies import PROFESOR
    from apps.users.models import PermisoDeAutoria
    otro = CustomUser.objects.create_user(email='otro-clon@example.test', password='test-only', role=PROFESOR)
    PermisoDeAutoria.objects.create(docente=otro, otorgado_por=caso['autor'])
    caso['version'].status = 'ARCHIVED'
    caso['version'].save()
    caso['cliente'].force_authenticate(otro)
    assert clonar(caso).status_code == 404
    # Autoría compartida: de una publicada ajena sale un borrador del otro docente; el caso conserva su autor.
    caso['version'].status = 'PUBLISHED'
    caso['version'].save()
    respuesta = clonar(caso)
    assert respuesta.status_code == 201
    clon = CaseVersion.objects.get(pk=respuesta.data['data']['versionId'])
    assert clon.created_by_id == otro.pk and clon.simulation_case.created_by_id == caso['autor'].pk

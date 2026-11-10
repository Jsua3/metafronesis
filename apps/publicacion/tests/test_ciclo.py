import pytest
from apps.grupos.models import CaseAssignment
from apps.simulation.services.access import available_versions
from apps.users.models import CustomUser
from shared.policies import ADMIN, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req('SIEP-26')]


def ruta(caso, accion):
    return f"/api/authoring/cases/{caso['version'].pk}/{accion}"


def admin(caso):
    usuario = CustomUser.objects.create_user(email='admin@example.test', password='test-only', role=ADMIN)
    caso['cliente'].force_authenticate(usuario)
    return usuario


def test_envia_a_revision_y_el_admin_publica(caso):
    estudiante = CustomUser.objects.create_user(email='alumno@example.test', password='test-only')
    CaseAssignment.objects.create(case_version=caso['version'], estudiante=estudiante)
    respuesta = caso['cliente'].post(ruta(caso, 'lifecycle'), {'action': 'submit'}, format='json')
    assert respuesta.status_code == 200
    caso['version'].refresh_from_db()
    assert caso['version'].status == 'IN_REVIEW'
    assert caso['version'].validated_at and caso['version'].definition_hash.startswith('sha256:')
    admin(caso)
    assert caso['cliente'].post(ruta(caso, 'publish'), {}, format='json').status_code == 200
    caso['version'].refresh_from_db()
    assert caso['version'].status == 'PUBLISHED' and caso['version'].published_at
    assert available_versions(estudiante).filter(pk=caso['version'].pk).exists()


def test_invalido_no_sale_de_borrador(caso):
    caso['inicio'].decision_prompt = ''
    caso['inicio'].save()
    respuesta = caso['cliente'].post(ruta(caso, 'lifecycle'), {'action': 'submit'}, format='json')
    assert respuesta.status_code == 400 and respuesta.data['code'] == 'CASE_INVALID'
    assert any(p['code'] == 'NODE_NO_QUESTION' for p in respuesta.data['problems'])
    caso['version'].refresh_from_db()
    assert caso['version'].status == 'DRAFT'


def test_docente_no_publica(caso):
    assert caso['cliente'].post(ruta(caso, 'publish'), {}, format='json').status_code == 403


@pytest.mark.parametrize('estricto, esperado', [(True, 409), (False, 200)])
def test_publicar_desde_borrador_segun_bandera(caso, settings, estricto, esperado):
    settings.REVIEW_WORKFLOW_STRICT = estricto
    admin(caso)
    respuesta = caso['cliente'].post(ruta(caso, 'publish'), {}, format='json')
    assert respuesta.status_code == esperado
    caso['version'].refresh_from_db()
    assert caso['version'].status == ('DRAFT' if estricto else 'PUBLISHED')
    if not estricto:
        assert caso['version'].validated_at and caso['version'].definition_hash


def test_archivar_publicada(caso):
    caso['version'].status = 'PUBLISHED'
    caso['version'].save()
    respuesta = caso['cliente'].post(ruta(caso, 'lifecycle'), {'action': 'archive'}, format='json')
    assert respuesta.status_code == 200
    caso['version'].refresh_from_db()
    assert caso['version'].status == 'ARCHIVED'


def test_transicion_invalida_409(caso):
    respuesta = caso['cliente'].post(ruta(caso, 'lifecycle'), {'action': 'archive'}, format='json')
    assert respuesta.status_code == 409 and respuesta.data['code'] == 'INVALID_TRANSITION'


def test_caso_ajeno_404(caso):
    otro = CustomUser.objects.create_user(email='otro-ciclo@example.test', password='test-only', role=PROFESOR)
    caso['cliente'].force_authenticate(otro)
    assert caso['cliente'].post(ruta(caso, 'lifecycle'), {'action': 'submit'}, format='json').status_code == 404


def test_las_mutaciones_dejan_auditoria(caso):
    from apps.simulation.models import AuditLog
    assert caso['cliente'].post(ruta(caso, 'lifecycle'), {'action': 'submit'}, format='json').status_code == 200
    admin(caso)
    assert caso['cliente'].post(ruta(caso, 'publish'), {}, format='json').status_code == 200
    assert caso['cliente'].post(ruta(caso, 'clone-version'), {}, format='json').status_code == 201
    assert caso['cliente'].post(ruta(caso, 'lifecycle'), {'action': 'archive'}, format='json').status_code == 200
    acciones = set(AuditLog.objects.values_list('action', flat=True))
    assert {'CASE_SUBMITTED', 'CASE_PUBLISHED', 'CASE_VERSION_CLONED', 'CASE_ARCHIVED'} <= acciones

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog
from apps.users.models import CustomUser
from shared.policies import ADMIN, PROFESOR


@pytest.fixture
def datos(db):
    admin = CustomUser.objects.create_user('admin-auditoria@example.test', role=ADMIN)
    profesor = CustomUser.objects.create_user('docente-auditoria@example.test', role=PROFESOR)
    cliente = APIClient()
    cliente.force_authenticate(admin)
    return admin, profesor, cliente


def registrar(actor, action, **campos):
    return AuditLog.objects.create(
        actor=actor, action=action, retention_until=timezone.now() + timedelta(days=360), **campos,
    )


@pytest.mark.req('SIEP-49')
def test_admin_filtra_por_accion(datos):
    admin, profesor, cliente = datos
    esperado = registrar(admin, 'USER_CREATED', context_json='{"correo":"privado@example.test"}',
                         ip_address='192.0.2.1', user_agent='dato privado')
    registrar(profesor, 'USER_UPDATED')
    respuesta = cliente.get('/api/admin/audit', {'action': 'USER_CREATED', 'actorId': admin.pk,
                                                'desde': '2000-01-01', 'hasta': '2100-01-01'})
    assert respuesta.status_code == 200
    contenido = respuesta.data['data']
    assert [fila['id'] for fila in contenido['items']] == [esperado.pk]
    assert 'privado' not in str(contenido)
    assert '192.0.2.1' not in str(contenido)
    assert cliente.get('/api/admin/audit', {'actorId': profesor.pk, 'action': 'USER_CREATED'}).data['data']['items'] == []
    assert cliente.get('/api/admin/audit', {'desde': '2100-01-01'}).data['data']['items'] == []
    assert cliente.get('/api/admin/audit', {'hasta': '2000-01-01'}).data['data']['items'] == []


@pytest.mark.req('SIEP-49')
def test_profesor_403(datos):
    _, profesor, cliente = datos
    cliente.force_authenticate(profesor)
    assert cliente.get('/api/admin/audit').status_code == 403


@pytest.mark.req('SIEP-49')
def test_paginacion(datos):
    admin, _, cliente = datos
    registros = [registrar(admin, 'EVENTO_PRUEBA') for _ in range(51)]
    primera = cliente.get('/api/admin/audit', {'action': 'EVENTO_PRUEBA'}).data['data']
    segunda = cliente.get('/api/admin/audit', {'action': 'EVENTO_PRUEBA', 'page': 2}).data['data']
    assert primera['pageSize'] == 50
    assert primera['coverage']['total'] == 51
    assert [fila['id'] for fila in primera['items']] == [fila.pk for fila in reversed(registros[1:])]
    assert [fila['id'] for fila in segunda['items']] == [registros[0].pk]


@pytest.mark.req('SIEP-49')
@pytest.mark.parametrize('parametro, valor', [('page', '0'), ('page', 'x'), ('actorId', 'x'),
                                             ('desde', 'invalido'), ('hasta', 'invalido')])
def test_filtros_invalidos_400(datos, parametro, valor):
    assert datos[2].get('/api/admin/audit', {parametro: valor}).status_code == 400

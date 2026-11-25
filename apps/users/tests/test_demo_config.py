"""P3: solo se ofrece la demostración cuando se puede usar la cuenta sembrada."""
from unittest.mock import patch

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.users.management.commands.seed_demo_users import DEMO_USERS
from apps.users.models import CustomUser

URL = '/api/auth/demo/config'
STUDENT = next(spec for spec in DEMO_USERS if spec['role'] == 'ESTUDIANTE')


@pytest.fixture
def demo(db):
    return CustomUser.objects.create_user(**STUDENT)


@override_settings(DEBUG=False)
def test_produccion_no_consulta_cuentas_ni_ofrece_demo():
    with patch('apps.users.demo_config.User.objects.filter') as query:
        response = APIClient().get(URL)
    assert response.status_code == 200
    assert response.data['data'] == {'enabled': False}
    query.assert_not_called()


@override_settings(DEBUG=True)
@pytest.mark.django_db
def test_desarrollo_sin_semilla_no_ofrece_demo():
    with patch('apps.users.demo_config.is_dev_environment', return_value=True):
        assert APIClient().get(URL).data['data'] == {'enabled': False}


@override_settings(DEBUG=True)
def test_cuenta_disponible_y_login_real(demo):
    with patch('apps.users.demo_config.is_dev_environment', return_value=True):
        response = APIClient().get(URL)
    assert response.data['data'] == {'enabled': True}
    assert response['Cache-Control'] == 'no-store'
    login = APIClient().post('/api/auth/login', {
        'email': STUDENT['email'], 'password': STUDENT['password'],
    }, format='json')
    assert login.status_code == 200
    assert login.data['data']['user']['role'] == 'ESTUDIANTE'
    assert login.data['data']['token']


@override_settings(DEBUG=True)
@pytest.mark.parametrize('change', ['inactive', 'password', 'role', 'temporary'])
def test_cuenta_que_no_sirve_no_se_ofrece(demo, change):
    if change == 'inactive':
        demo.activo = False
    elif change == 'password':
        demo.set_password('OtraClave123!')
    elif change == 'role':
        demo.role = 'PROFESOR'
    else:
        demo.must_change_password = True
    demo.save()
    with patch('apps.users.demo_config.is_dev_environment', return_value=True):
        assert APIClient().get(URL).data['data'] == {'enabled': False}


@override_settings(DEBUG=True)
def test_base_de_plataforma_no_consulta_cuentas():
    with patch('apps.users.demo_config.is_dev_environment', return_value=False), \
            patch('apps.users.demo_config.User.objects.filter') as query:
        assert APIClient().get(URL).data['data'] == {'enabled': False}
    query.assert_not_called()


@override_settings(DEBUG=True)
def test_ajustes_de_produccion_cierran_incluso_con_excepcion_de_siembra():
    with patch('apps.users.demo_config.ajustes_en_uso', return_value='psychosim.settings.production'), \
            patch('apps.users.demo_config.is_dev_environment', return_value=True), \
            patch('apps.users.demo_config.User.objects.filter') as query:
        assert APIClient().get(URL).data['data'] == {'enabled': False}
    query.assert_not_called()

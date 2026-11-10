import pytest
from rest_framework.test import APIClient
from apps.users.models import CustomUser
from shared.policies import PROFESOR, ESTUDIANTE


@pytest.fixture
def usuarios(db):
    return [CustomUser.objects.create_user(email=f"{i}@example.test", password="clave", role=rol)
            for i, rol in enumerate((PROFESOR, PROFESOR, ESTUDIANTE))]


@pytest.fixture
def cliente(usuarios):
    cliente = APIClient()
    cliente.force_authenticate(usuarios[0])
    return cliente

import pytest
from rest_framework.test import APIClient
from apps.users.models import CustomUser, PermisoDeAutoria
from shared.policies import ADMIN, PROFESOR, ESTUDIANTE


@pytest.fixture
def usuarios(db):
    usuarios = [CustomUser.objects.create_user(email=f"{i}@example.test", password="clave", role=rol)
            for i, rol in enumerate((PROFESOR, PROFESOR, ESTUDIANTE))]
    admin = CustomUser.objects.create_user(email="admin-autoria@example.test", role=ADMIN)
    for docente in usuarios[:2]:
        PermisoDeAutoria.objects.create(docente=docente, otorgado_por=admin)
    return usuarios


@pytest.fixture
def cliente(usuarios):
    cliente = APIClient()
    cliente.force_authenticate(usuarios[0])
    return cliente

import pytest
from rest_framework.test import APIClient

from apps.users.models import CustomUser, PermisoDeAutoria
from shared.policies import ADMIN, PROFESOR


@pytest.fixture
def docente_con_permiso(db):
    """Una docente que puede crear casos, con su cliente ya autenticado."""
    admin = CustomUser.objects.create_user(email="admin-biblioteca@example.test", role=ADMIN)
    docente = CustomUser.objects.create_user(email="docente-biblioteca@example.test", password="clave", role=PROFESOR)
    PermisoDeAutoria.objects.create(docente=docente, otorgado_por=admin)
    cliente = APIClient()
    cliente.force_authenticate(docente)
    return docente, cliente

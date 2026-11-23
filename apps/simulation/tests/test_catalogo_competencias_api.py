import pytest
from rest_framework.test import APIClient

from apps.simulation.models import Competency
from apps.users.models import CustomUser
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR


pytestmark = [pytest.mark.django_db, pytest.mark.req("RQ-NEG-002")]


@pytest.mark.parametrize("rol", [PROFESOR, ADMIN])
def test_catalogo_devuelve_activas_e_inactivas_ordenadas(rol):
    usuario = CustomUser.objects.create_user(email=f"catalogo-{rol}@example.test", password="test-only", role=rol)
    ultima = Competency.objects.create(code="Z", name="Ética", description="Cuidado", active=False, sort_order=2)
    primera = Competency.objects.create(code="A", name="Escucha", sort_order=1)
    cliente = APIClient()
    cliente.force_authenticate(usuario)

    respuesta = cliente.get("/api/competencies")

    assert respuesta.status_code == 200
    assert respuesta.data == {"success": True, "data": [
        {"id": primera.pk, "code": "A", "name": "Escucha", "description": "", "active": True, "sortOrder": 1},
        {"id": ultima.pk, "code": "Z", "name": "Ética", "description": "Cuidado", "active": False, "sortOrder": 2},
    ]}


def test_catalogo_deniega_estudiante():
    estudiante = CustomUser.objects.create_user(email="catalogo-estudiante@example.test", password="test-only", role=ESTUDIANTE)
    cliente = APIClient()
    cliente.force_authenticate(estudiante)

    respuesta = cliente.get("/api/competencies")

    assert respuesta.status_code == 403
    assert respuesta.data["success"] is False
    assert respuesta.data["code"]
    assert respuesta.data["message"]


def test_catalogo_exige_autenticacion():
    respuesta = APIClient().get("/api/competencies")

    assert respuesta.status_code == 401
    assert respuesta.data["success"] is False

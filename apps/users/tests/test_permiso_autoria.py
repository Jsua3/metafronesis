import pytest
from django.apps import apps
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.users.models import CustomUser
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-19", "SIEP-20")]


@pytest.fixture
def personas():
    return [CustomUser.objects.create_user(email=f"m4-{rol}@example.test", role=rol)
            for rol in (ADMIN, PROFESOR, ESTUDIANTE)]


def test_admin_otorga_y_retira(personas):
    admin, docente, _ = personas
    cliente = APIClient()
    cliente.force_authenticate(admin)
    ruta = f"/api/admin/users/{docente.pk}/authoring-permission"
    assert cliente.put(ruta).status_code == 200
    permiso = apps.get_model("users", "PermisoDeAutoria").objects.get(docente=docente)
    assert permiso.otorgado_por == admin and permiso.otorgado_en is not None
    assert cliente.put(ruta).status_code == 200
    cliente.force_authenticate(docente)
    assert cliente.put(ruta).status_code == 403
    cliente.force_authenticate(admin)
    assert cliente.delete(ruta).status_code == 200
    assert not apps.get_model("users", "PermisoDeAutoria").objects.filter(docente=docente).exists()


def test_profesor_sin_permiso_no_crea_caso_403(personas):
    admin, docente, _ = personas
    cliente = APIClient()
    cliente.force_authenticate(docente)
    datos = {"code": "M4", "title": "Caso"}
    respuesta = cliente.post("/api/authoring/cases", datos, format="json")
    assert respuesta.status_code == 403 and respuesta.data["code"] == "AUTHORING_NOT_ALLOWED"
    cliente.force_authenticate(admin)
    ruta = f"/api/admin/users/{docente.pk}/authoring-permission"
    assert cliente.put(ruta).status_code == 200
    cliente.force_authenticate(docente)
    creada = cliente.post("/api/authoring/cases", datos, format="json")
    assert creada.status_code == 201
    version = creada.data["data"]["versionId"]
    cliente.force_authenticate(admin)
    assert cliente.delete(ruta).status_code == 200
    cliente.force_authenticate(docente)
    respuesta = cliente.put(f"/api/authoring/cases/{version}/brief", {"title": "Cambio"}, format="json")
    assert respuesta.status_code == 403 and respuesta.data["code"] == "AUTHORING_NOT_ALLOWED"
    assert cliente.get(f"/api/authoring/cases/{version}/definition").status_code == 200


@pytest.mark.parametrize("metodo", ["put", "delete"])
def test_permiso_solo_para_profesores(personas, metodo):
    admin, _, estudiante = personas
    cliente = APIClient()
    cliente.force_authenticate(admin)
    for usuario in (admin, estudiante):
        respuesta = getattr(cliente, metodo)(f"/api/admin/users/{usuario.pk}/authoring-permission")
        assert respuesta.status_code == 400 and respuesta.data["code"] == "NOT_A_TEACHER"
    assert getattr(cliente, metodo)("/api/admin/users/99999999/authoring-permission").status_code == 404


def test_semilla_otorga_permiso_a_docente_existente(monkeypatch):
    monkeypatch.setenv("SIEP_ALLOW_DEMO_SEED", "1")
    call_command("seed_demo_users")
    modelo = apps.get_model("users", "PermisoDeAutoria")
    docente = CustomUser.objects.get(email="profesora@psychosim.edu.co")
    permiso = modelo.objects.get(docente=docente)
    assert permiso.otorgado_por.role == ADMIN
    permiso.delete()
    call_command("seed_demo_users")
    assert modelo.objects.filter(docente=docente).count() == 1

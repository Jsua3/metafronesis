import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.users.models import AccessRequest, AccessRequestStatus


@pytest.fixture(autouse=True)
def locmem_email(settings):
    settings.MAILERS = {
        "default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"},
    }


@pytest.fixture
def admin(db):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        email="admin_req@x.com",
        password="Admin123!",
        nombre="Admin",
        apellido="Req",
        role="ADMIN",
    )


@pytest.fixture
def estudiante_existente(db):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.create_user(
        email="yaexiste@x.com",
        password="Est12345!",
        nombre="Ya",
        apellido="Existe",
        role="ESTUDIANTE",
    )


def cl(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_access_request_public_201(db, django_capture_on_commit_callbacks):
    # S1-3 · el aviso se programa al confirmar la transacción; execute=True lo corre al salir del bloque.
    with django_capture_on_commit_callbacks(execute=True):
        resp = cl().post(
            "/api/auth/access-request",
            {"nombre": "Carolina", "apellido": "Mejia", "email": "carolina@psychosim.edu.co"},
            format="json",
        )
    assert resp.status_code == 201
    assert resp.data["success"] is True
    assert AccessRequest.objects.filter(email="carolina@psychosim.edu.co", status="PENDING").exists()
    assert len(mail.outbox) == 1
    # S1-3 · el asunto es fijo; el nombre va en el cuerpo, marcado como sin verificar.
    assert mail.outbox[0].subject == "[SIEP] Nueva solicitud de acceso"
    assert 'Nombre indicado (sin verificar): "Carolina Mejia"' in mail.outbox[0].body


def test_access_request_duplicate_pending_responde_igual_sin_guardar(db):
    # S1-3 · antes 400; ahora la misma respuesta 201 y ninguna fila nueva.
    primera = cl().post(
        "/api/auth/access-request",
        {"nombre": "Ana", "apellido": "Uno", "email": "dup@psychosim.edu.co"},
        format="json",
    )
    resp = cl().post(
        "/api/auth/access-request",
        {"nombre": "Ana", "apellido": "Dos", "email": "dup@psychosim.edu.co"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data == primera.data
    assert AccessRequest.objects.filter(email="dup@psychosim.edu.co").count() == 1


def test_access_request_existing_user_responde_igual_sin_guardar(estudiante_existente):
    # S1-3 · antes 400 («Ya existe una cuenta»); ahora la misma respuesta 201 y ninguna fila.
    resp = cl().post(
        "/api/auth/access-request",
        {"nombre": "X", "apellido": "Y", "email": estudiante_existente.email},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["data"] == {"status": "PENDING"}
    assert not AccessRequest.objects.filter(email=estudiante_existente.email).exists()


def test_admin_lists_pending_requests(admin):
    req = AccessRequest.objects.create(nombre="Luis", apellido="P", email="luis-list-test@x.com")
    resp = cl(admin).get("/api/admin/access-requests?status=PENDING")
    assert resp.status_code == 200
    emails = {item["email"] for item in resp.data["data"]}
    assert req.email in emails


def test_admin_updates_request_status(admin):
    req = AccessRequest.objects.create(nombre="Marta", apellido="Q", email="marta@x.com")
    resp = cl(admin).patch(
        f"/api/admin/access-requests/{req.id}/status",
        {"status": AccessRequestStatus.REVIEWED},
        format="json",
    )
    assert resp.status_code == 200
    req.refresh_from_db()
    assert req.status == AccessRequestStatus.REVIEWED

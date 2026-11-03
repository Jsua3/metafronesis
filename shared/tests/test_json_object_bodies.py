"""Un cuerpo JSON que no es un objeto (lista, texto, número) es un 400, nunca un 500.

Casi todas las vistas hacen ``request.data.get(...)``; con ``[]`` o ``7`` eso era un
``AttributeError`` (500). El analizador de la API solo admite objetos JSON.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

pytestmark = pytest.mark.req("RNF-08")

User = get_user_model()


@pytest.fixture
def admin(db):
    user = User.objects.create_user(
        email="parser_admin@x.com", password="Admin-Segura-2026!", nombre="Ad", apellido="Min", role="ADMIN"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.parametrize("body", [[], [1, 2], "texto", 7, True])
@pytest.mark.parametrize(
    "method,path",
    [
        ("post", "/api/rubrics/"),
        ("post", "/api/authoring/cases"),
        ("post", "/api/admin/users"),
        ("post", "/api/auth/change-password"),
    ],
)
def test_a_non_object_json_body_is_a_400(admin, method, path, body):
    response = getattr(admin, method)(path, body, format="json")

    assert response.status_code == 400, (path, body, response.status_code)


def test_an_object_body_still_works(admin):
    response = admin.post("/api/authoring/cases", {"title": "Un caso del analizador"}, format="json")

    assert response.status_code == 200


def test_the_revision_header_is_allowed_for_cross_origin_clients():
    from django.conf import settings

    assert "x-case-revision" in settings.CORS_ALLOW_HEADERS
    assert "authorization" in settings.CORS_ALLOW_HEADERS

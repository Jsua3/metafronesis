"""S1-3 (B.6) · nombre y apellido de una solicitud de acceso son texto plano.

Van al asunto y al cuerpo de un correo que sale del remitente institucional: sin saltos de línea, etiquetas
ni enlaces. La regla es la de ``shared/plain_text.py`` (copia de la de ``casedef``; ver test de paridad).
"""
import pytest
from rest_framework.test import APIClient

from apps.users.models import AccessRequest

pytestmark = [pytest.mark.req("D-14"), pytest.mark.security, pytest.mark.django_db]

URL = "/api/auth/access-request"


@pytest.fixture(autouse=True)
def locmem_email(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


def _solicitud(nombre="Ana", apellido="Gil", correo="texto.plano@inst.test", ip="198.51.100.100"):
    return APIClient().post(
        URL, {"nombre": nombre, "apellido": apellido, "email": correo}, format="json", REMOTE_ADDR=ip
    )


@pytest.mark.parametrize(
    ("campo", "valor"),
    [
        ("nombre", "Ana\nLópez"),
        ("nombre", "<b>Ana</b>"),
        ("nombre", "https://x.test"),
        ("nombre", "www.x.test"),
        ("apellido", "Gil\rMartín"),
        ("apellido", "<script>x</script>"),
        ("apellido", "javascript:alert(1)"),
    ],
)
def test_nombre_o_apellido_con_marcado_enlace_o_salto_da_400_con_el_campo(campo, valor):
    datos = {"nombre": "Ana", "apellido": "Gil", campo: valor}

    resp = _solicitud(**datos)

    assert resp.status_code == 400
    assert resp.data["field"] == campo
    assert not AccessRequest.objects.filter(email="texto.plano@inst.test").exists()


@pytest.mark.parametrize(("nombre", "apellido"), [("María José", "Gil"), ("Ana", "O'Neil")])
def test_tildes_y_apostrofos_son_nombres_validos(nombre, apellido):
    resp = _solicitud(nombre=nombre, apellido=apellido, correo=f"{nombre[:3].lower()}.plano@inst.test")

    assert resp.status_code == 201

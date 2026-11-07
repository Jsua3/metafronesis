"""S1-3 (B.1, B.2 y B.5) · la solicitud de acceso responde igual exista o no la cuenta o la solicitud pendiente.

El aviso al administrador va en segundo plano y agrupado (ver test_access_request_aviso.py); aquí se prueba
la respuesta, lo que se guarda y el campo trampa.
"""
import logging
import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.users.models import AccessRequest

pytestmark = [pytest.mark.req("D-14"), pytest.mark.security, pytest.mark.django_db]

URL = "/api/auth/access-request"
User = get_user_model()


@pytest.fixture(autouse=True)
def locmem_email(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


@pytest.fixture
def cuenta_existente(db):
    return User.objects.create_user(
        email="existe.uniforme@inst.test",
        password=secrets.token_urlsafe(32),
        nombre="Ya",
        apellido="Existe",
        role="ESTUDIANTE",
    )


def _solicitud(correo, ip="198.51.100.20", nombre="Ana", apellido="Gil", **extra):
    return APIClient().post(
        URL,
        {"nombre": nombre, "apellido": apellido, "email": correo, **extra},
        format="json",
        REMOTE_ADDR=ip,
    )


def test_la_respuesta_es_la_misma_para_correo_nuevo_cuenta_existente_y_pendiente(cuenta_existente):
    nuevo = _solicitud("nuevo.uniforme@inst.test", ip="198.51.100.21")
    cuenta = _solicitud(cuenta_existente.email, ip="198.51.100.22")
    pendiente = _solicitud("nuevo.uniforme@inst.test", ip="198.51.100.23")

    assert nuevo.status_code == cuenta.status_code == pendiente.status_code == 201
    assert nuevo.data == cuenta.data == pendiente.data
    assert nuevo.data["data"] == {"status": "PENDING"}


def test_solo_se_guarda_la_solicitud_nueva_no_la_de_una_cuenta_ni_la_repetida(cuenta_existente):
    _solicitud("nuevo.uniforme@inst.test", ip="198.51.100.24")
    _solicitud(cuenta_existente.email, ip="198.51.100.25")
    _solicitud("nuevo.uniforme@inst.test", ip="198.51.100.26")

    assert AccessRequest.objects.filter(email="nuevo.uniforme@inst.test").count() == 1
    assert not AccessRequest.objects.filter(email=cuenta_existente.email).exists()


def test_el_campo_trampa_responde_igual_y_no_guarda_nada(caplog):
    with caplog.at_level(logging.INFO, logger="siep.security"):
        trampa = _solicitud("bot.uniforme@inst.test", ip="198.51.100.27", website="https://spam.test/x")
    normal = _solicitud("bot.uniforme.normal@inst.test", ip="198.51.100.28")

    assert trampa.status_code == normal.status_code == 201
    assert trampa.data == normal.data
    assert not AccessRequest.objects.filter(email="bot.uniforme@inst.test").exists()
    assert AccessRequest.objects.filter(email="bot.uniforme.normal@inst.test").exists()
    eventos = [
        registro
        for registro in caplog.records
        if registro.name == "siep.security" and registro.getMessage() == "security_event"
    ]
    assert [getattr(registro, "fields", None) for registro in eventos] == [{"event": "honeypot_hit"}]


def test_el_campo_trampa_vacio_es_una_solicitud_normal():
    resp = _solicitud("vacio.uniforme@inst.test", ip="198.51.100.29", website="")

    assert resp.status_code == 201
    assert AccessRequest.objects.filter(email="vacio.uniforme@inst.test").exists()

"""Recuperar la contraseña olvidada con un enlace de un solo uso por correo."""
import re
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from rest_framework.test import APIClient

from apps.users.services import password_reset_service

User = get_user_model()
MENSAJE = "Si el correo tiene una cuenta activa"


@pytest.fixture(autouse=True)
def correo_en_memoria(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}
    settings.SIEP_PUBLIC_URL = "https://siep.test"


@pytest.fixture
def ana(db):
    return User.objects.create_user(
        email="ana.reset@psychosim.edu.co", password="Vieja-Clave-2026!", nombre="Ana", apellido="Ruiz", role="ESTUDIANTE"
    )


def pedir(email, capturar):
    with capturar(execute=True):
        return APIClient().post("/api/auth/password-reset", {"email": email}, format="json")


def enlace_del_correo():
    assert len(mail.outbox) == 1
    url = re.search(r"https://siep\.test/restablecer-contrasena\?\S+", mail.outbox[0].body).group(0)
    q = parse_qs(urlparse(url).query)
    return q["uid"][0], q["token"][0]


def confirmar(uid, token, password):
    return APIClient().post(
        "/api/auth/password-reset/confirm", {"uid": uid, "token": token, "password": password}, format="json"
    )


def test_pedir_el_enlace_manda_un_correo_con_un_enlace_de_un_solo_uso(ana, django_capture_on_commit_callbacks):
    resp = pedir("ANA.Reset@psychosim.edu.co", django_capture_on_commit_callbacks)
    assert resp.status_code == 200
    assert MENSAJE in resp.data["message"]
    assert mail.outbox[0].to == [ana.email]
    assert "vence en 30 minutos" in mail.outbox[0].body
    uid, token = enlace_del_correo()
    assert uid and token


@pytest.mark.parametrize("email", ["nadie@psychosim.edu.co", "inactiva@psychosim.edu.co"])
def test_un_correo_sin_cuenta_activa_recibe_la_misma_respuesta_y_ningun_correo(db, email, django_capture_on_commit_callbacks):
    User.objects.create_user(
        email="inactiva@psychosim.edu.co", password="Otra-Clave-2026!", nombre="In", apellido="Activa", role="ESTUDIANTE",
        activo=False,
    )
    resp = pedir(email, django_capture_on_commit_callbacks)
    assert resp.status_code == 200
    assert MENSAJE in resp.data["message"]
    assert mail.outbox == []


def test_confirmar_cambia_la_contrasena_cierra_las_sesiones_y_el_enlace_no_sirve_dos_veces(
    ana, django_capture_on_commit_callbacks
):
    pedir(ana.email, django_capture_on_commit_callbacks)
    uid, token = enlace_del_correo()
    epoca = ana.session_epoch

    resp = confirmar(uid, token, "Nueva-Clave-Segura-77")
    assert resp.status_code == 200
    ana.refresh_from_db()
    assert ana.check_password("Nueva-Clave-Segura-77")
    assert ana.session_epoch == epoca + 1
    assert ana.must_change_password is False

    otra_vez = confirmar(uid, token, "Otra-Clave-Segura-88")
    assert otra_vez.status_code == 400
    assert otra_vez.data["code"] == "RESET_LINK_INVALID"
    ana.refresh_from_db()
    assert ana.check_password("Nueva-Clave-Segura-77")


def test_un_token_inventado_no_sirve(ana):
    uid = password_reset_service.urlsafe_base64_encode(str(ana.pk).encode())
    resp = confirmar(uid, "token-falso", "Nueva-Clave-Segura-77")
    assert resp.status_code == 400
    assert resp.data["code"] == "RESET_LINK_INVALID"


def test_una_contrasena_debil_se_rechaza_y_el_enlace_sigue_sirviendo(ana, django_capture_on_commit_callbacks):
    pedir(ana.email, django_capture_on_commit_callbacks)
    uid, token = enlace_del_correo()
    resp = confirmar(uid, token, "123")
    assert resp.status_code == 400
    assert resp.data["code"] == "VALIDATION_ERROR"
    ana.refresh_from_db()
    assert ana.check_password("Vieja-Clave-2026!")
    assert confirmar(uid, token, "Nueva-Clave-Segura-77").status_code == 200


def test_el_enlace_vence(ana, django_capture_on_commit_callbacks, monkeypatch):
    pedir(ana.email, django_capture_on_commit_callbacks)
    uid, token = enlace_del_correo()
    ahora = password_reset_service.generador._now()
    monkeypatch.setattr(password_reset_service.generador, "_now", lambda: ahora + timedelta(minutes=31))
    resp = confirmar(uid, token, "Nueva-Clave-Segura-77")
    assert resp.status_code == 400
    assert resp.data["code"] == "RESET_LINK_INVALID"


def test_la_pantalla_puede_preguntar_si_el_enlace_sirve(ana, django_capture_on_commit_callbacks):
    pedir(ana.email, django_capture_on_commit_callbacks)
    uid, token = enlace_del_correo()
    cliente = APIClient()
    ok = cliente.post("/api/auth/password-reset/check", {"uid": uid, "token": token}, format="json")
    malo = cliente.post("/api/auth/password-reset/check", {"uid": uid, "token": "x"}, format="json")
    assert ok.status_code == 200 and ok.data["data"] == {"valid": True}
    assert malo.status_code == 200 and malo.data["data"] == {"valid": False}


def test_el_enlace_usa_solo_la_url_configurada_nunca_la_cabecera_host(ana, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        APIClient().post(
            "/api/auth/password-reset", {"email": ana.email}, format="json", HTTP_HOST="127.0.0.1:9999", HTTP_X_FORWARDED_HOST="atacante.example"
        )
    assert "atacante.example" not in mail.outbox[0].body
    assert "127.0.0.1:9999" not in mail.outbox[0].body
    assert "https://siep.test/restablecer-contrasena?" in mail.outbox[0].body


def test_cerrar_sesiones_invalida_un_enlace_pendiente(ana, django_capture_on_commit_callbacks):
    from apps.users.services.account_service import revoke_sessions

    pedir(ana.email, django_capture_on_commit_callbacks)
    uid, token = enlace_del_correo()
    revoke_sessions(ana.id)
    assert confirmar(uid, token, "Nueva-Clave-Segura-77").data["code"] == "RESET_LINK_INVALID"

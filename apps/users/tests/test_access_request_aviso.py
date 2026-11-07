"""S1-3 (B.3 y B.4) · el aviso al administrador no retiene la petición y se agrupa por ventana de 10 minutos.

``commit_al_instante`` imita el commit de producción (sin ATOMIC_REQUESTS, ``on_commit`` corre al momento y
dentro de la petición). Sin ese fixture, ``on_commit`` no se ejecuta en una prueba de base de datos normal.
"""
import threading
import time

import pytest
from django.core import mail
from django.core.mail.backends.base import BaseEmailBackend
from rest_framework.test import APIClient

from apps.security import limiter
from apps.users.models import AccessRequest
from apps.users.services import access_request_service
from shared.background import run_in_background

pytestmark = [pytest.mark.req("D-14"), pytest.mark.security, pytest.mark.django_db]

URL = "/api/auth/access-request"
ASUNTO = "[SIEP] Nueva solicitud de acceso"


class CorreoLento(BaseEmailBackend):
    """Backend de prueba: el servidor de correo tarda 3 s en aceptar el mensaje."""

    def send_messages(self, email_messages):
        time.sleep(3)
        mail.outbox.extend(email_messages)
        return len(email_messages)


class CorreoRoto(BaseEmailBackend):
    """Backend de prueba: el servidor de correo rechaza el envío."""

    def send_messages(self, email_messages):
        raise ConnectionRefusedError("sin servidor de correo")


@pytest.fixture(autouse=True)
def locmem_email(settings):
    settings.MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


@pytest.fixture
def commit_al_instante(monkeypatch):
    monkeypatch.setattr(
        access_request_service.transaction, "on_commit", lambda funcion, *args, **kwargs: funcion()
    )


@pytest.fixture
def hilos(monkeypatch):
    """Guarda el hilo que devuelve ``run_in_background`` cuando la petición lo lanza."""
    capturados = []

    def capturar(fn, *args, **kwargs):
        hilo = run_in_background(fn, *args, **kwargs)
        capturados.append(hilo)
        return hilo

    monkeypatch.setattr(access_request_service, "run_in_background", capturar)
    return capturados


def _solicitud(correo, ip, nombre="Ana", apellido="Gil"):
    return APIClient().post(
        URL, {"nombre": nombre, "apellido": apellido, "email": correo}, format="json", REMOTE_ADDR=ip
    )


def test_fuera_de_linea_devuelve_un_hilo_demonio_que_termina(settings):
    settings.SIEP_BACKGROUND_INLINE = False
    hecho = threading.Event()

    hilo = run_in_background(hecho.set)

    assert isinstance(hilo, threading.Thread)
    assert hilo.daemon
    assert hecho.wait(5)


def test_en_linea_ejecuta_en_el_acto_y_un_error_no_se_propaga(settings):
    settings.SIEP_BACKGROUND_INLINE = True
    llamadas = []

    assert run_in_background(llamadas.append, "uno") is None
    assert llamadas == ["uno"]
    assert run_in_background(lambda: 1 / 0) is None


def test_el_aviso_no_retiene_la_peticion_y_el_correo_llega_luego(
    settings, commit_al_instante, hilos
):
    settings.SIEP_BACKGROUND_INLINE = False
    settings.MAILERS = {"default": {"BACKEND": f"{__name__}.CorreoLento"}}

    inicio = time.monotonic()
    resp = _solicitud("hilo.aviso@inst.test", ip="198.51.100.70")
    duracion = time.monotonic() - inicio

    assert duracion < 1.0, f"la petición tardó {duracion:.2f} s: el correo retiene el hilo del servidor"
    assert resp.status_code == 201
    assert AccessRequest.objects.filter(email="hilo.aviso@inst.test").exists()
    assert len(hilos) == 1 and hilos[0] is not None
    hilos[0].join(timeout=10)
    assert not hilos[0].is_alive()
    assert len(mail.outbox) == 1


def test_un_fallo_del_correo_no_rompe_la_peticion_ni_la_solicitud(
    settings, commit_al_instante, hilos
):
    settings.SIEP_BACKGROUND_INLINE = False
    settings.MAILERS = {"default": {"BACKEND": f"{__name__}.CorreoRoto"}}

    resp = _solicitud("roto.aviso@inst.test", ip="198.51.100.80")

    assert resp.status_code == 201
    assert AccessRequest.objects.filter(email="roto.aviso@inst.test").exists()
    hilos[0].join(timeout=10)
    assert not hilos[0].is_alive()
    assert len(mail.outbox) == 0


@pytest.fixture
def reloj(settings, monkeypatch):
    """El limitador encendido (agrupa el aviso con su contador) y un reloj que la prueba mueve."""
    settings.SIEP_THROTTLE_ENABLED = True
    instante = {"t": 1_800_000_000.0}  # múltiplo de 600: el inicio de una ventana de 10 minutos
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


def test_cinco_solicitudes_seguidas_producen_un_solo_correo(commit_al_instante, reloj):
    for numero in range(5):
        resp = _solicitud(f"grupo{numero}.aviso@inst.test", ip=f"198.51.100.{40 + numero}")
        assert resp.status_code == 201

    assert len(mail.outbox) == 1
    aviso = mail.outbox[0]
    assert aviso.subject == ASUNTO
    assert "Ana" not in aviso.subject and "Gil" not in aviso.subject
    assert 'Nombre indicado (sin verificar): "Ana Gil"' in aviso.body
    # El conteo se lee al programar el aviso (en la primera solicitud de la ventana): dice 1, no 5.
    assert "Solicitudes pendientes en total: 1" in aviso.body


def test_al_cambiar_de_ventana_la_siguiente_solicitud_vuelve_a_avisar(commit_al_instante, reloj):
    _solicitud("primera.aviso@inst.test", ip="198.51.100.60")
    reloj["t"] += 599  # sigue en la misma ventana: no avisa
    _solicitud("misma.aviso@inst.test", ip="198.51.100.61")
    assert len(mail.outbox) == 1

    reloj["t"] += 1  # ventana nueva
    _solicitud("nueva.aviso@inst.test", ip="198.51.100.62")

    assert len(mail.outbox) == 2
    assert "Solicitudes pendientes en total: 3" in mail.outbox[1].body


def test_una_solicitud_cada_nueve_minutos_no_deja_al_administrador_sin_aviso(commit_al_instante, reloj):
    """Con una ventana deslizante, un goteo de una solicitud cada menos de 10 minutos suprimía los avisos para siempre."""
    for numero in range(7):
        _solicitud(f"goteo{numero}.aviso@inst.test", ip=f"198.51.100.{100 + numero}")
        reloj["t"] += 540

    assert len(mail.outbox) >= 6


def test_con_el_limitador_apagado_todas_las_solicitudes_avisan(commit_al_instante, settings):
    settings.SIEP_THROTTLE_ENABLED = False
    for numero in range(3):
        _solicitud(f"apagado{numero}.aviso@inst.test", ip=f"198.51.100.{120 + numero}")

    assert len(mail.outbox) == 3


def test_el_aviso_se_programa_al_confirmar_y_un_duplicado_no_programa_nada(django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=False) as primera:
        _solicitud("programa.aviso@inst.test", ip="198.51.100.90")
    with django_capture_on_commit_callbacks(execute=False) as repetida:
        _solicitud("programa.aviso@inst.test", ip="198.51.100.91")

    assert len(primera) == 1
    assert len(repetida) == 0

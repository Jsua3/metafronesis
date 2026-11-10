from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.users.models import CustomUser
from shared import eventos
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-38", "SIEP-45")]


@pytest.fixture
def datos(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.SIEP_PUBLIC_URL = "https://ejemplo.test"
    docente = CustomUser.objects.create_user(email="docente@example.test", password="test", role=PROFESOR)
    estudiante = CustomUser.objects.create_user(email="estudiante@example.test", password="test", role=ESTUDIANTE)
    otro = CustomUser.objects.create_user(email="otro@example.test", password="test", role=ESTUDIANTE)
    caso = SimpleNamespace(title="Caso de prueba", created_by=docente)
    version = SimpleNamespace(simulation_case=caso)
    sesion = SimpleNamespace(case_version=version, mensaje="Mensaje de prueba", creada_por=docente)
    convocatoria = SimpleNamespace(estudiante=estudiante)
    intento = SimpleNamespace(student=estudiante, case_version=version)
    return SimpleNamespace(**locals())


def emitir(datos):
    eventos.convocatoria_emitida.send(sender=object, sesion=datos.sesion,
        convocatorias=[datos.convocatoria], codigos={datos.estudiante.pk: "ABCDEFGH"})


def test_convocatoria_avisa_con_codigo(datos):
    from apps.notificaciones.models import Notificacion
    emitir(datos)
    aviso = Notificacion.objects.get(destinatario=datos.estudiante)
    assert aviso.correo_enviado
    assert all(texto in mail.outbox[0].body for texto in ("ABCDEFGH", "Caso de prueba", "Mensaje de prueba", "https://ejemplo.test"))


def test_retirado_recibe_aviso(datos):
    eventos.convocados_cambiaron.send(sender=object, sesion=datos.sesion, agregados=[], retirados=[datos.estudiante], codigos={})
    assert len(mail.outbox) == 1
    assert "retir" in mail.outbox[0].body.lower()


def test_calificacion_avisa_al_estudiante(datos):
    eventos.intento_calificado.send(sender=object, intento=datos.intento, evaluacion=object())
    assert mail.outbox[0].to == [datos.estudiante.email]


def test_retro_avisa_al_estudiante(datos):
    eventos.retroalimentacion_registrada.send(sender=object, intento=datos.intento, docente=datos.docente)
    assert mail.outbox[0].to == [datos.estudiante.email]


def test_fallo_de_correo_queda_marcado(datos):
    from apps.notificaciones.models import Notificacion
    with patch("apps.notificaciones.servicios.send_mail", side_effect=OSError("falló")):
        emitir(datos)
    aviso = Notificacion.objects.get()
    assert not aviso.correo_enviado and aviso.error_correo


def test_solo_veo_las_mias(datos):
    emitir(datos)
    client = APIClient()
    client.force_authenticate(datos.otro)
    assert client.get("/api/me/notifications").data["data"] == []
    client.force_authenticate(datos.estudiante)
    aviso = client.get("/api/me/notifications").data["data"][0]
    assert client.post(f"/api/me/notifications/{aviso['id']}/read").status_code == 200
    client.force_authenticate(datos.otro)
    assert client.post(f"/api/me/notifications/{aviso['id']}/read").status_code == 404


def test_reenvio_solo_por_originador_o_administrador(datos):
    emitir(datos)
    from apps.notificaciones.models import Notificacion
    aviso = Notificacion.objects.get()
    client = APIClient()
    client.force_authenticate(datos.otro)
    assert client.post(f"/api/notifications/{aviso.pk}/resend").status_code in (403, 404)
    docente_ajeno = CustomUser.objects.create_user(email="ajeno@example.test", password="test", role=PROFESOR)
    client.force_authenticate(docente_ajeno)
    assert client.post(f"/api/notifications/{aviso.pk}/resend").status_code == 404
    client.force_authenticate(datos.docente)
    assert client.post(f"/api/notifications/{aviso.pk}/resend").status_code == 200
    admin = CustomUser.objects.create_user(email="admin@example.test", password="test", role=ADMIN)
    client.force_authenticate(admin)
    assert client.post(f"/api/notifications/{aviso.pk}/resend").status_code == 200

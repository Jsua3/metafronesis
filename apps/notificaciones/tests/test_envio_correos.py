"""El envío de los correos de los avisos: espera a la confirmación, usa una conexión por lote y registra los fallos."""
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core import mail

from apps.grupos import notifications as avisos_de_grupo
from apps.notificaciones import servicios
from apps.notificaciones.models import Notificacion
from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-38", "SIEP-45")]


@pytest.fixture
def personas(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    docente = CustomUser.objects.create_user(email="docente@example.test", password="test", role=PROFESOR,
                                             nombre="Ana", apellido="Ruiz")
    estudiantes = [CustomUser.objects.create_user(email=f"e{i}@example.test", password="test", role=ESTUDIANTE)
                   for i in range(3)]
    return SimpleNamespace(docente=docente, estudiantes=estudiantes)


def test_el_correo_espera_a_la_confirmacion(personas, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        servicios.crear_varios(personas.estudiantes, personas.docente, "PRUEBA", "Título", "Cuerpo")
        assert mail.outbox == []
    assert sorted(m.to[0] for m in mail.outbox) == sorted(e.email for e in personas.estudiantes)
    assert Notificacion.objects.filter(correo_enviado=True).count() == 3


def test_un_lote_usa_una_sola_conexion(personas, django_capture_on_commit_callbacks):
    with patch("apps.notificaciones.servicios.get_connection", wraps=servicios.get_connection) as conexion:
        with django_capture_on_commit_callbacks(execute=True):
            servicios.crear_varios(personas.estudiantes, personas.docente, "PRUEBA", "Título", "Cuerpo")
    assert conexion.call_count == 1 and len(mail.outbox) == 3


def test_un_fallo_queda_en_el_aviso_y_en_el_registro(personas, django_capture_on_commit_callbacks, caplog):
    with patch("apps.notificaciones.servicios.send_mail", side_effect=OSError("SMTP caído")):
        with django_capture_on_commit_callbacks(execute=True):
            servicios.crear(personas.estudiantes[0], personas.docente, "PRUEBA", "Título", "Cuerpo")
    aviso = Notificacion.objects.get()
    assert not aviso.correo_enviado and aviso.error_correo == "OSError: SMTP caído"
    assert any("No se pudo enviar el correo del aviso" in r.getMessage() for r in caplog.records)


def test_sin_conexion_todos_quedan_marcados(personas, django_capture_on_commit_callbacks, caplog):
    with patch("apps.notificaciones.servicios.get_connection", side_effect=OSError("sin red")):
        with django_capture_on_commit_callbacks(execute=True):
            servicios.crear_varios(personas.estudiantes, personas.docente, "PRUEBA", "Título", "Cuerpo")
    assert set(Notificacion.objects.values_list("correo_enviado", "error_correo")) == {(False, "OSError: sin red")}
    assert any("No se pudo abrir la conexión de correo" in r.getMessage() for r in caplog.records)


def test_si_la_operacion_se_deshace_no_sale_correo(personas, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=False) as pendientes:
        servicios.crear(personas.estudiantes[0], personas.docente, "PRUEBA", "Título", "Cuerpo")
    assert len(pendientes) == 1 and mail.outbox == []


def test_la_invitacion_a_un_grupo_deja_aviso_y_correo(personas, django_capture_on_commit_callbacks):
    grupo = SimpleNamespace(id=1, nombre="Psicología 101")
    with django_capture_on_commit_callbacks(execute=True):
        avisos_de_grupo.notify_invitation(personas.estudiantes[0], grupo, personas.docente)
    aviso = Notificacion.objects.get()
    assert aviso.tipo == "INVITACION_GRUPO" and aviso.destinatario == personas.estudiantes[0] and aviso.correo_enviado
    assert mail.outbox[0].subject == "[SIEP] Te invitaron al grupo Psicología 101"
    assert "Ana Ruiz te invitó a su grupo «Psicología 101»" in mail.outbox[0].body


def test_las_invitaciones_respetan_el_limite(personas, django_capture_on_commit_callbacks):
    grupo = SimpleNamespace(id=1, nombre="G")
    with django_capture_on_commit_callbacks(execute=True):
        avisos_de_grupo.notify_invitations(personas.estudiantes, grupo, personas.docente, limit=2)
    assert Notificacion.objects.count() == 2 and len(mail.outbox) == 2

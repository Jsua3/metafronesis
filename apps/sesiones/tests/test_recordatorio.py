from datetime import timedelta
from io import StringIO

import pytest
from django.core import mail
from django.core.management import call_command
from django.utils import timezone

from apps.sesiones import recordatorio, servicios
from apps.sesiones.models import Convocatoria, EstadoConvocatoria, EstadoSesion

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-37", "SIEP-42")]


@pytest.fixture(autouse=True)
def correo(settings, monkeypatch):
    # Los correos de los avisos salen al confirmar la transacción; aquí, que nunca se confirma, salen al momento.
    from apps.notificaciones import servicios as avisos
    monkeypatch.setattr(avisos, "al_confirmar", lambda funcion: funcion())
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.SIEP_PUBLIC_URL = "https://ejemplo.test"


def en(minutos, crear_sesion, **cambios):
    inicio = timezone.now() + timedelta(minutes=minutos)
    return crear_sesion(estado=EstadoSesion.PROGRAMADA, inicio=inicio, fin=inicio + timedelta(hours=1), **cambios)


def correr():
    for sesion in list(recordatorio.pendientes()):
        recordatorio.enviar(sesion.pk)


def test_envia_una_vez_dentro_de_la_ventana(crear_sesion, estudiantes):
    sesion = en(25, crear_sesion)
    correr()
    correr()
    assert sorted(m.to[0] for m in mail.outbox) == sorted(e.email for e in estudiantes[:2])
    assert "https://ejemplo.test/portal/simulador" in mail.outbox[0].body
    sesion.refresh_from_db()
    assert sesion.recordatorio_enviado_en is not None


def test_no_envia_antes_de_la_ventana_ni_si_ya_empezo(crear_sesion):
    en(90, crear_sesion)
    en(-5, crear_sesion)
    correr()
    assert mail.outbox == []


@pytest.mark.parametrize("estado", [EstadoSesion.CANCELADA, EstadoSesion.EN_CURSO])
def test_no_envia_si_no_esta_programada(crear_sesion, estado):
    sesion = en(10, crear_sesion)
    sesion.estado = estado
    sesion.save(update_fields=["estado"])
    correr()
    recordatorio.enviar(sesion.pk)
    assert mail.outbox == []


def test_no_envia_a_los_retirados(crear_sesion, estudiantes):
    sesion = en(10, crear_sesion)
    Convocatoria.objects.filter(sesion=sesion, estudiante=estudiantes[0]).update(estado=EstadoConvocatoria.RETIRADA)
    correr()
    assert [m.to[0] for m in mail.outbox] == [estudiantes[1].email]


def test_al_editar_el_horario_el_recordatorio_vuelve_a_salir(crear_sesion, docente):
    sesion = en(10, crear_sesion)
    correr()
    assert len(mail.outbox) == 2
    nuevo = timezone.now() + timedelta(minutes=20)
    servicios.editar(docente, sesion.pk, {"inicio": nuevo, "fin": nuevo + timedelta(hours=1)})
    sesion.refresh_from_db()
    assert sesion.recordatorio_enviado_en is None
    correr()
    assert len(mail.outbox) == 4


def test_editar_el_lugar_no_rearma_el_recordatorio(crear_sesion, docente):
    sesion = en(10, crear_sesion)
    correr()
    servicios.editar(docente, sesion.pk, {"lugar": "Aula 2"})
    correr()
    assert len(mail.outbox) == 2


def test_comando_dry_run_no_envia_y_normal_si(crear_sesion):
    en(10, crear_sesion)
    salida = StringIO()
    call_command("recordar_sesiones", "--dry-run", stdout=salida)
    assert mail.outbox == [] and "1" in salida.getvalue()
    call_command("recordar_sesiones", stdout=StringIO())
    assert len(mail.outbox) == 2


def test_enviar_devuelve_si_envio_y_audita_solo_entonces(crear_sesion, django_capture_on_commit_callbacks):
    from apps.simulation.models import AuditLog
    sesion = en(10, crear_sesion)
    with django_capture_on_commit_callbacks(execute=True):
        assert recordatorio.enviar(sesion.pk) is True
        assert recordatorio.enviar(sesion.pk) is False
    assert AuditLog.objects.filter(action="SESION_RECORDATORIO", resource_id=str(sesion.pk)).count() == 1


def test_enviar_el_mismo_horario_no_rearma(crear_sesion, docente):
    sesion = en(10, crear_sesion)
    correr()
    servicios.editar(docente, sesion.pk, {"inicio": sesion.inicio, "fin": sesion.fin, "lugar": "Aula 3"})
    correr()
    assert len(mail.outbox) == 2

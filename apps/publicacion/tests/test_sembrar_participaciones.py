import secrets
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.grupos.models import Grupo
from apps.reportes import consultas
from apps.sesiones.models import EstadoSesion, Sesion
from apps.simulation.models import AttemptReport, AttemptStatus, ReflectionJournal, RubricEvaluation, SimulationAttempt
from apps.users.models import CustomUser
from shared.policies import ADMIN

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin(monkeypatch):
    monkeypatch.setenv("SIEP_SEMILLA_CLAVE", "Sm" + secrets.token_urlsafe(18) + "9")
    return CustomUser.objects.create_user(email="administracion@example.test", password=secrets.token_urlsafe(20), role=ADMIN,
                                          nombre="Admin", apellido="Prueba")


def sembrar(admin):
    salida = StringIO()
    call_command("sembrar_participaciones", "--publicador", admin.email, stdout=salida)
    return salida.getvalue()


def test_siembra_sesiones_jugadas_con_informes(admin):
    sembrar(admin)
    finalizadas = Sesion.objects.filter(estado=EstadoSesion.FINALIZADA)
    assert finalizadas.count() == 3
    assert all(sesion.finalizada_en < timezone.now() - timezone.timedelta(days=4) for sesion in finalizadas)
    assert Sesion.objects.filter(estado=EstadoSesion.PROGRAMADA, inicio__gt=timezone.now()).count() == 1

    completos = SimulationAttempt.objects.filter(status=AttemptStatus.COMPLETED)
    assert completos.count() == 14
    assert SimulationAttempt.objects.filter(status=AttemptStatus.INCOMPLETE).count() == 1
    assert AttemptReport.objects.filter(attempt__in=completos).count() == 14
    assert RubricEvaluation.objects.filter(origin="DOCENTE").exists()
    assert ReflectionJournal.objects.exists()
    assert all(intento.started_at < timezone.now() - timezone.timedelta(days=4) for intento in SimulationAttempt.objects.all())

    grupo = Grupo.objects.get(codigo="DEMO-PSI-SOC-A")
    version_id = finalizadas.get(grupo=grupo).case_version_id
    reporte = consultas.reporte_grupo(grupo.profesor, grupo.pk, version_id)
    assert reporte["simulacion"] is not None


def test_es_idempotente(admin):
    sembrar(admin)
    salida = sembrar(admin)
    assert Sesion.objects.count() == 4
    assert SimulationAttempt.objects.count() == 15
    assert "sesión finalizada de DEMO-PSI-SOC-A" in salida

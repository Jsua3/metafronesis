from datetime import timedelta

import pytest
from django.utils import timezone

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.sesiones import efectos
from apps.sesiones.models import AutorizacionRepeticion, Convocatoria, EstadoSesion
from apps.simulation.services.access import available_versions
from apps.simulation.services.attempt_api import start, transition
from shared.exceptions import ApiError

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-37", "SIEP-42")]


def iniciada(crear_sesion, estado=EstadoSesion.EN_CURSO, **cambios):
    sesion = crear_sesion(estado=estado, iniciada_en=timezone.now() - timedelta(minutes=1), **cambios)
    efectos.habilitar_caso(sesion)
    return sesion


@pytest.mark.parametrize("estado,codigo", [
    (EstadoSesion.PROGRAMADA, "SESSION_NOT_STARTED"),
    (EstadoSesion.PAUSADA, "SESSION_PAUSED"),
])
def test_no_entra_si_la_sesion_no_esta_en_curso(crear_sesion, estudiantes, version, estado, codigo):
    sesion = iniciada(crear_sesion)
    sesion.estado = estado
    sesion.save(update_fields=["estado"])
    with pytest.raises(ApiError) as error:
        start(estudiantes[0], version.pk)
    assert error.value.api_code == codigo


def test_entra_en_curso_y_una_sola_vez(crear_sesion, estudiantes, version):
    iniciada(crear_sesion)
    intento, creado = start(estudiantes[0], version.pk)
    assert creado
    intento.status = "COMPLETED"
    intento.save(update_fields=["status"])
    with pytest.raises(ApiError) as error:
        start(estudiantes[0], version.pk)
    assert error.value.api_code == "SESSION_ALREADY_PARTICIPATED"


def test_repeticion_autorizada_se_consume(crear_sesion, estudiantes, version, docente):
    sesion = iniciada(crear_sesion)
    intento, _ = start(estudiantes[0], version.pk)
    intento.status = "COMPLETED"
    intento.save(update_fields=["status"])
    convocatoria = Convocatoria.objects.get(sesion=sesion, estudiante=estudiantes[0])
    autorizacion = AutorizacionRepeticion.objects.create(convocatoria=convocatoria, autorizada_por=docente, motivo="Otra vez")
    _, creado = start(estudiantes[0], version.pk)
    autorizacion.refresh_from_db()
    assert creado and autorizacion.usada


def test_ingreso_tardio_se_mide_desde_el_inicio_real(crear_sesion, estudiantes, version):
    ahora = timezone.now()
    iniciada(crear_sesion, inicio=ahora - timedelta(hours=2), fin=ahora + timedelta(minutes=10))
    sesion = Convocatoria.objects.get(estudiante=estudiantes[0]).sesion
    sesion.iniciada_en = ahora - timedelta(minutes=50)
    sesion.save(update_fields=["iniciada_en"])
    with pytest.raises(ApiError) as error:
        start(estudiantes[0], version.pk)
    assert error.value.api_code == "LATE_ENTRY"


def test_quien_ya_juega_puede_volver_aunque_sea_tarde(crear_sesion, estudiantes, version):
    sesion = iniciada(crear_sesion)
    intento, _ = start(estudiantes[0], version.pk)
    sesion.iniciada_en = timezone.now() - timedelta(minutes=50)
    sesion.fin = timezone.now() + timedelta(minutes=5)
    sesion.save(update_fields=["iniciada_en", "fin"])
    mismo, creado = start(estudiantes[0], version.pk)
    assert mismo.pk == intento.pk and not creado


def test_no_reanuda_mientras_la_sesion_esta_pausada(crear_sesion, estudiantes, version):
    sesion = iniciada(crear_sesion)
    intento, _ = start(estudiantes[0], version.pk)
    efectos.pausar_intentos(sesion)
    sesion.estado = EstadoSesion.PAUSADA
    sesion.save(update_fields=["estado"])
    with pytest.raises(ApiError) as error:
        transition(estudiantes[0], intento.pk, "resume")
    assert error.value.api_code == "SESSION_PAUSED"
    sesion.estado = EstadoSesion.EN_CURSO
    sesion.save(update_fields=["estado"])
    assert transition(estudiantes[0], intento.pk, "resume").status == "IN_PROGRESS"


def test_sesion_terminada_ya_no_bloquea_la_asignacion_del_grupo(crear_sesion, estudiantes, version, grupo):
    sesion = iniciada(crear_sesion)
    sesion.estado = EstadoSesion.FINALIZADA
    sesion.save(update_fields=["estado"])
    efectos.deshabilitar_caso(sesion)
    CaseAssignment.objects.create(case_version=version, grupo=grupo)
    assert version in available_versions(estudiantes[0])
    _, creado = start(estudiantes[0], version.pk)
    assert creado


def test_limite_de_tiempo_de_la_sesion(crear_sesion, estudiantes, version):
    from apps.simulation.services import limites
    iniciada(crear_sesion, tiempo_maximo_min=25)
    intento, _ = start(estudiantes[0], version.pk)
    assert limites.minutos_para(intento) == 25

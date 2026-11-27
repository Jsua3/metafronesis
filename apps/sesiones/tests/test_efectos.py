import secrets
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.grupos.models import CaseAssignment
from apps.sesiones import efectos
from apps.sesiones.models import Convocatoria, EstadoConvocatoria, EstadoSesion
from apps.simulation.models import AttemptEvent, SimulationAttempt
from shared import eventos
from shared.exceptions import ApiError

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-35")]


def en_curso(crear_sesion, **cambios):
    sesion = crear_sesion(estado=EstadoSesion.EN_CURSO, iniciada_en=timezone.now() - timedelta(minutes=1), **cambios)
    return sesion


def intento(sesion, estudiante, status="IN_PROGRESS"):
    return SimulationAttempt.objects.create(
        student=estudiante, case_version=sesion.case_version,
        convocatoria=Convocatoria.objects.get(sesion=sesion, estudiante=estudiante),
        current_node=sesion.case_version.nodes.get(start_node=True),
        status=status, attempt_token_hash=secrets.token_hex(32), last_activity_at=timezone.now(),
    )


def test_habilitar_crea_asignaciones_con_la_hora_real(crear_sesion, estudiantes):
    sesion = en_curso(crear_sesion)
    efectos.habilitar_caso(sesion)
    asignaciones = CaseAssignment.objects.filter(case_version=sesion.case_version, active=True)
    assert set(asignaciones.values_list("estudiante_id", flat=True)) == {e.pk for e in estudiantes[:2]}
    assert {(a.opens_at, a.closes_at) for a in asignaciones} == {(sesion.iniciada_en, sesion.fin)}


def test_habilitar_rechaza_si_la_hora_de_fin_paso(crear_sesion):
    sesion = en_curso(crear_sesion, fin=timezone.now() - timedelta(minutes=1), inicio=timezone.now() - timedelta(hours=1))
    with pytest.raises(ApiError) as error:
        efectos.habilitar_caso(sesion)
    assert error.value.api_code == "SESSION_EXPIRED"


def test_habilitar_detecta_otra_sesion_activa_con_el_mismo_caso(crear_sesion, estudiantes):
    en_curso(crear_sesion)
    otra = en_curso(crear_sesion)
    with pytest.raises(ApiError) as error:
        efectos.habilitar_caso(otra)
    assert error.value.api_code == "CONVOCADO_EN_OTRA_SESION"
    assert error.value.extra["estudiantes"] == ["Est0 Prueba", "Est1 Prueba"]


def test_pausar_pone_en_pausa_los_intentos_en_juego(crear_sesion, estudiantes):
    sesion = en_curso(crear_sesion)
    jugando = intento(sesion, estudiantes[0])
    efectos.pausar_intentos(sesion)
    jugando.refresh_from_db()
    assert jugando.status == "PAUSED"
    assert AttemptEvent.objects.filter(attempt=jugando, event_type="PAUSE", detail="Sesión pausada por el docente").exists()


def test_cerrar_intentos_y_deshabilitar(crear_sesion, estudiantes):
    sesion = en_curso(crear_sesion)
    efectos.habilitar_caso(sesion)
    abierto = intento(sesion, estudiantes[0], status="PAUSED")
    efectos.cerrar_intentos(sesion)
    efectos.deshabilitar_caso(sesion)
    abierto.refresh_from_db()
    assert abierto.status == "INCOMPLETE"
    assert not CaseAssignment.objects.filter(case_version=sesion.case_version, active=True).exists()


def test_avisar_cancelacion_envia_la_senal_con_los_convocados(crear_sesion, estudiantes):
    sesion = crear_sesion()
    recibidos = []
    eventos.sesion_cancelada.connect(lambda sender, sesion, estudiantes, **kw: recibidos.extend(estudiantes), weak=False, dispatch_uid="prueba")
    try:
        efectos.avisar_cancelacion(sesion)
    finally:
        eventos.sesion_cancelada.disconnect(dispatch_uid="prueba")
    assert {e.pk for e in recibidos} == {e.pk for e in estudiantes[:2]}


def test_cerrar_salta_el_intento_que_el_estudiante_termino_mientras_tanto(crear_sesion, estudiantes, monkeypatch):
    """Carrera: la lista se arma sin cerrojos; si el estudiante completa su intento antes de que lo bloqueemos,
    finalizar no debe fallar (antes ``cerrar_como_incompleto`` lanzaba 400 y toda la transición se revertía)."""
    sesion = en_curso(crear_sesion)
    termina = intento(sesion, estudiantes[0])
    abierto = intento(sesion, estudiantes[1], status="PAUSED")
    cerrojo_real = efectos.lock_attempt_row

    def el_estudiante_termina_antes(intento_id):
        if intento_id == termina.pk:
            SimulationAttempt.objects.filter(pk=intento_id).update(status="COMPLETED")
        cerrojo_real(intento_id)

    monkeypatch.setattr(efectos, "lock_attempt_row", el_estudiante_termina_antes)
    efectos.cerrar_intentos(sesion)
    termina.refresh_from_db()
    abierto.refresh_from_db()
    assert termina.status == "COMPLETED"
    assert abierto.status == "INCOMPLETE"
    assert not AttemptEvent.objects.filter(attempt=termina, event_type="ATTEMPT_EXPIRED").exists()


def test_pausar_tambien_pausa_al_retirado(crear_sesion, estudiantes):
    sesion = en_curso(crear_sesion)
    jugando = intento(sesion, estudiantes[0])
    Convocatoria.objects.filter(sesion=sesion, estudiante=estudiantes[0]).update(estado=EstadoConvocatoria.RETIRADA)
    efectos.pausar_intentos(sesion)
    jugando.refresh_from_db()
    assert jugando.status == "PAUSED"

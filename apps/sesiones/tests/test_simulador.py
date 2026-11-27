import json
from importlib import import_module
from datetime import timedelta

import pytest
from django.apps import apps as django_apps
from django.utils import timezone

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.sesiones import efectos
from apps.sesiones.models import AutorizacionRepeticion, Convocatoria, EstadoSesion, Sesion
from apps.simulation.models import SimulationAttempt
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
    sesion = iniciada(crear_sesion)
    intento, creado = start(estudiantes[0], version.pk)
    assert creado
    assert intento.convocatoria_id == Convocatoria.objects.get(sesion=sesion, estudiante=estudiantes[0]).pk
    intento.status = "COMPLETED"
    intento.save(update_fields=["status"])
    with pytest.raises(ApiError) as error:
        start(estudiantes[0], version.pk)
    assert error.value.api_code == "SESSION_ALREADY_PARTICIPATED"


def test_un_intento_de_sesiones_solapadas_solo_sale_en_su_sesion_de_origen(
    crear_sesion, estudiantes, version, docente, cliente_docente,
):
    """La convocatoria que habilitó el inicio, no la hora, determina el reporte."""
    from apps.grupos.models import CaseAssignment

    ahora = timezone.now()
    otra = crear_sesion(
        estado=EstadoSesion.EN_CURSO,
        iniciada_en=ahora - timedelta(minutes=2),
        inicio=ahora - timedelta(minutes=5), fin=ahora + timedelta(minutes=55),
    )
    origen = crear_sesion(
        estado=EstadoSesion.EN_CURSO,
        iniciada_en=ahora - timedelta(minutes=1),
        inicio=ahora - timedelta(minutes=5), fin=ahora + timedelta(minutes=55),
    )
    CaseAssignment.objects.create(
        case_version=version, estudiante=estudiantes[0], opens_at=origen.iniciada_en,
        closes_at=origen.fin, active=True, assigned_by=docente,
    )

    intento, creado = start(estudiantes[0], version.pk)
    assert creado
    assert intento.convocatoria_id == Convocatoria.objects.get(sesion=origen, estudiante=estudiantes[0]).pk

    def fila_de(sesion):
        respuesta = cliente_docente.get(f"/api/reportes/sesion/{sesion.pk}/export", {"formato": "json"})
        assert respuesta.status_code == 200
        return next(fila for fila in json.loads(respuesta.content) if fila["correo"] == estudiantes[0].email)

    assert fila_de(origen)["estado"] == "IN_PROGRESS"
    assert fila_de(otra)["estado"] == "SIN_INTENTO"

    from apps.sesiones import servicios
    detalle_origen = {fila["estudianteId"]: fila for fila in servicios.detalle_dto(origen)["convocados"]}
    detalle_otra = {fila["estudianteId"]: fila for fila in servicios.detalle_dto(otra)["convocados"]}
    assert detalle_origen[estudiantes[0].pk]["intento"] == "JUGANDO"
    assert detalle_otra[estudiantes[0].pk]["intento"] == "SIN_EMPEZAR"


def test_migracion_historica_solo_enlaza_una_convocatoria_inequivoca(
    crear_sesion, estudiantes, version, docente,
):
    """El backfill conserva vacío el vínculo si dos sesiones explican el intento."""
    ahora = timezone.now()
    unica = crear_sesion(inicio=ahora - timedelta(minutes=5), fin=ahora + timedelta(minutes=5))
    nodo = version.nodes.get(start_node=True)
    identificable = SimulationAttempt.objects.create(
        student=estudiantes[0], case_version=version, current_node=nodo, attempt_token_hash="historico-unico",
    )
    primera = Sesion.objects.create(
        case_version=version, creada_por=docente, inicio=ahora - timedelta(minutes=5),
        fin=ahora + timedelta(minutes=5), tiempo_maximo_min=30,
    )
    segunda = Sesion.objects.create(
        case_version=version, creada_por=docente, inicio=ahora - timedelta(minutes=5),
        fin=ahora + timedelta(minutes=5), tiempo_maximo_min=30,
    )
    Convocatoria.objects.bulk_create([
        Convocatoria(sesion=primera, estudiante=estudiantes[1]),
        Convocatoria(sesion=segunda, estudiante=estudiantes[1]),
    ])
    ambiguo = SimulationAttempt.objects.create(
        student=estudiantes[1], case_version=version, current_node=nodo, attempt_token_hash="historico-ambiguo",
    )

    migracion = import_module("apps.simulation.migrations.0019_intento_convocatoria")
    migracion.asignar_convocatorias_historicas(django_apps, None)

    identificable.refresh_from_db()
    ambiguo.refresh_from_db()
    assert identificable.convocatoria_id == Convocatoria.objects.get(sesion=unica, estudiante=estudiantes[0]).pk
    assert ambiguo.convocatoria_id is None


def test_repeticion_autorizada_se_consume(crear_sesion, estudiantes, version, docente):
    sesion = iniciada(crear_sesion)
    intento, _ = start(estudiantes[0], version.pk)
    intento.status = "COMPLETED"
    intento.save(update_fields=["status"])
    convocatoria = Convocatoria.objects.get(sesion=sesion, estudiante=estudiantes[0])
    autorizacion = AutorizacionRepeticion.objects.create(convocatoria=convocatoria, autorizada_por=docente, motivo="Otra vez")
    repetido, creado = start(estudiantes[0], version.pk)
    autorizacion.refresh_from_db()
    assert creado and autorizacion.usada
    assert repetido.convocatoria_id == convocatoria.pk


def test_reanudar_conserva_la_convocatoria_y_limite_de_la_sesion_de_origen(
    crear_sesion, estudiantes, version,
):
    """Una sesión solapada posterior no reasigna un intento que ya existe."""
    from apps.simulation.services import limites

    origen = iniciada(crear_sesion, tiempo_maximo_min=25)
    intento, _ = start(estudiantes[0], version.pk)
    convocatoria_origen = Convocatoria.objects.get(sesion=origen, estudiante=estudiantes[0])
    transition(estudiantes[0], intento.pk, "pause")

    ahora = timezone.now()
    crear_sesion(
        estado=EstadoSesion.EN_CURSO,
        iniciada_en=ahora,
        inicio=ahora - timedelta(minutes=5), fin=ahora + timedelta(minutes=55),
        tiempo_maximo_min=5,
    )
    reanudado = transition(estudiantes[0], intento.pk, "resume")
    reanudado.refresh_from_db()

    assert reanudado.convocatoria_id == convocatoria_origen.pk
    assert limites.minutos_para(reanudado) == 25


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


def _orden_de_cerrojos(consultas):
    """Posición de la primera consulta que bloquea la sesión y de la primera que bloquea un intento."""
    from apps.sesiones.models import Sesion
    from apps.simulation.models import SimulationAttempt

    sesiones, intentos = Sesion._meta.db_table, SimulationAttempt._meta.db_table
    sql = [consulta["sql"] for consulta in consultas]
    sesion = next(i for i, s in enumerate(sql) if f'"{sesiones}"' in s and "FOR SHARE" in s)
    intento = next(i for i, s in enumerate(sql) if f'"{intentos}"' in s and "FOR UPDATE" in s)
    return sesion, intento


def test_reanudar_bloquea_la_sesion_antes_que_el_intento(crear_sesion, estudiantes, version):
    """Mismo orden que ``efectos.pausar_intentos`` (sesión → intento): sin abrazo mortal con el docente."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    iniciada(crear_sesion)
    intento, _ = start(estudiantes[0], version.pk)
    transition(estudiantes[0], intento.pk, "pause")
    with CaptureQueriesContext(connection) as capturadas:
        transition(estudiantes[0], intento.pk, "resume")
    sesion, intento_bloqueado = _orden_de_cerrojos(capturadas.captured_queries)
    assert sesion < intento_bloqueado


def test_empezar_bloquea_la_sesion_antes_que_el_intento(crear_sesion, estudiantes, version):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    iniciada(crear_sesion)
    start(estudiantes[0], version.pk)
    with CaptureQueriesContext(connection) as capturadas:
        start(estudiantes[0], version.pk)
    sesion, intento_bloqueado = _orden_de_cerrojos(capturadas.captured_queries)
    assert sesion < intento_bloqueado


def test_la_regla_lee_el_estado_despues_de_bloquear_la_sesion(crear_sesion, estudiantes, version, monkeypatch):
    """Si el docente pausa mientras el estudiante espera el cerrojo, el estudiante ve PAUSADA y no entra."""
    from apps.sesiones import reglas

    sesion = iniciada(crear_sesion)
    bloqueo_real = reglas._bloquear_sesion

    def el_docente_pausa_mientras_esperamos(sesion_id):
        type(sesion).objects.filter(pk=sesion_id).update(estado=EstadoSesion.PAUSADA)
        bloqueo_real(sesion_id)

    monkeypatch.setattr(reglas, "_bloquear_sesion", el_docente_pausa_mientras_esperamos)
    with pytest.raises(ApiError) as error:
        start(estudiantes[0], version.pk)
    assert error.value.api_code == "SESSION_PAUSED"


def test_el_estudiante_lee_su_resultado_cuando_la_sesion_ya_termino(crear_sesion, estudiantes, version, docente):
    from django.http import Http404
    from rest_framework.test import APIClient
    from apps.sesiones import servicios

    sesion = iniciada(crear_sesion)
    intento, _ = start(estudiantes[0], version.pk)
    servicios.finalizar(docente, sesion.pk)
    assert version not in available_versions(estudiantes[0])
    cliente = APIClient()
    cliente.force_authenticate(estudiantes[0])
    base = f"/api/simulation/attempts/{intento.pk}"
    assert cliente.get(base + "/student-report").status_code == 200
    assert cliente.get(base + "/state").status_code == 200
    assert cliente.get(f"/api/simulation/cases/{version.pk}/brief").status_code == 200
    with pytest.raises(Http404):
        transition(estudiantes[0], intento.pk, "pause")
    assert cliente.post(base + "/pause", {}, format="json").status_code == 404
    assert cliente.get(f"/api/simulation/cases/{version.pk}/active-attempt").status_code == 404

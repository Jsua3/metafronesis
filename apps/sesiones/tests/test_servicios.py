from datetime import timedelta

import pytest
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.sesiones import cierre, convocatorias, repeticion, servicios
from apps.sesiones.models import Convocatoria, EstadoConvocatoria, EstadoSesion
from apps.simulation.models import SimulationAttempt
from apps.simulation.services.attempt_api import start
from apps.users.models import CustomUser
from shared.exceptions import ApiError
from shared.policies import ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-35", "SIEP-37", "SIEP-42")]


@pytest.fixture
def datos(grupo, version):
    ahora = timezone.now()
    return {
        "grupoId": grupo.pk, "caseVersionId": version.pk, "espacioAcademico": "Psicología clínica",
        "inicio": ahora - timedelta(minutes=5), "fin": ahora + timedelta(minutes=55), "tiempoMaximoMin": 30,
        "lugar": "Aula 3", "mensaje": "Traigan audífonos",
    }


def test_crear_convoca_solo_a_los_miembros_activos_y_acepta_casos_ajenos(docente, estudiantes, datos):
    sesion = servicios.crear(docente, datos)
    assert sesion.estado == EstadoSesion.PROGRAMADA
    assert set(sesion.convocatorias.values_list("estudiante_id", flat=True)) == {e.pk for e in estudiantes[:2]}


def test_crear_con_grupo_ajeno_es_404(docente, datos):
    otro = CustomUser.objects.create_user("ses-otro@example.test", None, role=PROFESOR)
    ajeno = Grupo.objects.create(nombre="Ajeno", codigo="SES-AJ", profesor=otro)
    with pytest.raises(Http404):
        servicios.crear(docente, {**datos, "grupoId": ajeno.pk})


def test_crear_con_caso_no_publicado_es_400(docente, datos, version):
    version.status = "DRAFT"
    version.save(update_fields=["status"])
    with pytest.raises(ApiError) as error:
        servicios.crear(docente, datos)
    assert error.value.api_code == "CASE_NOT_PUBLISHED"


def test_crear_con_grupo_vacio(docente, datos):
    vacio = Grupo.objects.create(nombre="Vacío", codigo="SES-VAC", profesor=docente)
    with pytest.raises(ApiError) as error:
        servicios.crear(docente, {**datos, "grupoId": vacio.pk})
    assert error.value.api_code == "GROUP_EMPTY"


def test_tiempo_maximo_no_supera_el_estimado(docente, datos):
    with pytest.raises(ApiError) as error:
        servicios.crear(docente, {**datos, "tiempoMaximoMin": 46})
    assert error.value.api_code == "INVALID_TIME_LIMIT"


def test_biblioteca_incluye_casos_publicados_de_otros_autores(version):
    assert version in servicios.biblioteca()
    assert servicios.caso_dto(version) == {
        "caseVersionId": version.pk, "titulo": "Caso de la biblioteca", "version": "1.0.0",
        "autor": "Ana Autora", "tiempoEstimadoMin": 45, "descripcion": "",
    }


def test_ciclo_completo_con_marcas_de_tiempo(docente, estudiantes, datos, version):
    sesion = servicios.crear(docente, datos)
    servicios.iniciar(docente, sesion.pk)
    sesion.refresh_from_db()
    assert sesion.estado == EstadoSesion.EN_CURSO and sesion.iniciada_en is not None
    assert CaseAssignment.objects.filter(case_version=version, active=True).count() == 2
    intento, _ = start(estudiantes[0], version.pk)
    servicios.pausar(docente, sesion.pk)
    intento.refresh_from_db()
    assert intento.status == "PAUSED"
    servicios.reanudar(docente, sesion.pk)
    servicios.finalizar(docente, sesion.pk)
    sesion.refresh_from_db()
    intento.refresh_from_db()
    assert sesion.estado == EstadoSesion.FINALIZADA and sesion.finalizada_en is not None
    assert intento.status == "INCOMPLETE"
    assert not CaseAssignment.objects.filter(case_version=version, active=True).exists()


def test_transicion_invalida_no_cambia_nada(docente, datos):
    sesion = servicios.crear(docente, datos)
    with pytest.raises(ApiError) as error:
        servicios.finalizar(docente, sesion.pk)
    sesion.refresh_from_db()
    assert error.value.api_code == "INVALID_TRANSITION" and sesion.estado == EstadoSesion.PROGRAMADA


def test_cancelar_marca_y_avisa(docente, estudiantes, datos):
    from apps.notificaciones.models import Notificacion
    sesion = servicios.crear(docente, datos)
    servicios.cancelar(docente, sesion.pk)
    sesion.refresh_from_db()
    assert sesion.estado == EstadoSesion.CANCELADA and sesion.cancelada_en is not None
    assert Notificacion.objects.filter(tipo="CANCELACION", destinatario__in=estudiantes[:2]).count() == 2


def test_editar_solo_programada_y_cambiar_grupo_rehace_convocados(docente, estudiantes, datos):
    sesion = servicios.crear(docente, datos)
    otro = Grupo.objects.create(nombre="Otro", codigo="SES-G2", profesor=docente)
    GrupoEstudiante.objects.create(grupo_id=otro.id, estudiante_id=estudiantes[1].id, status="ACTIVE")
    GrupoEstudiante.objects.create(grupo_id=otro.id, estudiante_id=estudiantes[2].id, status="ACTIVE")
    servicios.editar(docente, sesion.pk, {"grupoId": otro.pk, "lugar": "Aula 5"})
    sesion.refresh_from_db()
    assert sesion.lugar == "Aula 5" and sesion.grupo == otro
    assert set(sesion.convocatorias.values_list("estudiante_id", flat=True)) == {estudiantes[1].pk, estudiantes[2].pk}
    servicios.iniciar(docente, sesion.pk)
    with pytest.raises(ApiError) as error:
        servicios.editar(docente, sesion.pk, {"lugar": "Otro"})
    assert error.value.api_code == "INVALID_TRANSITION"


def test_editar_valida_fin_posterior(docente, datos):
    sesion = servicios.crear(docente, datos)
    with pytest.raises(ValidationError):
        servicios.editar(docente, sesion.pk, {"fin": sesion.inicio})


def test_sincronizar_suma_nuevos_y_no_reactiva_retirados(docente, estudiantes, datos, grupo):
    sesion = servicios.crear(docente, datos)
    convocatorias.retirar(docente, sesion.pk, estudiantes[0].pk)
    GrupoEstudiante.objects.filter(grupo_id=grupo.id, estudiante_id=estudiantes[2].id).update(status="ACTIVE")
    assert convocatorias.sincronizar(docente, sesion.pk) == 1
    activos = Convocatoria.objects.filter(sesion=sesion, estado=EstadoConvocatoria.ACTIVA)
    assert set(activos.values_list("estudiante_id", flat=True)) == {estudiantes[1].pk, estudiantes[2].pk}


def test_sincronizar_en_curso_habilita_el_caso_al_nuevo(docente, estudiantes, datos, grupo, version):
    sesion = servicios.crear(docente, datos)
    servicios.iniciar(docente, sesion.pk)
    GrupoEstudiante.objects.filter(grupo_id=grupo.id, estudiante_id=estudiantes[2].id).update(status="ACTIVE")
    convocatorias.sincronizar(docente, sesion.pk)
    assert CaseAssignment.objects.filter(case_version=version, estudiante=estudiantes[2], active=True).exists()


def test_repeticion_la_autoriza_el_dueno_de_la_sesion(docente, estudiantes, datos, version):
    sesion = servicios.crear(docente, datos)
    servicios.iniciar(docente, sesion.pk)
    assert repeticion.autorizar(docente, sesion.pk, estudiantes[0].pk, "Otra vez").pk
    servicios.finalizar(docente, sesion.pk)
    with pytest.raises(ApiError):
        repeticion.autorizar(docente, sesion.pk, estudiantes[0].pk, "Tarde")


def test_detalle_muestra_el_intento_de_cada_convocado(docente, estudiantes, datos, version):
    sesion = servicios.crear(docente, datos)
    servicios.iniciar(docente, sesion.pk)
    start(estudiantes[0], version.pk)
    sesion.refresh_from_db()
    filas = {fila["estudianteId"]: fila for fila in servicios.detalle_dto(sesion)["convocados"]}
    assert filas[estudiantes[0].pk]["intento"] == "JUGANDO"
    assert filas[estudiantes[1].pk]["intento"] == "SIN_EMPEZAR"
    assert servicios.detalle_dto(sesion)["acciones"] == ["pausar", "finalizar", "gestionarConvocados"]


@pytest.mark.parametrize("estado,esperado", [
    (EstadoSesion.PROGRAMADA, EstadoSesion.CANCELADA),
    (EstadoSesion.EN_CURSO, EstadoSesion.FINALIZADA),
    (EstadoSesion.PAUSADA, EstadoSesion.FINALIZADA),
    (EstadoSesion.FINALIZADA, EstadoSesion.FINALIZADA),
    (EstadoSesion.CANCELADA, EstadoSesion.CANCELADA),
])
def test_cierre_automatico(crear_sesion, estado, esperado):
    ahora = timezone.now()
    sesion = crear_sesion(estado=estado, inicio=ahora - timedelta(days=2), fin=ahora - timedelta(days=1, minutes=1),
                          iniciada_en=None if estado == EstadoSesion.PROGRAMADA else ahora - timedelta(days=2))
    cierre.cerrar(sesion.pk)
    sesion.refresh_from_db()
    assert sesion.estado == esperado

from datetime import timedelta

import pytest
from django.contrib.auth.hashers import check_password
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment
from apps.sesiones.models import Convocatoria, Sesion, EstadoSesion
from apps.simulation.models import CaseVersion, SimulationCase, SimulationAttempt, SimulationNode
from apps.simulation.services import limites, reglas_de_inicio
from apps.users.models import CustomUser
from shared.exceptions import ApiError
from shared.policies import ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-37", "SIEP-39")]


@pytest.fixture
def contexto():
    docente = CustomUser.objects.create_user(email="docente-j4b@example.test", role=PROFESOR)
    estudiante = CustomUser.objects.create_user(email="alumno-j4b@example.test", role=ESTUDIANTE)
    caso = SimulationCase.objects.create(code="J4B", title="Caso", created_by=docente)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version="1.0.0", status="PUBLISHED", created_by=docente, estimated_minutes=45)
    ahora = timezone.now()
    sesion = Sesion.objects.create(case_version=version, creada_por=docente, espacio_academico="Curso", inicio=ahora-timedelta(minutes=5), fin=ahora+timedelta(minutes=55), tiempo_maximo_min=30)
    cliente = APIClient()
    cliente.force_authenticate(docente)
    return cliente, estudiante, version, sesion


def convocar(contexto):
    cliente, estudiante, _, sesion = contexto
    return cliente.post(f"/api/sesiones/{sesion.pk}/convocados", {"emails": [estudiante.email]}, format="json")


def test_convocar_genera_codigo_y_asignacion(contexto):
    from apps.sesiones.codigos import validar_codigo
    respuesta = convocar(contexto)
    assert respuesta.status_code == 201
    estudiante = contexto[1]
    codigo = respuesta.data["data"]["codigos"][str(estudiante.pk)]
    convocatoria = Convocatoria.objects.get(estudiante=estudiante)
    assert len(codigo) == 8 and check_password(codigo, convocatoria.codigo_hash)
    assert validar_codigo(estudiante.email, codigo) == (estudiante, convocatoria)
    asignacion = CaseAssignment.objects.get(estudiante=estudiante)
    assert asignacion.active and asignacion.opens_at == contexto[3].inicio and asignacion.closes_at == contexto[3].fin


def test_retirar_invalida_codigo(contexto):
    from apps.sesiones.codigos import validar_codigo
    respuesta = convocar(contexto)
    codigo = respuesta.data["data"]["codigos"][str(contexto[1].pk)]
    cliente, estudiante, _, sesion = contexto
    assert cliente.delete(f"/api/sesiones/{sesion.pk}/convocados/{estudiante.pk}").status_code == 200
    with pytest.raises(ApiError):
        validar_codigo(estudiante.email, codigo)
    assert not CaseAssignment.objects.get(estudiante=estudiante).active


def test_no_inicia_si_la_sesion_no_esta_en_curso(contexto):
    convocar(contexto)
    with pytest.raises(ApiError):
        reglas_de_inicio.verificar(contexto[1], contexto[2])


def test_ingreso_tardio_negado(contexto):
    convocar(contexto)
    sesion = contexto[3]
    sesion.estado = EstadoSesion.EN_CURSO
    sesion.inicio = timezone.now() - timedelta(minutes=40)
    sesion.fin = sesion.inicio + timedelta(hours=1)
    sesion.save()
    with pytest.raises(ApiError):
        reglas_de_inicio.verificar(contexto[1], contexto[2])


def test_segunda_participacion_negada(contexto):
    convocar(contexto)
    _, estudiante, version, sesion = contexto
    sesion.estado = EstadoSesion.EN_CURSO
    sesion.save()
    nodo = SimulationNode.objects.create(case_version=version, node_key="inicio", title="Inicio", narrative="Inicio")
    SimulationAttempt.objects.create(student=estudiante, case_version=version, current_node=nodo, status="COMPLETED", attempt_token_hash="a" * 64)
    with pytest.raises(ApiError):
        reglas_de_inicio.verificar(estudiante, version)


def test_limite_es_el_de_la_sesion(contexto):
    convocar(contexto)
    _, estudiante, version, sesion = contexto
    intento = SimulationAttempt(student=estudiante, case_version=version)
    assert limites.minutos_para(intento) == sesion.tiempo_maximo_min


def test_senales_y_retiro_conservan_intento(contexto):
    from shared.eventos import convocatoria_emitida, convocados_cambiaron
    avisos = []
    def recibir(sender, **datos):
        avisos.append(datos)
    convocatoria_emitida.connect(recibir, weak=False)
    convocados_cambiaron.connect(recibir, weak=False)
    try:
        assert convocar(contexto).status_code == 201
        cliente, estudiante, version, sesion = contexto
        nodo = SimulationNode.objects.create(case_version=version, node_key="inicio", title="Inicio", narrative="Inicio")
        intento = SimulationAttempt.objects.create(student=estudiante, case_version=version, current_node=nodo, attempt_token_hash="b" * 64)
        assert cliente.delete(f"/api/sesiones/{sesion.pk}/convocados/{estudiante.pk}").status_code == 200
        assert SimulationAttempt.objects.filter(pk=intento.pk).exists()
        assert len(avisos) == 3 and avisos[0]["codigos"][estudiante.pk]
        assert avisos[-1]["retirados"] == [estudiante]
    finally:
        convocatoria_emitida.disconnect(recibir)
        convocados_cambiaron.disconnect(recibir)


def test_no_se_sobrescribe_otra_asignacion(contexto):
    _, estudiante, version, sesion = contexto
    anterior = CaseAssignment.objects.create(estudiante=estudiante, case_version=version)
    assert convocar(contexto).status_code == 409
    anterior.refresh_from_db()
    assert anterior.active and anterior.opens_at is None
    assert not Convocatoria.objects.filter(sesion=sesion).exists()


def test_docente_ajeno_no_modifica_convocados(contexto):
    cliente, estudiante, _, sesion = contexto
    otro = CustomUser.objects.create_user(email="otro-j4b@example.test", role=PROFESOR)
    cliente.force_authenticate(otro)
    assert cliente.post(f"/api/sesiones/{sesion.pk}/convocados", {"emails": [estudiante.email]}, format="json").status_code == 404

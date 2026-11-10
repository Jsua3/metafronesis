from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment
from apps.sesiones.models import Convocatoria, EstadoSesion, Sesion
from apps.simulation.models import CaseVersion, SimulationAttempt, SimulationCase, SimulationNode
from apps.simulation.services.attempt_api import start
from apps.users.models import CustomUser
from shared.exceptions import ApiError
from shared.policies import ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-42", "SIEP-36")]


@pytest.fixture
def contexto():
    docente = CustomUser.objects.create_user(email="j4c-docente@example.test", role=PROFESOR)
    estudiante = CustomUser.objects.create_user(email="j4c-estudiante@example.test", role=ESTUDIANTE)
    caso = SimulationCase.objects.create(code="J4C", title="Caso", created_by=docente)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version="1.0.0", status="PUBLISHED", created_by=docente, estimated_minutes=45, validated_at=timezone.now(), definition_hash="sha256:" + "a" * 64)
    nodo = SimulationNode.objects.create(case_version=version, node_key="inicio", title="Inicio", narrative="Inicio", start_node=True)
    ahora = timezone.now()
    sesion = Sesion.objects.create(case_version=version, creada_por=docente, espacio_academico="Curso", inicio=ahora-timedelta(minutes=5), fin=ahora+timedelta(minutes=55), tiempo_maximo_min=30, estado=EstadoSesion.EN_CURSO)
    convocatoria = Convocatoria.objects.create(sesion=sesion, estudiante=estudiante, codigo_hash="hash")
    asignacion = CaseAssignment.objects.create(case_version=version, estudiante=estudiante, opens_at=sesion.inicio, closes_at=sesion.fin)
    cliente = APIClient()
    cliente.force_authenticate(docente)
    return locals()


def intento(contexto, estado="COMPLETED"):
    return SimulationAttempt.objects.create(student=contexto["estudiante"], case_version=contexto["version"], current_node=contexto["nodo"], status=estado, attempt_token_hash="a" * 64)


def test_creador_autoriza_una_repeticion(contexto):
    from apps.sesiones.models import AutorizacionRepeticion
    intento(contexto)
    sesion, estudiante = contexto["sesion"], contexto["estudiante"]
    respuesta = contexto["cliente"].post(f"/api/sesiones/{sesion.pk}/convocados/{estudiante.pk}/repeticion", {"motivo": "Nueva oportunidad"}, format="json")
    assert respuesta.status_code == 201
    autorizacion = AutorizacionRepeticion.objects.get(convocatoria=contexto["convocatoria"])
    nuevo, creado = start(estudiante, contexto["version"].pk)
    assert creado
    autorizacion.refresh_from_db()
    assert autorizacion.usada
    nuevo.status = "COMPLETED"
    nuevo.save(update_fields=["status"])
    with pytest.raises(ApiError) as error:
        start(estudiante, contexto["version"].pk)
    assert error.value.api_code == "SESSION_ALREADY_PARTICIPATED"


def test_otro_docente_403(contexto):
    otro = CustomUser.objects.create_user(email="j4c-otro@example.test", role=PROFESOR)
    contexto["cliente"].force_authenticate(otro)
    sesion, estudiante = contexto["sesion"], contexto["estudiante"]
    respuesta = contexto["cliente"].post(f"/api/sesiones/{sesion.pk}/convocados/{estudiante.pk}/repeticion", {"motivo": "Solicitud"}, format="json")
    assert respuesta.status_code == 403


def test_sesion_finalizada_no_admite_autorizacion(contexto):
    sesion, estudiante = contexto["sesion"], contexto["estudiante"]
    sesion.estado = EstadoSesion.FINALIZADA
    sesion.save(update_fields=["estado"])
    respuesta = contexto["cliente"].post(f"/api/sesiones/{sesion.pk}/convocados/{estudiante.pk}/repeticion", {"motivo": "Solicitud"}, format="json")
    assert respuesta.status_code == 409


def vencer(contexto):
    sesion = contexto["sesion"]
    sesion.inicio = timezone.now() - timedelta(days=2, hours=1)
    sesion.fin = timezone.now() - timedelta(days=1, minutes=1)
    sesion.save(update_fields=["inicio", "fin"])
    CaseAssignment.objects.filter(pk=contexto["asignacion"].pk).update(opens_at=sesion.inicio, closes_at=sesion.fin)
    abierto = intento(contexto, "IN_PROGRESS")
    SimulationAttempt.objects.filter(pk=abierto.pk).update(started_at=sesion.inicio + timedelta(minutes=1))
    return abierto


def test_cierre_automatico_finaliza_y_cierra_incompletos(contexto):
    abierto = vencer(contexto)
    call_command("cerrar_sesiones_vencidas", "--dry-run")
    contexto["sesion"].refresh_from_db()
    assert contexto["sesion"].estado == EstadoSesion.EN_CURSO
    call_command("cerrar_sesiones_vencidas")
    contexto["sesion"].refresh_from_db()
    abierto.refresh_from_db()
    contexto["asignacion"].refresh_from_db()
    assert contexto["sesion"].estado == EstadoSesion.FINALIZADA
    assert abierto.status == "INCOMPLETE"
    assert abierto.events.filter(event_type="ATTEMPT_EXPIRED", detail="CIERRE_DE_SESION").exists()
    assert not contexto["asignacion"].active


def test_cierre_es_idempotente(contexto):
    abierto = vencer(contexto)
    call_command("cerrar_sesiones_vencidas")
    call_command("cerrar_sesiones_vencidas")
    assert abierto.events.filter(event_type="ATTEMPT_EXPIRED").count() == 1

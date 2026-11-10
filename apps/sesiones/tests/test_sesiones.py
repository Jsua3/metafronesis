from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, SimulationCase
from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-35", "SIEP-36")]


@pytest.fixture
def datos():
    docente = CustomUser.objects.create_user(email="sesiones@example.test", role=PROFESOR)
    caso = SimulationCase.objects.create(code="SES", title="Caso", created_by=docente)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version="1.0.0", status="PUBLISHED", created_by=docente, estimated_minutes=45)
    cliente = APIClient()
    cliente.force_authenticate(docente)
    inicio = timezone.now().replace(microsecond=0)
    cuerpo = {"caseVersionId": version.pk, "espacioAcademico": "Psicología", "inicio": inicio.isoformat(), "fin": (inicio + timedelta(hours=1)).isoformat(), "tiempoMaximoMin": 30, "lugar": "Aula", "mensaje": "Mensaje", "emails": []}
    return cliente, version, cuerpo


def test_agenda_valida_reglas_de_tiempo(datos):
    cliente, version, cuerpo = datos
    for cambios in ({"fin": cuerpo["inicio"]}, {"tiempoMaximoMin": 46}, {"tiempoMaximoMin": 0}):
        assert cliente.post("/api/sesiones", {**cuerpo, **cambios}, format="json").status_code == 400
    assert cliente.post("/api/sesiones", cuerpo, format="json").status_code == 201


def test_solo_versiones_publicadas(datos):
    cliente, version, cuerpo = datos
    version.status = "DRAFT"
    version.save(update_fields=["status"])
    assert cliente.post("/api/sesiones", cuerpo, format="json").status_code == 400


def test_ciclo_sin_iniciar_en_curso_finalizada(datos):
    cliente, _, cuerpo = datos
    creada = cliente.post("/api/sesiones", cuerpo, format="json")
    assert creada.status_code == 201
    sesion = creada.data["data"]
    assert sesion["estado"] == "SIN_INICIAR"
    url = f"/api/sesiones/{sesion['id']}"
    assert cliente.get(url).data["data"]["estado"] == "SIN_INICIAR"
    assert cliente.post(url + "/iniciar").data["data"]["estado"] == "EN_CURSO"
    assert cliente.post(url + "/finalizar").data["data"]["estado"] == "FINALIZADA"


def test_transicion_invalida_409(datos):
    cliente, _, cuerpo = datos
    pk = cliente.post("/api/sesiones", cuerpo, format="json").data["data"]["id"]
    respuesta = cliente.post(f"/api/sesiones/{pk}/finalizar")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "INVALID_TRANSITION"


def test_sesiones_y_casos_ajenos_no_son_accesibles(datos):
    cliente, _, cuerpo = datos
    pk = cliente.post("/api/sesiones", cuerpo, format="json").data["data"]["id"]
    otro = CustomUser.objects.create_user(email="otro@example.test", role=PROFESOR)
    cliente.force_authenticate(otro)
    assert cliente.get("/api/sesiones").data["data"] == []
    assert cliente.get(f"/api/sesiones/{pk}").status_code == 404
    assert cliente.post(f"/api/sesiones/{pk}/iniciar").status_code == 404
    assert cliente.post("/api/sesiones", cuerpo, format="json").status_code == 404


def test_correos_no_revelan_existencia(datos):
    from apps.sesiones.models import Convocatoria

    cliente, _, cuerpo = datos
    estudiante = CustomUser.objects.create_user(email="Alumno@example.test", role=ESTUDIANTE)
    respuesta = cliente.post("/api/sesiones", {**cuerpo, "emails": [estudiante.email.lower(), "ausente@example.test"]}, format="json")
    assert respuesta.status_code == 201
    assert "ausente@example.test" not in str(respuesta.data)
    convocatoria = Convocatoria.objects.get(sesion_id=respuesta.data["data"]["id"])
    assert convocatoria.estudiante == estudiante
    from django.contrib.auth.hashers import check_password
    assert check_password(respuesta.data["data"]["codigos"][str(estudiante.pk)], convocatoria.codigo_hash)


def test_cierre_automatico_de_cada_estado():
    from apps.sesiones.estados import EnCurso, Finalizada, SinIniciar
    assert all(estado().cerrar_automatico() == "FINALIZADA" for estado in (SinIniciar, EnCurso, Finalizada))

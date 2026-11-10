from datetime import timedelta

import pytest
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.sesiones.models import Convocatoria, EstadoSesion, Sesion
from apps.simulation.models import CaseVersion, SimulationCase
from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-18")]


@pytest.fixture
def acceso():
    docente = CustomUser.objects.create_user(email="docente-m5@example.test", role=PROFESOR)
    estudiante = CustomUser.objects.create_user(email="estudiante-m5@example.test", role=ESTUDIANTE)
    caso = SimulationCase.objects.create(code="M5", title="Caso", created_by=docente)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version="1.0.0", created_by=docente)
    ahora = timezone.now()
    sesion = Sesion.objects.create(case_version=version, creada_por=docente, espacio_academico="Curso", inicio=ahora, fin=ahora + timedelta(hours=1), tiempo_maximo_min=30)
    Convocatoria.objects.create(sesion=sesion, estudiante=estudiante, codigo_hash=make_password("ABC23456"))
    return APIClient(), estudiante, sesion


def test_entra_con_codigo_vigente(acceso):
    cliente, estudiante, _ = acceso
    respuesta = cliente.post("/api/auth/code-login", {"email": estudiante.email.upper(), "code": "ABC23456"}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["user"]["id"] == estudiante.pk
    assert AccessToken(respuesta.data["data"]["token"])["userId"] == estudiante.pk


def test_codigo_malo_401_mismo_mensaje(acceso):
    cliente, estudiante, _ = acceso
    malo = cliente.post("/api/auth/code-login", {"email": estudiante.email, "code": "ERRADO"}, format="json")
    desconocido = cliente.post("/api/auth/code-login", {"email": "nadie@example.test", "code": "ABC23456"}, format="json")
    clave = cliente.post("/api/auth/login", {"email": estudiante.email, "password": "errada"}, format="json")
    assert malo.status_code == desconocido.status_code == clave.status_code == 401
    assert malo.data == desconocido.data == clave.data


def test_sesion_finalizada_401(acceso):
    cliente, estudiante, sesion = acceso
    sesion.estado = EstadoSesion.FINALIZADA
    sesion.save(update_fields=["estado"])
    respuesta = cliente.post("/api/auth/code-login", {"email": estudiante.email, "code": "ABC23456"}, format="json")
    assert respuesta.status_code == 401
    assert respuesta.data == {"success": False, "code": "INVALID_CREDENTIALS", "message": "Credenciales inválidas"}


def test_codigo_vencido_401(acceso):
    cliente, estudiante, sesion = acceso
    sesion.fin = timezone.now() - timedelta(seconds=1)
    sesion.save(update_fields=["fin"])
    respuesta = cliente.post("/api/auth/code-login", {"email": estudiante.email, "code": "ABC23456"}, format="json")
    assert respuesta.status_code == 401


def test_cuenta_inactiva_401(acceso):
    cliente, estudiante, _ = acceso
    estudiante.activo = False
    estudiante.save(update_fields=["activo"])
    respuesta = cliente.post("/api/auth/code-login", {"email": estudiante.email, "code": "ABC23456"}, format="json")
    assert respuesta.status_code == 401


def test_codigo_no_autentica_otro_rol(acceso):
    cliente, estudiante, _ = acceso
    estudiante.role = PROFESOR
    estudiante.save(update_fields=["role"])
    respuesta = cliente.post("/api/auth/code-login", {"email": estudiante.email, "code": "ABC23456"}, format="json")
    assert respuesta.status_code == 401

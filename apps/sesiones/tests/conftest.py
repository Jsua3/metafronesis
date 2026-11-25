from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo, GrupoEstudiante
from apps.sesiones.models import Convocatoria, Sesion
from apps.simulation.models import CaseVersion, SimulationCase, SimulationNode
from apps.users.models import CustomUser
from shared.policies import ESTUDIANTE, PROFESOR


@pytest.fixture
def docente():
    return CustomUser.objects.create_user("ses-docente@example.test", None, nombre="Diana", apellido="Docente", role=PROFESOR)


@pytest.fixture
def autor():
    return CustomUser.objects.create_user("ses-autor@example.test", None, nombre="Ana", apellido="Autora", role=PROFESOR)


@pytest.fixture
def estudiantes():
    return [
        CustomUser.objects.create_user(f"ses-est{n}@example.test", None, nombre=f"Est{n}", apellido="Prueba", role=ESTUDIANTE)
        for n in range(3)
    ]


@pytest.fixture
def grupo(docente, estudiantes):
    grupo = Grupo.objects.create(nombre="Psicología 1", codigo="SES-G1", profesor=docente)
    activos, invitado = estudiantes[:2], estudiantes[2]
    for estudiante in activos:
        GrupoEstudiante.objects.create(grupo_id=grupo.id, estudiante_id=estudiante.id, status="ACTIVE")
    GrupoEstudiante.objects.create(grupo_id=grupo.id, estudiante_id=invitado.id, status="INVITED")
    return grupo


@pytest.fixture
def version(autor):
    """Un caso de la biblioteca: publicado, activo y validado, de OTRO autor."""
    caso = SimulationCase.objects.create(code="SES-CASO", title="Caso de la biblioteca", created_by=autor)
    version = CaseVersion.objects.create(
        simulation_case=caso, semantic_version="1.0.0", status="PUBLISHED", created_by=autor, estimated_minutes=45,
        validated_at=timezone.now(), definition_hash="sha256:" + "a" * 64,
    )
    SimulationNode.objects.create(case_version=version, node_key="inicio", title="Inicio", narrative="Inicio", start_node=True)
    return version


@pytest.fixture
def crear_sesion(docente, grupo, version):
    """Crea una sesión por ORM con los miembros ACTIVE convocados (sin pasar por la API)."""

    def crear(**cambios):
        ahora = timezone.now()
        datos = {
            "case_version": version, "grupo": grupo, "creada_por": docente,
            "inicio": ahora - timedelta(minutes=5), "fin": ahora + timedelta(minutes=55), "tiempo_maximo_min": 30,
        }
        datos.update(cambios)
        sesion = Sesion.objects.create(**datos)
        for miembro in GrupoEstudiante.objects.filter(grupo=sesion.grupo, status="ACTIVE"):
            Convocatoria.objects.create(sesion=sesion, estudiante_id=miembro.estudiante_id)
        return sesion

    return crear


@pytest.fixture
def cliente_docente(docente):
    cliente = APIClient()
    cliente.force_authenticate(docente)
    return cliente

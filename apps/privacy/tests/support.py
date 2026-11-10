"""Ayudantes comunes de las pruebas de consentimiento (S3-2a): personas nuevas, la versión publicada y un cliente.

Las cuentas de prueba no llevan clave (``password=None`` deja una clave inutilizable, sin el costo de BCrypt): las pruebas
entran con ``force_authenticate``. Así no hay ninguna clave, ni literal ni generada, en estos archivos.
"""
import secrets

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.simulation.models import CaseVersion, SimulationCase

User = get_user_model()

BASE = "/api/simulation"


def url_consentimiento(version_id):
    return f"{BASE}/cases/{version_id}/consent"


def crear_persona(rol, etiqueta):
    """Una cuenta nueva con un correo único de esta ejecución."""
    sufijo = secrets.token_hex(4)
    return User.objects.create_user(
        email=f"{etiqueta}-{sufijo}@example.com",
        password=None,
        nombre="Prueba",
        apellido=etiqueta.capitalize(),
        role=rol,
    )


def cliente(persona=None):
    """Un cliente de la API; con ``persona`` va autenticado como ella."""
    api = APIClient()
    if persona is not None:
        api.force_authenticate(user=persona)
    return api


def version_publicada():
    """Una versión publicada propia de la prueba."""
    return crear_version(crear_persona("PROFESOR", "autor"), estado="PUBLISHED")


def crear_version(autor, *, estado="DRAFT", activo=True):
    """Una versión de caso nueva en el ``estado`` dado, de un caso ``activo`` o dado de baja."""
    caso = SimulationCase.objects.create(
        code=f"CONS-{secrets.token_hex(4)}", title="Caso de prueba", created_by=autor, active=activo
    )
    return CaseVersion.objects.create(
        simulation_case=caso, semantic_version="0.1.0", status=estado, created_by=autor
    )


def asignar_caso(estudiante, version):
    """El caso queda asignado a ``estudiante`` por un grupo suyo (un docente nuevo). Devuelve el grupo."""
    docente = crear_persona("PROFESOR", "titular")
    grupo = Grupo.objects.create(nombre="Grupo de consentimiento", codigo=f"CONS-{secrets.token_hex(4)}", profesor=docente)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status="ACTIVE")
    CaseAssignment.objects.create(grupo=grupo, case_version=version)
    return grupo

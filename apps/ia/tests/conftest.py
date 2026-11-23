import json

import pytest
from rest_framework.test import APIClient

from apps.simulation.models import CaseVersion, DecisionOption, SimulationCase, SimulationNode
from apps.simulation.models.world import CaseCharacter, MapObject, SceneMap
from apps.users.models import CustomUser, PermisoDeAutoria
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR


def armar_caso(docente, codigo):
    """Un borrador con dos escenas, una sala, un personaje, una persona en la sala, un hito, un final y dos respuestas."""
    caso = SimulationCase.objects.create(code=codigo, title=f"Caso {codigo}", created_by=docente)
    reglas = {
        "milestones": [{"key": "hito_uno", "label": "Escuchó sin juzgar"}],
        "endings": [{"key": "final_base", "title": "Base", "message": "Cierre.", "tone": "neutral"}],
    }
    version = CaseVersion.objects.create(
        simulation_case=caso, semantic_version="1.0.0", created_by=docente, rules=json.dumps(reglas),
    )
    inicio = SimulationNode.objects.create(
        case_version=version, node_key="inicio", title="Inicio", narrative="Ana llega a la oficina.", start_node=True,
    )
    cierre = SimulationNode.objects.create(
        case_version=version, node_key="cierre", title="Cierre", narrative="La conversación termina.", terminal_node=True,
    )
    sala = SceneMap.objects.create(case_version=version, node=inicio, map_key="sala", title="Sala", width=800, height=600)
    personaje = CaseCharacter.objects.create(case_version=version, character_key="ana", display_name="Ana", role_label="Consultante")
    objeto = MapObject.objects.create(
        scene_map=sala, object_key="ana", label="Ana", object_type="PERSON", position_x=100, position_y=100, character=personaje,
    )
    recomendada = DecisionOption.objects.create(
        case_version=version, option_key="a", source_node=inicio, target_node=cierre,
        text="Te escucho con calma.", response_class="RECOMMENDED", feedback_text="Da seguridad.",
    )
    contraindicada = DecisionOption.objects.create(
        case_version=version, option_key="b", source_node=inicio, target_node=cierre,
        text="Cuéntame ya qué pasó.", response_class="CONTRAINDICATED", prohibition_reason="Presiona a la persona.",
    )
    return {
        "version": version, "inicio": inicio, "cierre": cierre, "sala": sala, "personaje": personaje, "objeto": objeto,
        "recomendada": recomendada, "contraindicada": contraindicada, "hito": "hito_uno",
    }


@pytest.fixture
def docentes(db):
    admin = CustomUser.objects.create_user(email="admin-asistente@example.test", password="clave", role=ADMIN)
    docentes = [CustomUser.objects.create_user(email=f"asistente{i}@example.test", password="clave", role=PROFESOR) for i in range(2)]
    for docente in docentes:
        PermisoDeAutoria.objects.create(docente=docente, otorgado_por=admin)
    return docentes, admin


@pytest.fixture
def docente(docentes):
    return docentes[0][0]


@pytest.fixture
def caso(docente):
    return armar_caso(docente, "ASIST-1")


@pytest.fixture
def version(caso):
    return caso["version"]


@pytest.fixture
def ajeno(docentes):
    """Las filas reales de OTRO caso: existen en la base, pero no en el caso de ``caso``."""
    return armar_caso(docentes[0][1], "ASIST-2")


def cliente_de(usuario):
    cliente = APIClient()
    cliente.force_authenticate(usuario)
    return cliente


@pytest.fixture
def cliente(docente):
    return cliente_de(docente)


@pytest.fixture
def estudiante(db):
    return CustomUser.objects.create_user(email="estudiante-asistente@example.test", password="clave", role=ESTUDIANTE)

import pytest
from rest_framework.test import APIClient

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.models import (AttemptEvent, CaseVersion, DecisionOption, Rubric,
                                    SimulationAttempt, SimulationCase, SimulationNode,
                                    SimulationRubricAssignment)
from apps.users.models import CustomUser
from shared.policies import ADMIN, ESTUDIANTE, PROFESOR

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-32", "SIEP-43")]


@pytest.fixture
def datos():
    docente = CustomUser.objects.create_user(email="docente@test.local", role=PROFESOR)
    otro = CustomUser.objects.create_user(email="otro@test.local", role=PROFESOR)
    alumno = CustomUser.objects.create_user(email="alumno@test.local", role=ESTUDIANTE)
    ajeno = CustomUser.objects.create_user(email="ajeno@test.local", role=ESTUDIANTE)
    admin = CustomUser.objects.create_user(email="admin@test.local", role=ADMIN)
    grupo = Grupo.objects.create(nombre="Grupo", codigo="G1", profesor=docente)
    grupo_ajeno = Grupo.objects.create(nombre="Otro", codigo="G2", profesor=otro)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=alumno, status=MembershipStatus.ACTIVE)
    GrupoEstudiante.objects.create(grupo=grupo_ajeno, estudiante=ajeno, status=MembershipStatus.ACTIVE)
    caso = SimulationCase.objects.create(code="CASO", title="Caso", created_by=docente)
    version = CaseVersion.objects.create(simulation_case=caso, semantic_version="1.0.0", created_by=docente)
    nodo = SimulationNode.objects.create(case_version=version, node_key="inicio", title="Inicio", narrative="Texto", decision_prompt="Pregunta")
    fin = SimulationNode.objects.create(case_version=version, node_key="fin", title="Fin", narrative="Fin", terminal_node=True)
    opcion = DecisionOption.objects.create(case_version=version, source_node=nodo, target_node=fin, option_key="opcion", text="Opción", response_class="RECOMMENDED", feedback_text="Explicación", theory_basis="Teoría")
    intento = SimulationAttempt.objects.create(student=alumno, case_version=version, current_node=nodo, attempt_token_hash="uno")
    intento_ajeno = SimulationAttempt.objects.create(student=ajeno, case_version=version, current_node=nodo, attempt_token_hash="dos")
    AttemptEvent.objects.create(attempt=intento, event_type="DECISION_SELECTED", node=nodo, decision_option=opcion)
    rubrica = Rubric.objects.create(name="Rúbrica", created_by=docente)
    SimulationRubricAssignment.objects.create(case_version=version, rubric=rubrica)
    cliente = APIClient()
    cliente.force_authenticate(docente)
    return locals()


def test_docente_ve_intentos_de_sus_grupos(datos):
    respuesta = datos["cliente"].get("/api/instructor/attempts", {"grupo_id": datos["grupo"].pk, "case_version_id": datos["version"].pk})
    assert respuesta.status_code == 200
    assert [x["attemptId"] for x in respuesta.data["data"]] == [str(datos["intento"].pk)]


def test_no_ve_estudiantes_ajenos(datos):
    cliente = datos["cliente"]
    respuesta = cliente.get("/api/instructor/attempts")
    assert respuesta.status_code == 200
    assert str(datos["intento_ajeno"].pk) not in [x["attemptId"] for x in respuesta.data["data"]]
    assert cliente.get(f'/api/instructor/attempts/{datos["intento_ajeno"].pk}').status_code == 404
    assert cliente.put(f'/api/instructor/attempts/{datos["intento_ajeno"].pk}/feedback', {"comment": "Texto"}, format="json").status_code == 404
    assert cliente.get("/api/instructor/attempts", {"grupo_id": datos["grupo_ajeno"].pk}).status_code == 404


def test_detalle_trae_decisiones_y_justificacion(datos):
    respuesta = datos["cliente"].get(f'/api/instructor/attempts/{datos["intento"].pk}')
    assert respuesta.status_code == 200
    detalle = respuesta.data["data"]
    assert detalle["decisions"][0]["justification"] == {"feedback": "Explicación", "theoryBasis": "Teoría"}
    assert {"evaluation", "rubric", "teacherFeedback"} <= detalle.keys()


def test_registra_retroalimentacion_general(datos):
    cliente = datos["cliente"]
    url = f'/api/instructor/attempts/{datos["intento"].pk}/feedback'
    assert cliente.put(url, {"comment": "  Buen trabajo  "}, format="json").status_code == 200
    assert cliente.get(url.removesuffix("/feedback")).data["data"]["teacherFeedback"] == "Buen trabajo"
    assert cliente.put(url, {"comment": "Actualizado"}, format="json").status_code == 200
    assert datos["intento"].rubric_evaluations.count() == 1


def test_retro_vacia_400(datos):
    respuesta = datos["cliente"].put(f'/api/instructor/attempts/{datos["intento"].pk}/feedback', {"comment": "  "}, format="json")
    assert respuesta.status_code == 400
    assert respuesta.data["code"] == "FEEDBACK_EMPTY"


def test_estudiante_no_entra_403(datos):
    datos["cliente"].force_authenticate(datos["alumno"])
    assert datos["cliente"].get("/api/instructor/attempts").status_code == 403


def test_admin_ve_todos_y_filtros_no_amplian_alcance(datos):
    cliente = datos["cliente"]
    cliente.force_authenticate(datos["admin"])
    respuesta = cliente.get("/api/instructor/attempts")
    assert {x["attemptId"] for x in respuesta.data["data"]} == {str(datos["intento"].pk), str(datos["intento_ajeno"].pk)}


@pytest.mark.parametrize("desactivar", ["grupo", "membresia"])
def test_membresia_o_grupo_inactivo_no_da_alcance(datos, desactivar):
    if desactivar == "grupo":
        datos["grupo"].activo = False
        datos["grupo"].save(update_fields=["activo"])
    else:
        GrupoEstudiante.objects.filter(grupo=datos["grupo"], estudiante=datos["alumno"]).update(status=MembershipStatus.REMOVED)
    respuesta = datos["cliente"].get("/api/instructor/attempts")
    assert respuesta.data["data"] == []
    assert datos["cliente"].get(f'/api/instructor/attempts/{datos["intento"].pk}').status_code == 404

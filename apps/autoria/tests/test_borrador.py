import pytest
from apps.simulation.models import CaseVersion, SimulationNode, DecisionOption

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-22")]
URL = "/api/authoring/cases"


def crear(cliente, code="CASO"):
    return cliente.post(URL, {"code": code, "title": "Caso", "estimatedMinutes": 45}, format="json")


def test_docente_crea_borrador_con_escena_inicial(cliente):
    respuesta = crear(cliente)
    assert respuesta.status_code == 201
    version = CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])
    assert (version.status, version.semantic_version, version.estimated_minutes) == ("DRAFT", "1.0.0", 45)
    assert version.nodes.count() == 1 and version.nodes.get().start_node


def test_codigo_repetido_409(cliente):
    assert crear(cliente).status_code == 201
    respuesta = crear(cliente)
    assert respuesta.status_code == 409 and respuesta.data["code"] == "CASE_CODE_TAKEN"


def test_estudiante_no_crea_403(cliente, usuarios):
    cliente.force_authenticate(usuarios[2])
    assert crear(cliente).status_code == 403


def test_docente_no_ve_casos_ajenos(cliente, usuarios):
    version_id = crear(cliente).data["data"]["versionId"]
    cliente.force_authenticate(usuarios[1])
    assert cliente.get(URL).data["data"] == []
    assert cliente.get(f"{URL}/{version_id}/definition").status_code == 404


def test_definicion_con_consultas_constantes(cliente, django_assert_max_num_queries):
    version_id = crear(cliente).data["data"]["versionId"]
    version = CaseVersion.objects.get(pk=version_id)
    nodos = list(version.nodes.all())
    for i in range(4):
        nodos.append(SimulationNode.objects.create(case_version=version, node_key=f"n{i}", title="Escena", narrative="Texto"))
    for i in range(10):
        DecisionOption.objects.create(case_version=version, source_node=nodos[i % 5], target_node=nodos[(i + 1) % 5], option_key=f"d{i}", text="Opción", response_class="RECOMMENDED")
    with django_assert_max_num_queries(6):
        respuesta = cliente.get(f"{URL}/{version_id}/definition")
        assert respuesta.status_code == 200
        assert len(respuesta.data["data"]["nodes"]) == 5
        assert sum(len(n["decisions"]) for n in respuesta.data["data"]["nodes"]) == 10


def test_ficha_con_revision_vieja_409(cliente, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    respuesta = cliente.put(f"{URL}/{version_id}/brief", {"title": "Nuevo", "revision": 99}, format="json")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "REVISION_CONFLICT"


def test_ficha_sin_revision_400(cliente, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    respuesta = cliente.put(f"{URL}/{version_id}/brief", {"title": "Nuevo"}, format="json")
    assert respuesta.status_code == 400 and respuesta.data["code"] == "REVISION_REQUIRED"


def test_ficha_actualiza_y_aumenta_revision(cliente, usuarios, settings):
    settings.REVISION_REQUIRED = True
    version_id = crear(cliente).data["data"]["versionId"]
    respuesta = cliente.put(f"{URL}/{version_id}/brief", {"title": "Nuevo", "revision": 0, "learningObjectives": ["Aprender"]}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["revision"] == 1
    assert respuesta.data["data"]["brief"]["learningObjectives"] == ["Aprender"]
    version = CaseVersion.objects.get(pk=version_id)
    assert version.last_edited_by == usuarios[0] and version.simulation_case.title == "Nuevo"


@pytest.mark.parametrize("estado", ["IN_REVIEW", "PUBLISHED", "ARCHIVED"])
def test_ficha_no_edita_version_no_borrador(cliente, estado):
    version_id = crear(cliente).data["data"]["versionId"]
    CaseVersion.objects.filter(pk=version_id).update(status=estado)
    respuesta = cliente.put(f"{URL}/{version_id}/brief", {"title": "Nuevo", "revision": 0}, format="json")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "VERSION_NOT_EDITABLE"


def test_tiempo_invalido_400(cliente):
    respuesta = cliente.post(URL, {"code": "C", "title": "Caso", "estimatedMinutes": 0}, format="json")
    assert respuesta.status_code == 400
    assert not CaseVersion.objects.exists()

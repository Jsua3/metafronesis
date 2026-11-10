import pytest

from apps.simulation.models import CaseVersion, DecisionOption, SimulationNode
from apps.autoria import decisiones
from shared.exceptions import ApiError

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-23", "SIEP-24", "SIEP-25")]
BASE = "/api/authoring/cases"


@pytest.fixture
def caso(cliente):
    respuesta = cliente.post(BASE, {"code": "CASO", "title": "Caso"}, format="json")
    version = CaseVersion.objects.get(pk=respuesta.data["data"]["versionId"])
    origen = version.nodes.get()
    destino = SimulationNode.objects.create(case_version=version, node_key="destino", title="Destino", narrative="")
    return version, origen, destino


def datos_decision(origen, destino):
    return {"sourceNodeId": origen.pk, "targetNodeId": destino.pk, "text": "Opción",
            "responseClass": "RECOMMENDED", "feedback": "Explicación", "theoryBasis": "Fundamento"}


def test_crea_escena_y_decision_con_justificacion(cliente, caso):
    version, origen, _ = caso
    url = f"{BASE}/{version.pk}"
    escena = cliente.post(f"{url}/nodes", {"title": "Nueva", "narrative": "Texto", "start": True}, format="json")
    assert escena.status_code == 201
    assert escena.data["data"]["key"] == "escena-1"
    origen.refresh_from_db()
    assert not origen.start_node
    destino = SimulationNode.objects.get(pk=escena.data["data"]["id"])
    respuesta = cliente.post(f"{url}/decisions", datos_decision(origen, destino), format="json")
    assert respuesta.status_code == 201
    opcion = DecisionOption.objects.get(pk=respuesta.data["data"]["id"])
    assert (opcion.feedback_text, opcion.theory_basis) == ("Explicación", "Fundamento")
    version.refresh_from_db()
    assert version.version == 2


def test_clase_invalida_400(cliente, caso):
    version, origen, destino = caso
    datos = {**datos_decision(origen, destino), "responseClass": "INVALIDA"}
    assert cliente.post(f"{BASE}/{version.pk}/decisions", datos, format="json").status_code == 400


def test_destino_de_otra_version_400(cliente, caso):
    version, origen, _ = caso
    otra = cliente.post(BASE, {"code": "OTRO", "title": "Otro"}, format="json")
    ajeno = CaseVersion.objects.get(pk=otra.data["data"]["versionId"]).nodes.get()
    respuesta = cliente.post(f"{BASE}/{version.pk}/decisions", datos_decision(origen, ajeno), format="json")
    assert respuesta.status_code == 400 and respuesta.data["code"] == "NODE_NOT_IN_VERSION"


def test_borrar_escena_destino_409(cliente, caso):
    version, origen, destino = caso
    DecisionOption.objects.create(case_version=version, source_node=origen, target_node=destino,
                                  option_key="d1", text="Opción", response_class="RECOMMENDED")
    respuesta = cliente.delete(f"{BASE}/{version.pk}/nodes/{destino.pk}")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "NODE_IN_USE"


@pytest.mark.parametrize("estado", ["IN_REVIEW", "PUBLISHED", "ARCHIVED"])
@pytest.mark.parametrize("metodo,ruta", [("post", "nodes"), ("put", "nodes/{n}"),
    ("delete", "nodes/{n}"), ("post", "decisions"), ("put", "decisions/{d}"),
    ("delete", "decisions/{d}")])
def test_no_se_edita_lo_que_no_es_borrador(cliente, caso, estado, metodo, ruta):
    version, origen, destino = caso
    decision = DecisionOption.objects.create(case_version=version, source_node=origen, target_node=destino,
                                              option_key="d1", text="Opción", response_class="RECOMMENDED")
    CaseVersion.objects.filter(pk=version.pk).update(status=estado)
    url = f"{BASE}/{version.pk}/" + ruta.format(n=origen.pk, d=decision.pk)
    datos = {**datos_decision(origen, destino), "title": "Escena", "narrative": "Texto"}
    respuesta = getattr(cliente, metodo)(url, datos, format="json")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "VERSION_NOT_EDITABLE"


def test_escena_de_otra_version_en_la_url_404(cliente, caso):
    version, _, _ = caso
    otra = cliente.post(BASE, {"code": "OTRO", "title": "Otro"}, format="json")
    ajeno = CaseVersion.objects.get(pk=otra.data["data"]["versionId"]).nodes.get()
    respuesta = cliente.put(f"{BASE}/{version.pk}/nodes/{ajeno.pk}", {"title": "Cambio"}, format="json")
    assert respuesta.status_code == 404


def test_actualizar_y_borrar_decision_y_escena(cliente, caso, settings):
    settings.REVISION_REQUIRED = True
    version, origen, destino = caso
    url = f"{BASE}/{version.pk}"
    datos = {**datos_decision(origen, destino), "revision": 0}
    creada = cliente.post(f"{url}/decisions", datos, format="json")
    decision_id = creada.data["data"]["id"]
    assert cliente.put(f"{url}/decisions/{decision_id}", {"text": "Modificada", "revision": 1}, format="json").status_code == 200
    assert DecisionOption.objects.get(pk=decision_id).text == "Modificada"
    assert cliente.delete(f"{url}/decisions/{decision_id}", {"revision": 2}, format="json").status_code == 200
    assert cliente.put(f"{url}/nodes/{destino.pk}", {"title": "Modificada", "revision": 3}, format="json").status_code == 200
    assert cliente.delete(f"{url}/nodes/{destino.pk}", {"revision": 4}, format="json").status_code == 200
    version.refresh_from_db()
    assert version.version == 5 and not version.nodes.filter(pk=destino.pk).exists()


def test_validaciones_de_revision_clave_y_bucle(cliente, caso, settings):
    settings.REVISION_REQUIRED = True
    version, origen, destino = caso
    url = f"{BASE}/{version.pk}"
    escena = {"key": "destino", "title": "Escena", "narrative": ""}
    respuesta = cliente.post(f"{url}/nodes", escena, format="json")
    assert respuesta.status_code == 400 and respuesta.data["code"] == "REVISION_REQUIRED"
    respuesta = cliente.post(f"{url}/nodes", {**escena, "revision": 1}, format="json")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "REVISION_CONFLICT"
    respuesta = cliente.post(f"{url}/nodes", {**escena, "revision": 0}, format="json")
    assert respuesta.status_code == 409 and respuesta.data["code"] == "NODE_KEY_TAKEN"
    datos = {**datos_decision(origen, origen), "revision": 0}
    respuesta = cliente.post(f"{url}/decisions", datos, format="json")
    assert respuesta.status_code == 400 and respuesta.data["code"] == "DECISION_LOOP"


def test_servicio_rechaza_clase_invalida(caso, usuarios):
    version, origen, destino = caso
    datos = {**datos_decision(origen, destino), "responseClass": "INVALIDA"}
    with pytest.raises(ApiError) as error:
        decisiones.crear(usuarios[0], version.pk, datos, None)
    assert error.value.status_code == 400

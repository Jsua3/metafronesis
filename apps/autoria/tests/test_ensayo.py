import json

import pytest
from rest_framework.test import APIClient

from apps.simulation.models import (
    AttemptEvent, AttemptStatus, CaseVersion, DecisionOption, MapObject, SceneMap, SimulationAttempt, SimulationNode,
)
from apps.users.models import CustomUser
from shared.policies import ADMIN

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-243", "RF-17", "RF-19", "RNF-08")]

CASOS = "/api/authoring/cases"
JUEGO = "/api/simulation/attempts"
POSICION_INICIAL = 50
ALCANCE_PUERTA_CERCANA = 60


def _cliente(usuario):
    cliente = APIClient()
    cliente.force_authenticate(usuario)
    return cliente


@pytest.fixture
def borrador(usuarios):
    """Un borrador de la primera docente: escena de inicio con sala y una puerta hacia la escena final."""
    autora = usuarios[0]
    creado = _cliente(autora).post(CASOS, {"code": "ENSAYO", "title": "Caso a ensayar"}, format="json")
    assert creado.status_code == 201
    version = CaseVersion.objects.get(pk=creado.data["data"]["versionId"])
    inicio = version.nodes.get(start_node=True)
    final = SimulationNode.objects.create(case_version=version, node_key="fin", title="Final", narrative="Fin", terminal_node=True)
    DecisionOption.objects.create(
        case_version=version, source_node=inicio, target_node=final, option_key="terminar", text="Terminar",
        response_class="RECOMMENDED",
    )
    sala = SceneMap.objects.create(
        case_version=version, node=inicio, map_key="sala-inicio", title="Inicio", width=500, height=400,
        spawn_x=POSICION_INICIAL, spawn_y=POSICION_INICIAL,
    )
    SceneMap.objects.create(
        case_version=version, node=final, map_key="sala-final", title="Final", width=500, height=400,
        spawn_x=POSICION_INICIAL, spawn_y=POSICION_INICIAL,
    )
    MapObject.objects.create(
        scene_map=sala, object_key="puerta", label="Puerta", object_type="EXIT", position_x=ALCANCE_PUERTA_CERCANA,
        position_y=POSICION_INICIAL, width=20, height=20,
        metadata_json=json.dumps({"targetNodeKey": "fin", "entryX": POSICION_INICIAL, "entryY": POSICION_INICIAL}),
    )
    return {"version": version, "inicio": inicio, "final": final, "autora": autora, "otra": usuarios[1],
            "estudiante": usuarios[2], "url": f"{CASOS}/{version.pk}/rehearsal"}


def _abrir(borrador, usuario=None):
    return _cliente(usuario or borrador["autora"]).post(borrador["url"], {}, format="json")


def test_la_autora_abre_el_ensayo_de_su_borrador(borrador):
    respuesta = _abrir(borrador)
    assert respuesta.status_code == 201
    datos = respuesta.data["data"]
    assert datos["status"] == AttemptStatus.IN_PROGRESS and "rehearsal" in datos
    assert datos["caseVersionId"] == borrador["version"].pk and datos["currentNode"]["id"] == borrador["inicio"].pk
    intento = SimulationAttempt.all_objects.get(pk=datos["attemptId"])
    assert intento.is_rehearsal and intento.student_id == borrador["autora"].pk


def test_abrir_otra_vez_reanuda_el_mismo_ensayo(borrador):
    primero = _abrir(borrador).data["data"]
    segundo = _abrir(borrador)
    assert segundo.status_code == 200
    assert segundo.data["data"]["attemptId"] == primero["attemptId"]
    assert SimulationAttempt.all_objects.filter(is_rehearsal=True).count() == 1


def test_el_administrador_puede_ensayar_el_borrador_ajeno(borrador):
    admin = CustomUser.objects.create_user(email="admin-ensayo@example.test", role=ADMIN)
    respuesta = _abrir(borrador, admin)
    assert respuesta.status_code == 201
    assert SimulationAttempt.all_objects.get(pk=respuesta.data["data"]["attemptId"]).student_id == admin.pk


@pytest.mark.parametrize("quien", ["otra", "estudiante"])
def test_quien_no_es_autor_no_ensaya(borrador, quien):
    respuesta = _abrir(borrador, borrador[quien])
    assert respuesta.status_code in (403, 404)
    assert respuesta.data["success"] is False
    assert not SimulationAttempt.all_objects.exists()


def test_sin_sesion_se_rechaza(borrador):
    assert APIClient().post(borrador["url"], {}, format="json").status_code == 401


@pytest.mark.parametrize("estado", ["IN_REVIEW", "PUBLISHED", "ARCHIVED"])
def test_solo_se_ensaya_una_version_en_borrador(borrador, estado):
    CaseVersion.objects.filter(pk=borrador["version"].pk).update(status=estado)
    respuesta = _abrir(borrador)
    assert respuesta.status_code == 409 and respuesta.data["code"] == "VERSION_NOT_EDITABLE"
    assert not SimulationAttempt.all_objects.exists()


def test_el_ensayo_se_lee_por_su_ruta(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    respuesta = _cliente(borrador["autora"]).get(f"{borrador['url']}/{intento}")
    assert respuesta.status_code == 200
    assert respuesta.data["data"]["rehearsal"]["sceneId"] == borrador["inicio"].pk


def test_otra_docente_no_lee_ni_ajusta_el_ensayo_ajeno(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    ruta = f"{borrador['url']}/{intento}"
    ajena = _cliente(borrador["otra"])
    assert ajena.get(ruta).status_code == 404
    assert ajena.patch(ruta, {"irA": borrador["final"].pk}, format="json").status_code == 404


def test_el_ajuste_mueve_el_ensayo_a_otra_escena_de_la_version(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    respuesta = _cliente(borrador["autora"]).patch(
        f"{borrador['url']}/{intento}", {"irA": borrador["final"].pk}, format="json"
    )
    assert respuesta.status_code == 200 and respuesta.data["data"]["rehearsal"]["sceneId"] == borrador["final"].pk
    assert SimulationAttempt.all_objects.get(pk=intento).current_node_id == borrador["final"].pk


def test_el_ajuste_rechaza_una_escena_de_otro_caso(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    ajena = SimulationNode.objects.create(
        case_version=CaseVersion.objects.create(
            simulation_case=borrador["version"].simulation_case, semantic_version="2.0.0", created_by=borrador["autora"]
        ),
        node_key="otra", title="Otra", narrative="Otra",
    )
    respuesta = _cliente(borrador["autora"]).patch(f"{borrador['url']}/{intento}", {"irA": ajena.pk}, format="json")
    assert respuesta.status_code == 400 and respuesta.data["success"] is False


def test_el_ensayo_usa_el_mundo_del_juego_y_cruza_una_puerta(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    autora = _cliente(borrador["autora"])
    mundo = autora.get(f"{JUEGO}/{intento}/world")
    assert mundo.status_code == 200
    assert mundo.data["data"]["map"]["key"] == "sala-inicio"
    assert mundo.data["data"]["player"] == {"x": POSICION_INICIAL, "y": POSICION_INICIAL}
    cruce = autora.post(f"{JUEGO}/{intento}/enter-room", {"targetNodeKey": "fin", "doorKey": "puerta"}, format="json")
    assert cruce.status_code == 200 and cruce.data["data"]["map"]["key"] == "sala-final"
    assert AttemptEvent.objects.filter(attempt_id=intento, event_type="ROOM_ENTERED").count() == 1


def test_el_ensayo_cierra_el_final_sin_dejar_rastro_de_estudiante(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    opcion = DecisionOption.objects.get(option_key="terminar")
    respuesta = _cliente(borrador["autora"]).post(
        f"{JUEGO}/{intento}/decisions", {"decision_option_id": opcion.pk, "request_id": "paso-1"}, format="json"
    )
    assert respuesta.status_code == 200
    cerrado = SimulationAttempt.all_objects.get(pk=intento)
    assert cerrado.status == AttemptStatus.COMPLETED
    assert not cerrado.rubric_evaluations.exists() and not hasattr(cerrado, "reports")


def test_el_estudiante_no_juega_el_ensayo_ajeno(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    assert _cliente(borrador["estudiante"]).get(f"{JUEGO}/{intento}/world").status_code in (403, 404)
    assert _cliente(borrador["otra"]).get(f"{JUEGO}/{intento}/world").status_code in (403, 404)


def test_el_gestor_por_defecto_no_ve_los_ensayos_del_historial_ni_del_intento_activo(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    # El historial y el intento activo del juego leen ``SimulationAttempt.objects``: el ensayo no existe para ellos.
    assert not SimulationAttempt.objects.filter(student=borrador["autora"]).exists()
    assert not SimulationAttempt.objects.filter(case_version=borrador["version"], status=AttemptStatus.IN_PROGRESS).exists()
    assert SimulationAttempt.all_objects.filter(pk=intento).exists()


def test_el_ensayo_no_aparece_en_reportes_ni_en_revision(borrador):
    intento = _abrir(borrador).data["data"]["attemptId"]
    admin = CustomUser.objects.create_user(email="admin-revision@example.test", role=ADMIN)
    cliente = _cliente(admin)
    listado = cliente.get("/api/instructor/attempts")
    assert listado.status_code == 200
    assert intento not in json.dumps(listado.data, default=str)
    assert cliente.get(f"/api/instructor/attempts/{intento}").status_code == 404
    assert cliente.get(f"/api/instructor/attempts/{intento}/trace").status_code == 404
    assert not SimulationAttempt.objects.filter(pk=intento).exists()
    assert SimulationAttempt.all_objects.filter(pk=intento).exists()


def test_el_ensayo_no_cuenta_como_intento_abierto_del_estudiante(borrador):
    _abrir(borrador)
    # La misma persona puede tener a la vez un ensayo y un intento real sin chocar con el índice único.
    SimulationAttempt.objects.create(
        student=borrador["autora"], case_version=borrador["version"], current_node=borrador["inicio"], attempt_token_hash="real"
    )
    assert SimulationAttempt.all_objects.filter(student=borrador["autora"]).count() == 2


def test_borrar_una_escena_descarta_los_ensayos_de_la_version(borrador):
    _abrir(borrador)
    escena = SimulationNode.objects.create(case_version=borrador["version"], node_key="suelta", title="Suelta", narrative="x")
    ensayo = SimulationAttempt.all_objects.get(is_rehearsal=True)
    SimulationAttempt.all_objects.filter(pk=ensayo.pk).update(current_node=escena)
    revision = CaseVersion.objects.get(pk=borrador["version"].pk).version
    respuesta = _cliente(borrador["autora"]).delete(
        f"{CASOS}/{borrador['version'].pk}/nodes/{escena.pk}", {"revision": revision}, format="json"
    )
    assert respuesta.status_code == 200
    assert not SimulationAttempt.all_objects.filter(is_rehearsal=True).exists()

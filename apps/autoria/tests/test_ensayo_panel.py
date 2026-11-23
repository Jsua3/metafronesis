"""SIEP-243: el panel del ensayo del borrador (bloque ``rehearsal``) y el juego del ensayo por las rutas normales.

``POST/GET/PATCH /api/authoring/cases/<versionId>/rehearsal[/<attemptId>]``: la docente dueña (o el ADMIN) abre su borrador en
el juego real y el bloque le dice por qué una respuesta no aparece, qué comentarios se dicen, qué lleva explorado y qué puede
marcar. Un PATCH valida todo antes de escribir.
"""
import json
from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from apps.simulation.models import (
    AttemptEvent, AttemptStatus, AttemptWorldState, CaseCharacter, CaseVersion, ClinicalTool, DecisionOption, MapObject,
    SceneMap, SimulationAttempt, SimulationNode,
)
from apps.users.models import CustomUser
from shared.policies import ADMIN

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-243", "RF-17", "RF-19", "RNF-08")]

CASOS = "/api/authoring/cases"
JUEGO = "/api/simulation/attempts"


def _cliente(usuario):
    cliente = APIClient()
    cliente.force_authenticate(usuario)
    return cliente


def _mapa(version, nodo, clave, sala, *, ambiente=None, objetos=()):
    mapa, _ = SceneMap.objects.update_or_create(
        node=nodo,
        defaults=dict(case_version=version, map_key=clave, title=clave, width=640, height=480, spawn_x=50, spawn_y=50,
                      ambient_json=json.dumps({"salaId": sala, **(ambiente or {})})),
    )
    MapObject.objects.filter(scene_map=mapa).delete()
    for clave_objeto, etiqueta, tipo in objetos:
        MapObject.objects.create(scene_map=mapa, object_key=clave_objeto, label=etiqueta, object_type=tipo)
    return mapa


@pytest.fixture
def mundo(usuarios):
    """Un borrador: escena de inicio con gente, un objeto, una vecina de ambiente y respuestas con requisito."""
    profesora, otra, estudiante = usuarios
    admin = CustomUser.objects.create_user(email="admin-panel@example.test", role=ADMIN)
    creado = _cliente(profesora).post(CASOS, {"code": "PANEL", "title": "Caso para ensayar"}, format="json")
    assert creado.status_code == 201, creado.data
    version = CaseVersion.objects.get(pk=creado.data["data"]["versionId"])
    inicio = version.nodes.get(start_node=True)
    segunda = SimulationNode.objects.create(case_version=version, node_key="segunda", title="Segunda escena", narrative="Segunda.")
    final = SimulationNode.objects.create(case_version=version, node_key="fin", title="Final", narrative="Fin.", terminal_node=True)
    abuela = CaseCharacter.objects.create(case_version=version, character_key="abuela", display_name="Abuela")
    ClinicalTool.objects.create(case_version=version, tool_code="linterna", label="Linterna")
    ClinicalTool.objects.create(case_version=version, tool_code="libreta", label="Libreta")
    mapa_inicio = _mapa(
        version, inicio, "mapa-inicio", "sala-a",
        ambiente={"ambientNpcs": [{"key": "vecina", "name": "La vecina", "x": 10, "y": 10, "interactionRadius": 40}]},
        objetos=[("foto", "Una foto", "OBJECT"), ("escondida", "Nota escondida", "NOTE")],
    )
    MapObject.objects.create(scene_map=mapa_inicio, object_key="abuela-obj", label="Abuela de la casa", object_type="PERSON", character=abuela)
    MapObject.objects.filter(scene_map=mapa_inicio, object_key="escondida").update(visible=False)
    _mapa(version, segunda, "mapa-segunda", "sala-b", objetos=[("tio", "El tío", "PERSON"), ("foto-b", "Foto b", "OBJECT")])
    con_requisito = DecisionOption.objects.create(
        case_version=version, source_node=inicio, target_node=segunda, option_key="preguntar", text="Preguntar por la casa",
        response_class="RECOMMENDED", requires_json=json.dumps({"talked": "abuela-obj"}),
    )
    libre = DecisionOption.objects.create(
        case_version=version, source_node=inicio, target_node=segunda, option_key="seguir", text="Seguir adelante",
        response_class="ACCEPTABLE",
    )
    rota = DecisionOption.objects.create(
        case_version=version, source_node=inicio, target_node=final, option_key="rota", text="Opción rota",
        response_class="RISKY", requires_json="{no es json",
    )
    DecisionOption.objects.create(
        case_version=version, source_node=segunda, target_node=final, option_key="a-fin", text="Terminar", response_class="RECOMMENDED",
    )
    inicio.comments_json = json.dumps([
        {"personaje": "abuela", "linea": "Mira la foto.", "cuando": {"inspected": "foto"}},
        {"personaje": "abuela", "linea": "Pasa, pasa."},
    ])
    inicio.save()
    return SimpleNamespace(version=version, profesora=profesora, otra=otra, estudiante=estudiante, admin=admin, inicio=inicio,
                           segunda=segunda, final=final, con_requisito=con_requisito, libre=libre, rota=rota, mapa_inicio=mapa_inicio)


def _abrir(mundo, usuario=None, **cuerpo):
    return _cliente(usuario or mundo.profesora).post(f"{CASOS}/{mundo.version.pk}/rehearsal", cuerpo, format="json")


def _ensayo(mundo, usuario=None, **cuerpo):
    respuesta = _abrir(mundo, usuario, **cuerpo)
    assert respuesta.status_code in (200, 201), respuesta.data
    return respuesta.data["data"]


def _ajustar(mundo, ensayo, cuerpo, usuario=None):
    return _cliente(usuario or mundo.profesora).patch(f"{CASOS}/{mundo.version.pk}/rehearsal/{ensayo['attemptId']}", cuerpo, format="json")


def _bloque(respuesta):
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]["rehearsal"]


def _foto(attempt_id):
    """Todo lo que un PATCH podría tocar, para comparar antes y después."""
    intento = SimulationAttempt.all_objects.get(pk=attempt_id)
    mundo = AttemptWorldState.objects.filter(attempt_id=attempt_id).first()
    return (
        intento.current_node_id, intento.state_json,
        None if mundo is None else (mundo.scene_map_id, mundo.flags, mundo.inventory, mundo.inspected_object_keys, mundo.used_tool_keys),
        list(AttemptEvent.objects.filter(attempt_id=attempt_id).values_list("id", flat=True)),
    )


# ─── Abrir: el estado del juego más el bloque ──────────────────────────────────────────────────────────────────────
def test_abrir_devuelve_el_estado_del_juego_mas_el_bloque(mundo):
    respuesta = _abrir(mundo)
    assert respuesta.status_code == 201
    datos = respuesta.data["data"]
    assert datos["status"] == AttemptStatus.IN_PROGRESS and datos["currentNode"]["id"] == mundo.inicio.pk
    assert datos["caseVersionId"] == mundo.version.pk and datos["rehearsal"]["sceneId"] == mundo.inicio.pk
    juego = _cliente(mundo.profesora).get(f"{JUEGO}/{datos['attemptId']}/state")
    assert juego.status_code == 200 and juego.data["data"]["currentNode"]["id"] == mundo.inicio.pk
    assert "rehearsal" not in juego.data["data"]


def test_abrir_en_la_escena_pedida(mundo):
    datos = _ensayo(mundo, desde=mundo.segunda.pk)
    assert datos["currentNode"]["id"] == mundo.segunda.pk and datos["rehearsal"]["sceneId"] == mundo.segunda.pk


def test_sin_desde_y_con_uno_abierto_se_reanuda(mundo):
    primero = _ensayo(mundo)
    segundo = _abrir(mundo)
    assert segundo.status_code == 200 and segundo.data["data"]["attemptId"] == primero["attemptId"]
    assert "rehearsal" in segundo.data["data"]


def test_abrir_con_desde_reemplaza_el_anterior(mundo):
    primero = _ensayo(mundo)
    segundo = _abrir(mundo, desde=mundo.segunda.pk)
    assert segundo.status_code == 201 and segundo.data["data"]["attemptId"] != primero["attemptId"]
    viejo = SimulationAttempt.all_objects.get(pk=primero["attemptId"])
    assert viejo.status == AttemptStatus.REPLACED and viejo.replaced_by_id == mundo.profesora.pk
    abiertos = SimulationAttempt.all_objects.filter(is_rehearsal=True, status__in=("IN_PROGRESS", "PAUSED"))
    assert [str(a.pk) for a in abiertos] == [segundo.data["data"]["attemptId"]]


def test_desde_debe_ser_una_escena_de_la_version(mundo):
    otra_version = CaseVersion.objects.create(simulation_case=mundo.version.simulation_case, semantic_version="9.0.0", created_by=mundo.profesora)
    ajena = SimulationNode.objects.create(case_version=otra_version, node_key="ajena", title="Ajena", narrative="x")
    for desde in (999999, ajena.pk):
        respuesta = _abrir(mundo, desde=desde)
        assert respuesta.status_code == 400 and respuesta.data["field"] == "desde"
    assert not SimulationAttempt.all_objects.exists()


# ─── El bloque ─────────────────────────────────────────────────────────────────────────────────────────────────────
def test_el_bloque_dice_por_que_no_aparece_una_respuesta(mundo):
    por_id = {o["id"]: o for o in _ensayo(mundo)["rehearsal"]["options"]}
    assert set(por_id) == {mundo.con_requisito.pk, mundo.libre.pk, mundo.rota.pk}
    pedida = por_id[mundo.con_requisito.pk]
    assert pedida["offered"] is False and pedida["retainedBy"] == "facts" and pedida["text"] == "Preguntar por la casa"
    assert pedida["missing"] == [{"kind": "talked", "key": "abuela-obj", "label": "Abuela de la casa"}]
    assert por_id[mundo.libre.pk] == {"id": mundo.libre.pk, "text": "Seguir adelante", "offered": True, "missing": [], "retainedBy": None}
    assert por_id[mundo.rota.pk]["offered"] is False and por_id[mundo.rota.pk]["retainedBy"] == "broken"


def test_una_respuesta_retenida_por_una_condicion_sin_hechos_dice_condition(mundo):
    DecisionOption.objects.filter(pk=mundo.con_requisito.pk).update(requires_json=json.dumps({"milestone": "hito-x"}))
    pedida = next(o for o in _ensayo(mundo)["rehearsal"]["options"] if o["id"] == mundo.con_requisito.pk)
    assert pedida["offered"] is False and pedida["retainedBy"] == "condition" and pedida["missing"] == []


def test_el_bloque_trae_todos_los_comentarios_con_due_y_missing(mundo):
    pedido, libre = _ensayo(mundo)["rehearsal"]["comments"]
    assert pedido == {"index": 0, "personaje": "abuela", "line": "Mira la foto.", "due": False, "retainedBy": "condition",
                      "missing": [{"kind": "inspected", "key": "foto", "label": "Una foto"}]}
    assert libre["due"] is True and libre["missing"] == [] and libre["retainedBy"] is None and libre["line"] == "Pasa, pasa."


def test_un_comentario_retenido_dice_por_que(mundo):
    mundo.inicio.comments_json = json.dumps([
        {"personaje": "nadie", "linea": "No hay quien lo diga."},
        {"personaje": "abuela", "linea": "Cuando mal escrito.", "cuando": {"inventado": "x"}},
        {"personaje": "abuela", "linea": "Pide explorar.", "cuando": {"inspected": "foto"}},
        {"personaje": "abuela", "linea": "Se dice."},
        {"personaje": "nadie", "linea": "Sin quien y con condición.", "cuando": {"inspected": "foto"}},
    ])
    mundo.inicio.save()
    comentarios = _ensayo(mundo)["rehearsal"]["comments"]
    assert [(c["due"], c["retainedBy"]) for c in comentarios] == [
        (False, "absent"), (False, "broken"), (False, "condition"), (True, None), (False, "condition"),
    ]
    assert comentarios[2]["missing"] == [{"kind": "inspected", "key": "foto", "label": "Una foto"}]
    assert comentarios[0]["missing"] == [] and comentarios[1]["missing"] == []


def test_condicion_cumplida_sin_persona_visible_dice_absent(mundo):
    mundo.inicio.comments_json = json.dumps([{"personaje": "abuela", "linea": "Mira la foto.", "cuando": {"inspected": "foto"}}])
    mundo.inicio.save()
    MapObject.objects.filter(scene_map=mundo.mapa_inicio, object_key="abuela-obj").update(visible=False)
    bloque = _bloque(_ajustar(mundo, _ensayo(mundo), {"explorado": {"inspected": ["foto"]}}))
    assert bloque["comments"][0]["due"] is False and bloque["comments"][0]["retainedBy"] == "absent" and bloque["comments"][0]["missing"] == []


def test_persona_hitos_y_camino_iniciales(mundo):
    bloque = _ensayo(mundo)["rehearsal"]
    assert bloque["persona"]["bond"] == "GUARDED" and bloque["persona"]["activation"] == "TENSE" and bloque["persona"]["label"]
    assert bloque["milestones"] == []
    assert bloque["path"] == [{"nodeId": mundo.inicio.pk, "title": mundo.inicio.title}]


def test_explored_explorable_y_scenes(mundo):
    bloque = _ensayo(mundo)["rehearsal"]
    assert bloque["explored"] == {"talked": [], "inspected": [], "has": [], "used": []}
    assert {(e["kind"], e["key"], e["label"]) for e in bloque["explorable"]} == {
        ("talked", "abuela-obj", "Abuela de la casa"), ("talked", "vecina", "La vecina"),
        ("inspected", "abuela-obj", "Abuela de la casa"), ("inspected", "foto", "Una foto"),
        ("has", "linterna", "Linterna"), ("has", "libreta", "Libreta"),
        ("used", "linterna", "Linterna"), ("used", "libreta", "Libreta"),
    }
    assert bloque["scenes"] == [
        {"id": mundo.inicio.pk, "key": mundo.inicio.node_key, "title": mundo.inicio.title, "start": True, "terminal": False},
        {"id": mundo.segunda.pk, "key": "segunda", "title": "Segunda escena", "start": False, "terminal": False},
        {"id": mundo.final.pk, "key": "fin", "title": "Final", "start": False, "terminal": True},
    ]


def test_get_devuelve_el_bloque_para_recargar_el_borrador(mundo):
    ensayo = _ensayo(mundo)
    DecisionOption.objects.filter(pk=mundo.libre.pk).update(text="Seguir, con otro texto")
    respuesta = _cliente(mundo.profesora).get(f"{CASOS}/{mundo.version.pk}/rehearsal/{ensayo['attemptId']}")
    assert set(respuesta.data["data"]) == {"rehearsal"}
    assert next(o for o in _bloque(respuesta)["options"] if o["id"] == mundo.libre.pk)["text"] == "Seguir, con otro texto"


# ─── PATCH ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_explorado_hace_aparecer_la_respuesta_y_el_comentario(mundo):
    ensayo = _ensayo(mundo)
    bloque = _bloque(_ajustar(mundo, ensayo, {"explorado": {"talked": ["abuela-obj"], "inspected": ["foto"]}}))
    assert next(o for o in bloque["options"] if o["id"] == mundo.con_requisito.pk)["offered"] is True
    assert all(c["due"] for c in bloque["comments"])
    assert bloque["explored"]["talked"] == ["abuela-obj"] and bloque["explored"]["inspected"] == ["foto"]
    juego = _cliente(mundo.profesora).get(f"{JUEGO}/{ensayo['attemptId']}/state")
    assert mundo.con_requisito.pk in [o["id"] for o in juego.data["data"]["currentNode"]["options"]]


def test_explorado_reemplaza_lo_de_la_sala_y_conserva_lo_de_otras(mundo):
    ensayo = _ensayo(mundo)
    assert _cliente(mundo.profesora).get(f"{JUEGO}/{ensayo['attemptId']}/world").status_code == 200
    intento = SimulationAttempt.all_objects.get(pk=ensayo["attemptId"])
    estado = AttemptWorldState.objects.get(attempt=intento)
    estado.flags = {"exploredBySala": {"sala-a": {"talked": ["abuela-obj"]}}, "viewedNpcKeys": ["tio", "abuela-obj"]}
    estado.inspected_object_keys = ["tio", "foto"]
    estado.inventory = ["linterna"]
    estado.save()

    respuesta = _ajustar(mundo, ensayo, {"explorado": {"talked": ["vecina"], "has": ["libreta"], "used": []}})

    estado = AttemptWorldState.objects.get(attempt=intento)
    assert estado.flags["viewedNpcKeys"] == ["tio", "vecina"]
    assert estado.inspected_object_keys == ["tio"]
    assert estado.flags["exploredBySala"]["sala-a"] == {"talked": ["vecina"], "inspected": []}
    assert not estado.flags.get("exploredBeforeSala")
    assert estado.inventory == ["libreta"] and estado.used_tool_keys == []
    assert _bloque(respuesta)["explored"] == {"talked": ["vecina"], "inspected": [], "has": ["libreta"], "used": []}


def test_irA_mueve_la_escena_y_el_mundo_a_su_mapa(mundo):
    ensayo = _ensayo(mundo)
    bloque = _bloque(_ajustar(mundo, ensayo, {"irA": mundo.segunda.pk}))
    assert bloque["sceneId"] == mundo.segunda.pk
    assert [p["nodeId"] for p in bloque["path"]] == [mundo.inicio.pk, mundo.segunda.pk]
    intento = SimulationAttempt.all_objects.get(pk=ensayo["attemptId"])
    assert intento.current_node_id == mundo.segunda.pk
    assert AttemptWorldState.objects.get(attempt=intento).scene_map.node_id == mundo.segunda.pk
    assert _cliente(mundo.profesora).get(f"{JUEGO}/{intento.pk}/state").data["data"]["currentNode"]["id"] == mundo.segunda.pk


def test_irA_a_la_escena_actual_no_duplica_la_entrada_ni_el_camino(mundo):
    ensayo = _ensayo(mundo)
    entradas = AttemptEvent.objects.filter(attempt_id=ensayo["attemptId"], event_type="NODE_ENTERED").count()
    bloque = _bloque(_ajustar(mundo, ensayo, {"irA": mundo.inicio.pk}))
    assert [p["nodeId"] for p in bloque["path"]] == [mundo.inicio.pk]
    assert AttemptEvent.objects.filter(attempt_id=ensayo["attemptId"], event_type="NODE_ENTERED").count() == entradas


def test_irA_y_explorado_juntos_marcan_la_sala_nueva(mundo):
    bloque = _bloque(_ajustar(mundo, _ensayo(mundo), {"irA": mundo.segunda.pk, "explorado": {"talked": ["tio"]}}))
    assert bloque["explored"]["talked"] == ["tio"]


def test_el_camino_sigue_las_decisiones_del_juego(mundo):
    ensayo = _ensayo(mundo)
    decision = _cliente(mundo.profesora).post(
        f"{JUEGO}/{ensayo['attemptId']}/decisions", {"decision_option_id": mundo.libre.pk, "request_id": "p-1"}, format="json")
    assert decision.status_code == 200, decision.data
    bloque = _bloque(_cliente(mundo.profesora).get(f"{CASOS}/{mundo.version.pk}/rehearsal/{ensayo['attemptId']}"))
    assert [p["nodeId"] for p in bloque["path"]] == [mundo.inicio.pk, mundo.segunda.pk]


def test_persona_e_hitos(mundo):
    mundo.version.rules = json.dumps({"milestones": [{"key": "vinculo", "label": "Vínculo"}]})
    mundo.version.save()
    ensayo = _ensayo(mundo)
    bloque = _bloque(_ajustar(mundo, ensayo, {"persona": {"bond": "OPEN", "activation": "CRISIS"}, "hitos": ["vinculo"]}))
    assert bloque["persona"]["bond"] == "OPEN" and bloque["persona"]["activation"] == "CRISIS" and bloque["milestones"] == ["vinculo"]
    # El juego lee lo mismo: el estado del intento trae la persona marcada.
    estado = _cliente(mundo.profesora).get(f"{JUEGO}/{ensayo['attemptId']}/state").data["data"]
    assert estado["persona"]["bond"] == "OPEN" and estado["persona"]["activation"] == "CRISIS"
    # Solo el vínculo: la activación se queda como estaba.
    otro = _bloque(_ajustar(mundo, ensayo, {"persona": {"bond": "WITHDRAWN"}, "hitos": []}))
    assert otro["persona"]["bond"] == "WITHDRAWN" and otro["persona"]["activation"] == "CRISIS" and otro["milestones"] == []


def test_un_hito_marcado_cuenta_para_una_respuesta_con_requisito(mundo):
    mundo.version.rules = json.dumps({"milestones": [{"key": "vinculo", "label": "Vínculo"}]})
    mundo.version.save()
    DecisionOption.objects.filter(pk=mundo.con_requisito.pk).update(requires_json=json.dumps({"milestone": "vinculo"}))
    ensayo = _ensayo(mundo)
    assert next(o for o in ensayo["rehearsal"]["options"] if o["id"] == mundo.con_requisito.pk)["offered"] is False
    bloque = _bloque(_ajustar(mundo, ensayo, {"hitos": ["vinculo"]}))
    assert next(o for o in bloque["options"] if o["id"] == mundo.con_requisito.pk)["offered"] is True


@pytest.mark.parametrize("cuerpo, campo", [
    ({"explorado": {"talked": ["nadie"]}}, "explorado"),
    ({"explorado": {"inspected": ["escondida"]}}, "explorado"),
    ({"explorado": {"has": ["tijeras"]}}, "explorado"),
    ({"explorado": {"talked": ["tio"]}}, "explorado"),
    ({"explorado": {"talked": "abuela-obj"}}, "explorado"),
    ({"explorado": {"mirado": ["foto"]}}, "explorado"),
    ({"persona": {"bond": "FELIZ"}}, "persona"),
    ({"persona": {"humor": "OPEN"}}, "persona"),
    ({"hitos": ["no_declarado"]}, "hitos"),
    ({"irA": 999999}, "irA"),
])
def test_un_patch_invalido_da_400_y_no_cambia_nada(mundo, cuerpo, campo):
    ensayo = _ensayo(mundo)
    assert _ajustar(mundo, ensayo, {"explorado": {"talked": ["abuela-obj"]}}).status_code == 200
    antes = _foto(ensayo["attemptId"])
    # Un cuerpo con una parte válida y otra inválida tampoco escribe la válida.
    respuesta = _ajustar(mundo, ensayo, {**cuerpo, "explorado": cuerpo.get("explorado", {"inspected": ["foto"]})})
    assert respuesta.status_code == 400, respuesta.data
    assert respuesta.data["field"] == campo
    assert _foto(ensayo["attemptId"]) == antes


def test_un_hito_no_declarado_con_una_parte_valida_no_escribe_nada(mundo):
    ensayo = _ensayo(mundo)
    antes = _foto(ensayo["attemptId"])
    respuesta = _ajustar(mundo, ensayo, {"explorado": {"talked": ["abuela-obj"]}, "hitos": ["no_declarado"]})
    assert respuesta.status_code == 400 and respuesta.data["field"] == "hitos"
    assert _foto(ensayo["attemptId"]) == antes


def test_explorar_en_una_escena_sin_sala_da_400(mundo):
    vacia = SimulationNode.objects.create(case_version=mundo.version, node_key="vacia", title="Vacía", narrative="Nada.")
    ensayo = _ensayo(mundo, desde=vacia.pk)
    respuesta = _ajustar(mundo, ensayo, {"explorado": {"has": ["linterna"]}})
    assert respuesta.status_code == 400 and respuesta.data["field"] == "explorado"


# ─── Cerrados, ausentes y ajenos ───────────────────────────────────────────────────────────────────────────────────
def test_un_ensayo_cerrado_da_409_y_uno_que_no_existe_da_404_gone(mundo):
    ensayo = _ensayo(mundo)
    _ensayo(mundo, desde=mundo.segunda.pk)  # reemplaza al primero
    ruta = f"{CASOS}/{mundo.version.pk}/rehearsal/{ensayo['attemptId']}"
    cerrado = _ajustar(mundo, ensayo, {"hitos": []})
    assert cerrado.status_code == 409 and cerrado.data["code"] == "REHEARSAL_CLOSED"
    assert _cliente(mundo.profesora).get(ruta).status_code == 409
    normal = SimulationAttempt.objects.create(student=mundo.estudiante, case_version=mundo.version, current_node=mundo.inicio, attempt_token_hash="h")
    for identificador in (str(normal.pk), "6f1d9b7e-5c2a-4c1e-9d7b-0a3c2e1f4a55"):
        gone = _ajustar(mundo, {"attemptId": identificador}, {"hitos": []})
        assert gone.status_code == 404 and gone.data["code"] == "REHEARSAL_GONE"


def test_el_ensayo_de_otra_version_es_gone(mundo):
    ensayo = _ensayo(mundo)
    suyo = _cliente(mundo.profesora).post(CASOS, {"code": "OTRO", "title": "Otro"}, format="json").data["data"]["versionId"]
    cruzado = _cliente(mundo.profesora).patch(f"{CASOS}/{suyo}/rehearsal/{ensayo['attemptId']}", {"hitos": []}, format="json")
    assert cruzado.status_code == 404 and cruzado.data["code"] == "REHEARSAL_GONE"


def test_el_ensayo_ajeno_no_se_lee_ni_se_ajusta(mundo):
    ensayo = _ensayo(mundo)
    ruta = f"{CASOS}/{mundo.version.pk}/rehearsal/{ensayo['attemptId']}"
    ajena = _cliente(mundo.otra)
    assert ajena.get(ruta).status_code in (403, 404) and _ajustar(mundo, ensayo, {"hitos": []}, mundo.otra).status_code in (403, 404)
    assert _ajustar(mundo, ensayo, {"hitos": []}, mundo.estudiante).status_code == 403
    assert _cliente(mundo.estudiante).get(ruta).status_code == 403


# ─── Avisos ────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_avisos_de_escena_sin_respuestas_ni_sala(mundo):
    sin_nada = SimulationNode.objects.create(case_version=mundo.version, node_key="vacia", title="Vacía", narrative="Nada.")
    ensayo = _ensayo(mundo, desde=sin_nada.pk)
    avisos = ensayo["rehearsal"]["warnings"]
    assert "Esta escena no tiene respuestas ni es un final: el estudiante se quedaría aquí." in avisos
    assert "Esta escena todavía no tiene sala: el estudiante la vería sin escenario." in avisos
    assert _bloque(_ajustar(mundo, ensayo, {"irA": mundo.segunda.pk}))["warnings"] == []
    assert "no tiene respuestas" not in " ".join(_bloque(_ajustar(mundo, ensayo, {"irA": mundo.final.pk}))["warnings"])


# ─── El juego del ensayo por las rutas normales ────────────────────────────────────────────────────────────────────
def test_la_docente_juega_el_ensayo_por_estado_bitacora_y_salida_segura(mundo):
    ensayo = _ensayo(mundo)
    docente = _cliente(mundo.profesora)
    ruta = f"{JUEGO}/{ensayo['attemptId']}"
    assert docente.get(f"{ruta}/state").status_code == 200
    reflexion = docente.post(f"{ruta}/reflections", {"nodeId": mundo.inicio.pk, "text": "Anotación de prueba"}, format="json")
    assert reflexion.status_code == 200 and reflexion.data["data"] == {"nodeId": mundo.inicio.pk, "locked": False}
    salida = docente.post(f"{ruta}/safe-exit", {"reason": "Pausa"}, format="json")
    assert salida.status_code == 200 and salida.data["data"]["status"] == AttemptStatus.PAUSED
    assert SimulationAttempt.all_objects.get(pk=ensayo["attemptId"]).status == AttemptStatus.PAUSED


def test_el_informe_del_ensayo_se_calcula_al_llegar_al_final_sin_congelarse(mundo):
    ensayo = _ensayo(mundo, desde=mundo.segunda.pk)
    opcion = DecisionOption.objects.get(option_key="a-fin")
    docente = _cliente(mundo.profesora)
    assert docente.post(f"{JUEGO}/{ensayo['attemptId']}/decisions", {"decision_option_id": opcion.pk, "request_id": "f-1"}, format="json").status_code == 200
    informe = docente.get(f"{JUEGO}/{ensayo['attemptId']}/student-report")
    assert informe.status_code == 200 and informe.data["data"]["status"] == AttemptStatus.COMPLETED
    assert not hasattr(SimulationAttempt.all_objects.get(pk=ensayo["attemptId"]), "reports")
    from apps.simulation.models import AttemptReport
    assert not AttemptReport.objects.filter(attempt_id=ensayo["attemptId"]).exists()


@pytest.mark.parametrize("sufijo, metodo", [("state", "get"), ("student-report", "get"), ("reflections", "post"), ("safe-exit", "post")])
def test_los_demas_no_juegan_el_ensayo(mundo, sufijo, metodo):
    ensayo = _ensayo(mundo)
    cuerpo = {"nodeId": mundo.inicio.pk, "text": "x"} if sufijo == "reflections" else {}
    for quien in (mundo.estudiante, mundo.otra):
        respuesta = getattr(_cliente(quien), metodo)(f"{JUEGO}/{ensayo['attemptId']}/{sufijo}", **({"data": cuerpo, "format": "json"} if metodo == "post" else {}))
        assert respuesta.status_code in (403, 404), (sufijo, quien, respuesta.status_code)
    assert SimulationAttempt.all_objects.get(pk=ensayo["attemptId"]).status == AttemptStatus.IN_PROGRESS


@pytest.mark.parametrize("sufijo, metodo", [("state", "get"), ("student-report", "get"), ("reflections", "post"), ("safe-exit", "post")])
def test_la_docente_no_juega_un_intento_de_estudiante(mundo, sufijo, metodo):
    real = SimulationAttempt.objects.create(student=mundo.estudiante, case_version=mundo.version, current_node=mundo.inicio, attempt_token_hash="real")
    cuerpo = {"nodeId": mundo.inicio.pk, "text": "x"} if sufijo == "reflections" else {}
    docente = _cliente(mundo.profesora)
    respuesta = getattr(docente, metodo)(f"{JUEGO}/{real.pk}/{sufijo}", **({"data": cuerpo, "format": "json"} if metodo == "post" else {}))
    assert respuesta.status_code in (403, 404)
    assert SimulationAttempt.objects.get(pk=real.pk).status == AttemptStatus.IN_PROGRESS


@pytest.mark.parametrize("ruta", ["result", "progress", "evaluation"])
def test_las_rutas_de_resultado_siguen_cerradas_a_la_docente(mundo, ruta):
    ensayo = _ensayo(mundo)
    assert _cliente(mundo.profesora).get(f"{JUEGO}/{ensayo['attemptId']}/{ruta}").status_code in (403, 404)


def test_el_ensayo_no_aparece_en_historial_ni_en_intento_activo_ni_en_revision(mundo):
    ensayo = _ensayo(mundo)
    docente = _cliente(mundo.profesora)
    assert docente.get(f"{JUEGO}/history").status_code == 403
    assert docente.get(f"/api/simulation/cases/{mundo.version.pk}/active-attempt").status_code in (403, 404)
    revision = _cliente(mundo.admin).get("/api/instructor/attempts")
    assert ensayo["attemptId"] not in json.dumps(revision.data, default=str)
    assert not SimulationAttempt.objects.filter(pk=ensayo["attemptId"]).exists()

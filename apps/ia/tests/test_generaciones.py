import json
from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.biblioteca.services import lugares
from apps.ia import generaciones
from apps.ia.generacion import ciclo, comprobaciones, contexto as contexto_del_lugar, esquemas
from apps.ia.proveedores import ProveedorFalso
from apps.simulation.models import (
    CaseGeneration,
    CaseVersion,
    Competency,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    SceneHint,
    SceneMap,
    SimulationCase,
    SimulationNode,
)
from apps.users.models import CustomUser, PermisoDeAutoria

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-244")]
BASE = "/api/authoring/generations"
DESCRIPCION = "Una estudiante busca orientación ante una situación difícil en la universidad."
LUGAR = "universidad"
ESCENAS_DEL_FALSO = 4
CLAVES_DE_GENERACION = {
    "id", "lugarId", "descripcion", "status", "skeleton", "scenes", "repairRounds", "repair", "lastError",
    "caseVersionId", "issues", "callsUsed", "callsLimit", "createdAt", "updatedAt",
}
RONDAS_AGOTADAS = ciclo.RONDAS_DE_REPARACION


@pytest.fixture
def contexto(settings):
    settings.AI_AUTHORING_GENERATIONS_ENABLED = True
    settings.AI_AUTHORING_GENERATIONS_PROVIDER = "falso"
    Competency.objects.create(code="ESCUCHA_ACTIVA", name="Escucha activa")
    docente = CustomUser.objects.create_user(email="generacion@example.test", password="clave", role="PROFESOR")
    PermisoDeAutoria.objects.create(docente=docente, otorgado_por=docente)
    cliente = APIClient()
    cliente.force_authenticate(docente)
    return cliente, docente


def crear(cliente, descripcion=DESCRIPCION):
    return cliente.post(BASE, {"lugarId": LUGAR, "descripcion": descripcion}, format="json")


def con_esqueleto(cliente):
    generacion = crear(cliente).data["data"]
    respuesta = cliente.post(f"{BASE}/{generacion['id']}/skeleton")
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]


def con_escenas(cliente):
    generacion = con_esqueleto(cliente)
    for escena in generacion["scenes"]:
        respuesta = cliente.post(f"{BASE}/{generacion['id']}/scenes/{escena['clave']}")
        assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]


def ensamblada(cliente):
    generacion = con_escenas(cliente)
    respuesta = cliente.post(f"{BASE}/{generacion['id']}/assemble")
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]


def cambiar_escena(generacion_id, clave, cambio):
    """Altera lo guardado de una escena para simular que el lugar o el esqueleto ya no cuadran."""
    generacion = CaseGeneration.objects.get(pk=generacion_id)
    escenas = json.loads(generacion.scenes_json)
    cambio(escenas[clave]["data"])
    generacion.scenes_json = json.dumps(escenas)
    generacion.save()


def nada_creado():
    return not (SimulationCase.objects.exists() or CaseVersion.objects.exists() or SimulationNode.objects.exists() or SceneMap.objects.exists())


# ─── apagada por defecto, contrato y permisos ─────────────────────────────────────────────────────


def test_apagada_por_defecto_y_estado(contexto, settings):
    cliente, _ = contexto
    settings.AI_AUTHORING_GENERATIONS_ENABLED = False
    estado = cliente.get(BASE + "/status")
    assert estado.status_code == 200
    assert estado.data["data"]["enabled"] is False and estado.data["data"]["provider"] is None
    assert crear(cliente).status_code == 404
    assert cliente.post(f"{BASE}/{uuid4()}/skeleton").status_code == 404
    assert cliente.post(f"{BASE}/{uuid4()}/assemble").status_code == 404
    assert not CaseGeneration.objects.exists()


def test_la_bandera_viene_apagada_del_entorno():
    from django.conf import settings as ajustes_reales

    assert ajustes_reales.AI_AUTHORING_GENERATIONS_ENABLED is False


def test_estado_encendido_dice_el_proveedor_sin_secretos(contexto, settings):
    settings.AI_AUTHORING_API_KEY = "clave-secreta-de-prueba"
    cliente, _ = contexto
    datos = cliente.get(BASE + "/status").data["data"]
    assert set(datos) == {"enabled", "provider", "remainingToday", "inProgress"}
    assert datos["enabled"] is True and datos["provider"] == "falso" and datos["inProgress"] is None
    assert "clave-secreta-de-prueba" not in json.dumps(datos)


def test_proveedor_desconocido_deja_la_generacion_apagada(contexto, settings):
    settings.AI_AUTHORING_GENERATIONS_PROVIDER = "inventado"
    cliente, _ = contexto
    assert cliente.get(BASE + "/status").data["data"]["enabled"] is False
    assert crear(cliente).status_code == 404


def test_contrato_crear_leer_y_cancelar(contexto):
    cliente, _ = contexto
    respuesta = crear(cliente)
    assert respuesta.status_code == 201 and respuesta.data["success"] is True
    generacion = respuesta.data["data"]
    assert set(generacion) == CLAVES_DE_GENERACION
    assert generacion["status"] == "created" and generacion["skeleton"] is None and generacion["scenes"] == []
    assert generacion["caseVersionId"] is None and generacion["issues"] == [] and generacion["callsUsed"] == 0
    ruta = f"{BASE}/{generacion['id']}"
    assert cliente.get(ruta).data["data"] == generacion
    assert cliente.get(BASE + "/status").data["data"]["inProgress"]["id"] == generacion["id"]
    repetida = crear(cliente)
    assert repetida.status_code == 409 and repetida.data["code"] == "GENERATION_IN_PROGRESS"
    assert repetida.data["generationId"] == generacion["id"]
    assert cliente.delete(ruta).data["data"]["status"] == "cancelled"
    otra_vez = cliente.delete(ruta)
    assert otra_vez.status_code == 409 and otra_vez.data["code"] == "GENERATION_STATE"
    assert otra_vez.data["success"] is False


def test_permisos_y_propiedad(contexto):
    cliente, docente = contexto
    identificador = crear(cliente).data["data"]["id"]
    ruta = f"{BASE}/{identificador}"
    administrador = CustomUser.objects.create_user(email="admin-generacion@example.test", password="clave", role="ADMIN")
    cliente.force_authenticate(administrador)
    assert cliente.get(ruta).status_code == 404
    assert cliente.delete(ruta).status_code == 404
    assert cliente.post(ruta + "/skeleton").status_code == 404
    estudiante = CustomUser.objects.create_user(email="estudiante-generacion@example.test", password="clave")
    cliente.force_authenticate(estudiante)
    assert cliente.get(BASE + "/status").status_code == 403
    cliente.force_authenticate(docente)
    PermisoDeAutoria.objects.filter(docente=docente).delete()
    assert cliente.get(BASE + "/status").status_code == 403
    assert crear(cliente).status_code == 403
    assert APIClient().get(BASE + "/status").status_code == 401


def test_limites_validacion_y_caducidad(contexto, settings):
    cliente, _ = contexto
    settings.AI_AUTHORING_GENERATIONS_PER_DAY = 2
    assert crear(cliente, "breve").status_code == 400
    assert crear(cliente, DESCRIPCION + " correo@ejemplo.com").status_code == 400
    assert crear(cliente, DESCRIPCION + " <b>negrita</b>").status_code == 400
    assert cliente.post(BASE, {"lugarId": "no-existe", "descripcion": DESCRIPCION}, format="json").status_code == 404
    assert cliente.post(BASE, {"descripcion": DESCRIPCION}, format="json").data["code"] == "VALIDATION_ERROR"
    assert not CaseGeneration.objects.exists()
    identificador = crear(cliente).data["data"]["id"]
    CaseGeneration.objects.filter(pk=identificador).update(updated_at=timezone.now() - timedelta(hours=25))
    assert cliente.get(BASE + "/status").data["data"]["inProgress"] is None
    assert CaseGeneration.objects.get(pk=identificador).status == "cancelled"
    segundo = crear(cliente).data["data"]["id"]
    cliente.delete(f"{BASE}/{segundo}")
    limite = crear(cliente)
    assert limite.status_code == 429 and limite.data["code"] == "AI_LIMIT_EXCEEDED" and limite.data["scope"] == "daily"
    assert cliente.get(f"{BASE}/{uuid4()}").status_code == 404


def test_tope_global_del_dia(contexto, settings):
    cliente, _ = contexto
    settings.AI_AUTHORING_GENERATIONS_GLOBAL_PER_DAY = 1
    otra = CustomUser.objects.create_user(email="otra-docente@example.test", password="clave", role="ADMIN")
    CaseGeneration.objects.create(owner=otra, lugar_id=LUGAR, description=DESCRIPCION, status="cancelled")
    limite = crear(cliente)
    assert limite.status_code == 429 and limite.data["code"] == "AI_LIMIT_EXCEEDED"


# ─── el flujo completo con el proveedor falso ─────────────────────────────────────────────────────


def test_esqueleto_y_escenas_siguen_el_contrato_del_cliente(contexto):
    cliente, _ = contexto
    generacion = con_esqueleto(cliente)
    assert set(generacion) == CLAVES_DE_GENERACION and generacion["status"] == "skeleton_ready"
    assert set(generacion["skeleton"]) == {"titulo", "escenas"}
    assert len(generacion["skeleton"]["escenas"]) == ESCENAS_DEL_FALSO
    assert all(set(escena) == {"clave", "titulo", "final"} for escena in generacion["skeleton"]["escenas"])
    assert [escena["final"] for escena in generacion["skeleton"]["escenas"]] == [False, False, False, True]
    assert all(set(escena) == {"clave", "titulo", "state", "error"} and escena["state"] == "pending" for escena in generacion["scenes"])
    assert generacion["callsUsed"] == 1 and generacion["callsLimit"] == 20
    primera = generacion["scenes"][0]["clave"]
    respuesta = cliente.post(f"{BASE}/{generacion['id']}/scenes/{primera}").data["data"]
    assert respuesta["status"] == "skeleton_ready" and respuesta["scenes"][0]["state"] == "done" and respuesta["callsUsed"] == 2


def test_ensamblado_completo_crea_el_borrador_con_el_mundo(contexto):
    cliente, docente = contexto
    generacion = ensamblada(cliente)
    assert generacion["status"] == "imported", generacion["issues"]
    version = CaseVersion.objects.get(pk=generacion["caseVersionId"])
    assert version.status == "DRAFT" and version.simulation_case.created_by == docente
    assert version.simulation_case.code.startswith("IA-")
    nodos = list(version.nodes.order_by("display_order"))
    assert len(nodos) == ESCENAS_DEL_FALSO
    assert [nodo.start_node for nodo in nodos] == [True, False, False, False]
    assert [nodo.terminal_node for nodo in nodos] == [False, False, False, True]
    assert all(nodo.ai_suggested for nodo in nodos) and nodos[1].sensitive_content and nodos[1].warning_message
    assert nodos[0].decision_prompt and nodos[-1].decision_prompt == ""
    opciones = DecisionOption.objects.filter(case_version=version)
    assert opciones.exists() and all(opcion.ai_suggested for opcion in opciones)
    assert not opciones.filter(source_node=nodos[-1]).exists()
    contraindicada = opciones.filter(response_class="CONTRAINDICATED").first()
    assert contraindicada.prohibition_reason
    assert SceneMap.objects.filter(case_version=version).count() == ESCENAS_DEL_FALSO
    personas = MapObject.objects.filter(scene_map__case_version=version, object_type="PERSON")
    claves = [persona for persona in personas if json.loads(persona.metadata_json).get("personaClave")]
    assert len(claves) == ESCENAS_DEL_FALSO and all(persona.ai_suggested for persona in claves)
    assert MapObject.objects.filter(scene_map__case_version=version, object_type="EXIT").exists()
    assert SceneHint.objects.filter(scene_map__case_version=version).count() == ESCENAS_DEL_FALSO
    arboles = DialogueTree.objects.filter(scene_map__case_version=version)
    assert arboles.count() == ESCENAS_DEL_FALSO and DialogueLine.objects.filter(dialogue_tree__in=arboles, ai_suggested=True).exists()
    assert DialogueChoice.objects.filter(dialogue_tree__in=arboles).count() == opciones.count()
    reglas = json.loads(version.rules)
    assert [final["key"] for final in reglas["endings"]] == ["final-logrado", "final-abierto"]
    assert all(final["aiSuggested"] for final in reglas["endings"]) and reglas["milestones"]
    assert json.loads(nodos[0].comments_json)[0]["personaje"]
    estado = cliente.get(BASE + "/status").data["data"]
    assert estado["inProgress"] is None
    assert cliente.get(f"{BASE}/{generacion['id']}").data["data"]["caseVersionId"] == version.pk
    assert crear(cliente).status_code == 201


def test_el_borrador_generado_aparece_en_la_definicion_de_autoria(contexto):
    cliente, _ = contexto
    version_id = ensamblada(cliente)["caseVersionId"]
    definicion = cliente.get(f"/api/authoring/cases/{version_id}/definition")
    assert definicion.status_code == 200
    assert len(definicion.data["data"]["nodes"]) == ESCENAS_DEL_FALSO


# ─── estados, topes y fallas del proveedor ────────────────────────────────────────────────────────


def test_las_etapas_fuera_de_orden_son_409(contexto):
    cliente, _ = contexto
    identificador = crear(cliente).data["data"]["id"]
    assert cliente.post(f"{BASE}/{identificador}/assemble").data["code"] == "GENERATION_STATE"
    assert cliente.post(f"{BASE}/{identificador}/scenes/entrada").data["code"] == "GENERATION_STATE"
    cliente.post(f"{BASE}/{identificador}/skeleton")
    repetido = cliente.post(f"{BASE}/{identificador}/skeleton")
    assert repetido.status_code == 409 and repetido.data["code"] == "GENERATION_STATE"
    assert cliente.post(f"{BASE}/{identificador}/scenes/no-existe").status_code == 404
    assert cliente.post(f"{BASE}/{identificador}/assemble").data["code"] == "GENERATION_STATE"
    assert cliente.post(f"{BASE}/{identificador}/scenes/entrada?repair=2").data["code"] == "VALIDATION_ERROR"
    assert cliente.post(f"{BASE}/{identificador}/scenes/entrada?repair=1").data["code"] == "GENERATION_STATE"


def test_una_escena_ya_escrita_no_se_pide_de_nuevo(contexto):
    cliente, _ = contexto
    generacion = con_esqueleto(cliente)
    ruta = f"{BASE}/{generacion['id']}/scenes/{generacion['scenes'][0]['clave']}"
    assert cliente.post(ruta).status_code == 200
    assert cliente.post(ruta).data["code"] == "GENERATION_STATE"


def test_tope_de_llamadas_por_generacion(contexto, settings):
    settings.AI_AUTHORING_GENERATION_MAX_CALLS = 1
    cliente, _ = contexto
    generacion = con_esqueleto(cliente)
    agotada = cliente.post(f"{BASE}/{generacion['id']}/scenes/{generacion['scenes'][0]['clave']}")
    assert agotada.status_code == 429 and agotada.data["code"] == "GENERATION_CALLS_EXHAUSTED"
    assert CaseGeneration.objects.get(pk=generacion["id"]).calls == 1


def test_salida_que_no_es_json_es_502_y_se_puede_reintentar(contexto, monkeypatch):
    cliente, _ = contexto
    identificador = crear(cliente).data["data"]["id"]
    respuestas = iter(["esto no es json", None])
    original = ProveedorFalso.responder
    monkeypatch.setattr(ProveedorFalso, "responder", lambda self, instrucciones, mensajes: next(respuestas) or original(self, instrucciones, mensajes))
    fallida = cliente.post(f"{BASE}/{identificador}/skeleton")
    assert fallida.status_code == 502 and fallida.data["code"] == "AI_PROVIDER_ERROR" and fallida.data["kind"] == "malformed"
    assert "esto no es json" not in json.dumps(fallida.data)
    leida = cliente.get(f"{BASE}/{identificador}").data["data"]
    assert leida["status"] == "created" and leida["lastError"]["stage"] == "skeleton" and leida["callsUsed"] == 1
    reintento = cliente.post(f"{BASE}/{identificador}/skeleton")
    assert reintento.status_code == 200
    assert reintento.data["data"]["lastError"] is None and reintento.data["data"]["callsUsed"] == 2


def test_salida_que_rompe_las_comprobaciones_es_malformada(contexto, monkeypatch):
    cliente, _ = contexto
    identificador = crear(cliente).data["data"]["id"]
    original = ProveedorFalso.responder

    def con_sala_inventada(self, instrucciones, mensajes):
        esqueleto = json.loads(original(self, instrucciones, mensajes))
        esqueleto["escenas"][0]["sala"] = "sala-inventada"
        return json.dumps(esqueleto)

    monkeypatch.setattr(ProveedorFalso, "responder", con_sala_inventada)
    fallida = cliente.post(f"{BASE}/{identificador}/skeleton")
    assert fallida.status_code == 502 and fallida.data["kind"] == "malformed"
    assert "sala-inventada" not in json.dumps(fallida.data)
    assert CaseGeneration.objects.get(pk=identificador).skeleton_json == "{}"


def test_tiempo_agotado_y_falla_de_red_son_502_con_su_tipo(contexto, monkeypatch):
    cliente, _ = contexto
    identificador = crear(cliente).data["data"]["id"]

    def agota(self, instrucciones, mensajes):
        raise TimeoutError

    monkeypatch.setattr(ProveedorFalso, "responder", agota)
    assert cliente.post(f"{BASE}/{identificador}/skeleton").data["kind"] == "timeout"

    def cae(self, instrucciones, mensajes):
        raise ConnectionError

    monkeypatch.setattr(ProveedorFalso, "responder", cae)
    assert cliente.post(f"{BASE}/{identificador}/skeleton").data["kind"] == "http"
    assert cliente.get(f"{BASE}/{identificador}").data["data"]["status"] == "created"


def test_una_etapa_en_curso_ocupa_la_escena_hasta_que_vence(contexto):
    cliente, _ = contexto
    generacion = con_esqueleto(cliente)
    clave = generacion["scenes"][0]["clave"]
    registro = CaseGeneration.objects.get(pk=generacion["id"])
    escenas = json.loads(registro.scenes_json)
    escenas[clave].update(state="running", started_at=timezone.now().isoformat())
    registro.scenes_json = json.dumps(escenas)
    registro.save()
    ocupada = cliente.post(f"{BASE}/{generacion['id']}/scenes/{clave}")
    assert ocupada.status_code == 409 and ocupada.data["code"] == "GENERATION_BUSY"
    escenas[clave]["started_at"] = (timezone.now() - timedelta(seconds=ciclo.SEGUNDOS_ETAPA_VENCIDA + 1)).isoformat()
    registro.scenes_json = json.dumps(escenas)
    registro.save()
    assert cliente.get(f"{BASE}/{generacion['id']}").data["data"]["scenes"][0]["error"]["kind"] == "timeout"
    assert cliente.post(f"{BASE}/{generacion['id']}/scenes/{clave}").status_code == 200


def test_una_generacion_cancelada_descarta_lo_que_llega_tarde(contexto, monkeypatch):
    cliente, _ = contexto
    identificador = crear(cliente).data["data"]["id"]
    original = ProveedorFalso.responder

    def cancela_mientras_responde(self, instrucciones, mensajes):
        CaseGeneration.objects.filter(pk=identificador).update(status="cancelled")
        return original(self, instrucciones, mensajes)

    monkeypatch.setattr(ProveedorFalso, "responder", cancela_mientras_responde)
    descartada = cliente.post(f"{BASE}/{identificador}/skeleton")
    assert descartada.status_code == 409 and descartada.data["code"] == "GENERATION_STATE"
    assert CaseGeneration.objects.get(pk=identificador).skeleton_json == "{}"


# ─── ensamblado: reparación y rechazo sin escrituras ──────────────────────────────────────────────


def test_el_ensamblado_pide_reparar_sin_crear_nada_y_la_reparacion_lo_resuelve(contexto):
    cliente, _ = contexto
    generacion = con_escenas(cliente)
    clave = generacion["scenes"][0]["clave"]
    cambiar_escena(generacion["id"], clave, lambda escena: escena["opciones"][0].update(destino="sala-ajena"))
    respuesta = cliente.post(f"{BASE}/{generacion['id']}/assemble").data["data"]
    assert respuesta["status"] == "needs_repair" and respuesta["repairRounds"] == 1
    assert respuesta["repair"]["scenes"] == [clave] and respuesta["repair"]["round"] == 1
    faltas = respuesta["repair"]["issues"][clave]
    assert set(faltas[0]) == {"code", "severity", "message", "path"} and faltas[0]["severity"] == "error"
    assert respuesta["issues"] == [] and nada_creado()
    reparada = cliente.post(f"{BASE}/{generacion['id']}/scenes/{clave}?repair=1")
    assert reparada.status_code == 200 and reparada.data["data"]["status"] == "scenes_ready"
    assert cliente.post(f"{BASE}/{generacion['id']}/assemble").data["data"]["status"] == "imported"


def test_sin_rondas_de_reparacion_el_ensamblado_falla_sin_dejar_nada(contexto):
    cliente, _ = contexto
    generacion = con_escenas(cliente)
    clave = generacion["scenes"][0]["clave"]
    cambiar_escena(generacion["id"], clave, lambda escena: escena["opciones"][0].update(destino="sala-ajena"))
    CaseGeneration.objects.filter(pk=generacion["id"]).update(repair_rounds=RONDAS_AGOTADAS)
    respuesta = cliente.post(f"{BASE}/{generacion['id']}/assemble").data["data"]
    assert respuesta["status"] == "failed" and respuesta["caseVersionId"] is None
    assert respuesta["issues"] and respuesta["issues"][0]["code"].startswith("GENERATION.")
    assert nada_creado()


def test_una_escena_sin_escribir_no_se_ensambla(contexto):
    cliente, _ = contexto
    generacion = con_esqueleto(cliente)
    CaseGeneration.objects.filter(pk=generacion["id"]).update(status="scenes_ready")
    respuesta = cliente.post(f"{BASE}/{generacion['id']}/assemble").data["data"]
    assert respuesta["status"] == "needs_repair"
    assert {falta["code"] for falta in respuesta["repair"]["issues"]["entrada"]} == {"GENERATION.SCENE_MISSING"}
    assert nada_creado()


def test_si_una_pieza_no_se_puede_representar_falla_con_error_claro_y_sin_escrituras(contexto, monkeypatch):
    from apps.biblioteca.services import copiar_al_caso
    from shared.exceptions import ApiError

    cliente, _ = contexto
    generacion = con_escenas(cliente)

    def falla_a_la_mitad(version, lugar, salas):
        SimulationNode.objects.create(case_version=version, node_key="a-medias", title="A medias", narrative="x")
        raise ApiError("BIBLIOTECA_INVALIDA", "Un objeto del lugar tiene un tipo que el caso no admite.", 500)

    monkeypatch.setattr(copiar_al_caso, "copiar_al_caso", falla_a_la_mitad)
    respuesta = cliente.post(f"{BASE}/{generacion['id']}/assemble").data["data"]
    assert respuesta["status"] == "failed" and respuesta["issues"][0]["code"] == "GENERATION.ASSEMBLY_FAILED"
    assert "tipo que el caso no admite" in respuesta["issues"][0]["message"]
    assert nada_creado()


def test_una_pieza_con_datos_invalidos_para_el_modelo_falla_sin_escrituras(contexto):
    cliente, _ = contexto
    generacion = con_escenas(cliente)
    clave = generacion["scenes"][0]["clave"]
    cambiar_escena(generacion["id"], clave, lambda escena: escena.update(pistas=["p" * 300]))
    respuesta = cliente.post(f"{BASE}/{generacion['id']}/assemble").data["data"]
    assert respuesta["status"] == "failed" and respuesta["issues"][0]["code"] == "GENERATION.ASSEMBLY_FAILED"
    assert nada_creado()


def test_dos_ensamblados_seguidos_no_crean_dos_borradores(contexto):
    cliente, _ = contexto
    generacion = con_escenas(cliente)
    assert cliente.post(f"{BASE}/{generacion['id']}/assemble").data["data"]["status"] == "imported"
    segundo = cliente.post(f"{BASE}/{generacion['id']}/assemble")
    assert segundo.status_code == 409 and segundo.data["code"] == "GENERATION_STATE"
    assert CaseVersion.objects.count() == 1


# ─── auditoría y piezas puras ─────────────────────────────────────────────────────────────────────


def test_la_auditoria_no_guarda_la_descripcion_ni_texto_del_modelo(contexto):
    from apps.simulation.models import AuditLog

    cliente, _ = contexto
    ensamblada(cliente)
    filas = list(AuditLog.objects.filter(action__startswith="AI_GENERATION"))
    acciones = {fila.action for fila in filas}
    assert {"AI_GENERATION_CREATED", "AI_GENERATION_STAGE"} <= acciones
    assert DESCRIPCION not in json.dumps([fila.context_json for fila in filas])
    etapas = {json.loads(fila.context_json).get("stage") for fila in filas if fila.action == "AI_GENERATION_STAGE"}
    assert etapas == {"skeleton", "scene", "assemble"}


def esqueleto_valido():
    lugar = lugares.cargar_lugar(LUGAR)
    contexto = contexto_del_lugar.del_lugar(lugar, [])
    return contexto, json.loads(ProveedorFalso().responder(
        "GENERACION-DE-CASOS\n", [{"role": "user", "content": json.dumps({"etapa": "esqueleto", "descripcion": DESCRIPCION, "contexto": contexto})}],
    ))


def test_las_comprobaciones_rechazan_una_escena_alta_sin_advertencia():
    contexto, crudo = esqueleto_valido()
    comprobaciones.validar_esqueleto(crudo, contexto)
    crudo["escenas"][1]["advertencia"] = ""
    with pytest.raises(comprobaciones.GeneracionInvalida) as error:
        comprobaciones.validar_esqueleto(crudo, contexto)
    assert any("advertencia" in motivo for motivo in error.value.motivos)


def test_las_comprobaciones_rechazan_grafos_y_finales_rotos():
    contexto, crudo = esqueleto_valido()
    crudo["escenas"][-1]["siguientes"] = [crudo["escenas"][0]["sala"]]
    with pytest.raises(comprobaciones.GeneracionInvalida):
        comprobaciones.validar_esqueleto(crudo, contexto)
    contexto, crudo = esqueleto_valido()
    crudo["finales"][0]["cuando"] = ""
    with pytest.raises(comprobaciones.GeneracionInvalida) as error:
        comprobaciones.validar_esqueleto(crudo, contexto)
    assert any("finales" in motivo for motivo in error.value.motivos)
    contexto, crudo = esqueleto_valido()
    crudo["escenas"] = crudo["escenas"][: esquemas.MINIMO_ESCENAS - 1]
    with pytest.raises(comprobaciones.GeneracionInvalida):
        comprobaciones.validar_esqueleto(crudo, contexto)
    contexto, crudo = esqueleto_valido()
    crudo["extra"] = "campo que no está en el esquema"
    with pytest.raises(comprobaciones.GeneracionInvalida):
        comprobaciones.validar_esqueleto(crudo, contexto)


def test_la_descripcion_con_datos_personales_no_pasa():
    with pytest.raises(comprobaciones.GeneracionInvalida):
        comprobaciones.comprobar_descripcion("Llámame al 300 123 4567 para el caso")
    comprobaciones.comprobar_descripcion(DESCRIPCION)


def test_el_ciclo_de_vida_solo_permite_sus_transiciones():
    assert ciclo.permite(ciclo.CREATED, ciclo.ESQUELETO) and not ciclo.permite(ciclo.SKELETON_READY, ciclo.ESQUELETO)
    assert ciclo.permite(ciclo.SCENES_READY, ciclo.ENSAMBLAR) and not ciclo.permite(ciclo.CREATED, ciclo.ENSAMBLAR)
    assert ciclo.permite(ciclo.NEEDS_REPAIR, ciclo.REPARAR_ESCENA) and not ciclo.permite(ciclo.IMPORTED, ciclo.CANCELAR)
    assert ciclo.tras_escena({"a": {"state": "done"}, "b": {"state": "pending"}}, ["a", "b"]) == ciclo.SKELETON_READY
    assert ciclo.tras_escena({"a": {"state": "done"}}, ["a"]) == ciclo.SCENES_READY
    assert set(ciclo.EN_CURSO) == set(generaciones.GenerationStatus.IN_PROGRESS)

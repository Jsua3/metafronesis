"""La IA coautora, fase 1 (SIEP-269): preguntas con tres opciones, ficha «Lo que acordamos» y aceptar.

El proveedor es el falso (tres preguntas y luego ``listo``; una ficha fija) o un doble: jamás hay red.
"""
import json

import pytest

from apps.ia import coautorias, proveedores
from apps.ia.asistente import errores
from apps.ia.coautoria import esquemas, falso, prompts
from apps.ia.coautoria.esquemas import CoautoriaInvalida
from apps.simulation.models import AuditLog, AuthoringAssistantUsage, CaseGeneration, CoauthorAgreement

from .conftest import cliente_de

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-269")]

BASE = "/api/authoring/coauthor"
LUGAR = "universidad"
IDEA = "Una primera consulta con una estudiante que llega desconfiada a bienestar universitario."


@pytest.fixture
def encendida(settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"
    settings.AI_AUTHORING_API_KEY = ""
    settings.AI_AUTHORING_DAILY_LIMIT_PER_USER = 5
    settings.AI_AUTHORING_MONTHLY_LIMIT = 100
    settings.AI_AUTHORING_GENERATIONS_ENABLED = True
    settings.AI_AUTHORING_GENERATIONS_PROVIDER = "falso"


def _iniciar(cliente, **cuerpo):
    return cliente.post(BASE, {"idea": IDEA, "lugarId": LUGAR, **cuerpo}, format="json")


def _responder(cliente, acuerdo, numero, eleccion):
    return cliente.post(f"{BASE}/{acuerdo}/answer", {"numero": numero, "eleccion": eleccion}, format="json")


def _hasta_el_resumen(cliente):
    acuerdo = _iniciar(cliente).json()["data"]
    for numero in (1, 2, 3):
        acuerdo = _responder(cliente, acuerdo["id"], numero, {"tipo": "opcion", "indice": 0}).json()["data"]
    assert acuerdo["status"] == "ready"
    return cliente.post(f"{BASE}/{acuerdo['id']}/summary", {}, format="json").json()["data"]


# ─── recorrido completo ───────────────────────────────────────────────────────────────────────────


def test_iniciar_trae_la_primera_pregunta_con_tres_opciones_y_gasta_una_ayuda(encendida, docente):
    respuesta = _iniciar(cliente_de(docente))

    assert respuesta.status_code == 201
    datos = respuesta.json()["data"]
    assert datos["status"] == "clarifying"
    assert datos["pregunta"]["numero"] == 1
    assert len(datos["pregunta"]["opciones"]) == 3
    assert datos["pregunta"]["recomendada"] in (0, 1, 2)
    assert datos["topePreguntas"] == esquemas.TOPE_PREGUNTAS
    assert datos["llamadasUsadas"] == 1
    assert AuthoringAssistantUsage.objects.get(user=docente).count == 1


def test_responder_registra_la_eleccion_legible_y_trae_la_siguiente(encendida, docente):
    cliente = cliente_de(docente)
    acuerdo = _iniciar(cliente).json()["data"]

    _responder(cliente, acuerdo["id"], 1, {"tipo": "propia", "texto": "Que aprenda a no presionar"})
    datos = _responder(cliente, acuerdo["id"], 2, {"tipo": "decide"}).json()["data"]

    assert [r["respuesta"] for r in datos["respuestas"]] == [
        "Que aprenda a no presionar", f"Decide tú: {falso.PREGUNTAS[1]['opciones'][0]}",
    ]
    assert datos["pregunta"]["numero"] == 3
    # Responder no vuelve a gastar ayudas del día: el cupo es por conversación.
    assert AuthoringAssistantUsage.objects.get(user=docente).count == 1


def test_cuando_la_ia_dice_listo_se_pide_el_resumen_y_aceptar_arranca_la_generacion(encendida, docente):
    cliente = cliente_de(docente)
    ficha = _hasta_el_resumen(cliente)

    assert ficha["status"] == "summarized"
    assert ficha["ficha"]["titulo"] == falso.FICHA["titulo"]
    aceptado = cliente.post(f"{BASE}/{ficha['id']}/accept", format="json").json()["data"]

    assert aceptado["status"] == "accepted"
    generacion = CaseGeneration.objects.get(pk=aceptado["generationId"])
    assert generacion.owner == docente and generacion.lugar_id == LUGAR
    assert falso.FICHA["titulo"] in generacion.description
    assert "Escenas en orden" in generacion.description


def test_hacer_un_cambio_rehace_la_ficha_y_corregirla_a_mano_no_gasta_llamadas(encendida, docente):
    cliente = cliente_de(docente)
    ficha = _hasta_el_resumen(cliente)

    cambiada = cliente.post(f"{BASE}/{ficha['id']}/summary", {"cambio": "Que sea de noche"}, format="json").json()["data"]
    assert cambiada["ficha"]["titulo"].endswith("(ajustado)")

    corregida = {**cambiada["ficha"], "momento": "noche"}
    respuesta = cliente.put(f"{BASE}/{ficha['id']}/summary", {"ficha": corregida}, format="json")
    assert respuesta.status_code == 200
    assert respuesta.json()["data"]["ficha"]["momento"] == "noche"
    assert respuesta.json()["data"]["llamadasUsadas"] == cambiada["llamadasUsadas"]


def test_saltar_las_preguntas_deja_la_conversacion_lista_para_el_resumen(encendida, docente):
    cliente = cliente_de(docente)
    acuerdo = _iniciar(cliente).json()["data"]

    datos = cliente.post(f"{BASE}/{acuerdo['id']}/skip", format="json").json()["data"]

    assert datos["status"] == "ready" and datos["pregunta"] is None


def test_cambiar_una_respuesta_anterior_descarta_las_siguientes(encendida, docente):
    cliente = cliente_de(docente)
    acuerdo = _iniciar(cliente).json()["data"]
    _responder(cliente, acuerdo["id"], 1, {"tipo": "opcion", "indice": 0})
    _responder(cliente, acuerdo["id"], 2, {"tipo": "opcion", "indice": 0})

    datos = _responder(cliente, acuerdo["id"], 1, {"tipo": "opcion", "indice": 2}).json()["data"]

    assert len(datos["respuestas"]) == 1
    assert datos["respuestas"][0]["respuesta"] == falso.PREGUNTAS[0]["opciones"][2]
    assert datos["pregunta"]["numero"] == 2


def test_en_el_editor_la_ficha_aceptada_queda_guardada_sin_generar(encendida, docente, version):
    cliente = cliente_de(docente)
    acuerdo = cliente.post(BASE, {"idea": IDEA, "caseVersionId": version.pk}, format="json").json()["data"]
    for numero in (1, 2, 3):
        acuerdo = _responder(cliente, acuerdo["id"], numero, {"tipo": "decide"}).json()["data"]
    cliente.post(f"{BASE}/{acuerdo['id']}/summary", {}, format="json")

    aceptado = cliente.post(f"{BASE}/{acuerdo['id']}/accept", format="json").json()["data"]

    assert aceptado["status"] == "accepted" and aceptado["generationId"] is None
    assert aceptado["caseVersionId"] == version.pk
    assert not CaseGeneration.objects.exists()


# ─── el servidor impone las reglas ────────────────────────────────────────────────────────────────


def test_el_tope_de_preguntas_lo_impone_el_servidor(encendida, docente, monkeypatch):
    # Una IA que nunca dice «listo»: aun así, tras el tope la conversación pasa a resumir.
    monkeypatch.setattr(falso, "preguntar", lambda mensajes: json.dumps({"listo": False, **falso.PREGUNTAS[0]}))
    cliente = cliente_de(docente)
    acuerdo = _iniciar(cliente).json()["data"]
    for numero in range(1, esquemas.TOPE_PREGUNTAS + 1):
        acuerdo = _responder(cliente, acuerdo["id"], numero, {"tipo": "opcion", "indice": 1}).json()["data"]

    assert acuerdo["status"] == "ready"
    assert len(acuerdo["respuestas"]) == esquemas.TOPE_PREGUNTAS


@pytest.mark.parametrize("cuerpo", [{}, {"lugarId": LUGAR, "caseVersionId": 1}])
def test_hay_que_indicar_un_solo_destino(encendida, docente, cuerpo):
    respuesta = cliente_de(docente).post(BASE, {"idea": IDEA, **cuerpo}, format="json")

    assert respuesta.status_code == 400 and respuesta.json()["field"] == "lugarId"


@pytest.mark.parametrize("idea", ["corta", "Escríbeme a ana@example.com para el caso", "Mira <b>esto</b> por favor"])
def test_la_idea_debe_ser_texto_plano_sin_datos_personales(encendida, docente, idea):
    respuesta = cliente_de(docente).post(BASE, {"idea": idea, "lugarId": LUGAR}, format="json")

    assert respuesta.status_code == 400 and respuesta.json()["field"] == "idea"
    assert not CoauthorAgreement.objects.exists()


def test_apagada_es_un_404(settings, docente):
    settings.AI_AUTHORING_ENABLED = False

    assert _iniciar(cliente_de(docente)).status_code == 404


def test_un_acuerdo_ajeno_es_un_404(encendida, docentes):
    (propio, ajeno), _ = docentes
    acuerdo = _iniciar(cliente_de(propio)).json()["data"]

    assert cliente_de(ajeno).get(f"{BASE}/{acuerdo['id']}").status_code == 404


def test_un_paso_fuera_de_orden_es_un_409(encendida, docente):
    cliente = cliente_de(docente)
    acuerdo = _iniciar(cliente).json()["data"]

    assert cliente.post(f"{BASE}/{acuerdo['id']}/accept", format="json").json()["code"] == "COAUTHOR_STATE"
    assert cliente.post(f"{BASE}/{acuerdo['id']}/summary", {}, format="json").status_code == 409


def test_una_respuesta_invalida_de_la_ia_se_puede_reintentar(encendida, docente, monkeypatch):
    original = falso.preguntar
    monkeypatch.setattr(falso, "preguntar", lambda mensajes: json.dumps({"listo": False, "opciones": ["a"]}))
    cliente = cliente_de(docente)

    datos = _iniciar(cliente).json()["data"]
    assert datos["pregunta"] is None and datos["error"]["code"] == "AI_COAUTHOR_INVALID"

    monkeypatch.setattr(falso, "preguntar", original)
    reintento = cliente.post(f"{BASE}/{datos['id']}/question", format="json").json()["data"]
    assert reintento["pregunta"]["numero"] == 1


def test_una_falla_del_proveedor_devuelve_la_llamada(encendida, docente, monkeypatch):
    def caido(self, *args, **kwargs):
        raise errores.ErrorDeProveedor("timeout")

    monkeypatch.setattr(proveedores.ProveedorFalso, "responder", caido)
    datos = _iniciar(cliente_de(docente)).json()["data"]

    assert datos["error"]["code"] == "AI_PROVIDER_ERROR"
    assert datos["llamadasUsadas"] == 0 and datos["ocupado"] is False


def test_agotar_las_llamadas_de_la_conversacion_es_un_409(encendida, docente):
    cliente = cliente_de(docente)
    ficha = _hasta_el_resumen(cliente)
    CoauthorAgreement.objects.filter(pk=ficha["id"]).update(calls=esquemas.TOPE_LLAMADAS)

    respuesta = cliente.post(f"{BASE}/{ficha['id']}/summary", {"cambio": "Otra cosa"}, format="json")

    assert respuesta.status_code == 409 and respuesta.json()["code"] == "COAUTHOR_EXHAUSTED"


def test_la_auditoria_no_guarda_la_idea_ni_las_respuestas(encendida, docente):
    cliente = cliente_de(docente)
    acuerdo = _iniciar(cliente).json()["data"]
    _responder(cliente, acuerdo["id"], 1, {"tipo": "propia", "texto": "RESPUESTA-SECRETA"})

    filas = AuditLog.objects.filter(action__startswith="AI_COAUTHOR")
    assert {"AI_COAUTHOR_STARTED", "AI_COAUTHOR_STAGE"} <= set(filas.values_list("action", flat=True))
    volcado = json.dumps(list(filas.values()), default=str)
    assert "desconfiada" not in volcado and "RESPUESTA-SECRETA" not in volcado


# ─── validación de lo que devuelve la IA ──────────────────────────────────────────────────────────


def _pregunta(**cambios):
    return {"listo": False, **falso.PREGUNTAS[0], **cambios}


@pytest.mark.parametrize("cambios", [
    {"opciones": ["a", "b"]},
    {"opciones": ["igual", "Igual", "otra"]},
    {"recomendada": 3},
    {"recomendada": True},
    {"ambito": "otra-cosa"},
    {"pregunta": ""},
    {"porque": "x" * 500},
])
def test_una_pregunta_mal_formada_se_rechaza(cambios):
    with pytest.raises(CoautoriaInvalida):
        esquemas.pregunta(_pregunta(**cambios))


def test_una_pregunta_con_un_campo_de_mas_se_rechaza():
    with pytest.raises(CoautoriaInvalida):
        esquemas.pregunta({**_pregunta(), "extra": 1})


def test_una_pregunta_con_contenido_grafico_se_rechaza():
    with pytest.raises(CoautoriaInvalida) as error:
        esquemas.pregunta(_pregunta(opciones=["Hablar de la golpiza con detalle", "b", "c"]))
    assert error.value.motivo == esquemas.MOTIVO_CONTENIDO


@pytest.mark.parametrize("cambios", [
    {"escenas": [falso.FICHA["escenas"][0]]},
    {"personajes": []},
    {"momento": "tarde"},
    {"intensidad": "EXTREME"},
    {"hitos": ["llama al 3001234567"]},
])
def test_una_ficha_fuera_de_las_reglas_se_rechaza(cambios):
    with pytest.raises(CoautoriaInvalida):
        esquemas.ficha({**falso.FICHA, **cambios})


def test_la_descripcion_de_la_ficha_cabe_en_el_tope_de_la_generacion():
    larga = {**falso.FICHA, "objetivo": "o" * 400, "escenas": [{"titulo": "t" * 120, "proposito": "p" * 300}] * 8}

    texto = prompts.descripcion(esquemas.ficha(larga), 2000)

    assert len(texto) <= 2000 and texto.startswith("Caso: ")
    assert coautorias.MAXIMO_IDEA == 2000

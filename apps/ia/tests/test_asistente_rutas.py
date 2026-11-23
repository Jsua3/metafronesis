"""Las rutas del asistente de autoría: permisos, apagado, cupos, fallos del proveedor y auditoría (SIEP-244).

Las rutas cuelgan de ``/api/authoring/cases/<id>/assistant/{status,propose,guide}``. El proveedor es el falso o un
doble: jamás hay red.
"""
import json
from urllib.error import URLError

import pytest

from apps.ia import proveedores
from apps.ia.asistente import config as config_del_asistente
from apps.ia.asistente import errores, guia, limites, propuestas
from apps.ia.proveedores import ProveedorFalso
from apps.simulation.models import AuditLog, AuthoringAssistantUsage, CaseVersion

from .conftest import cliente_de

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-244")]

RUTA = "/api/authoring/cases"
CLAVE = "sk-ant-clave-de-prueba-0123456789"
SECRETO = "TEXTO-SECRETO-DE-LA-PETICION"
MENSAJE_DIARIO = "Llegaste al límite de ayuda de la IA por hoy."
MENSAJE_MENSUAL = "El programa agotó la ayuda de la IA de este mes."
MENSAJE_PROVEEDOR = "La IA no respondió. Inténtalo de nuevo en un momento."
MENSAJE_RECHAZO = "La IA no puede ayudar con esa petición. Prueba a pedirla de otra forma."
MENSAJE_INVALIDA = "La propuesta no se pudo usar. Pídela de nuevo con otras palabras."
CATALOGO = [{"id": "mapa.agregar-sala", "nombre": "Agregar una sala", "pantalla": "editor-mapa"}]


@pytest.fixture
def encendido(settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"
    settings.AI_AUTHORING_API_KEY = ""
    settings.AI_AUTHORING_DAILY_LIMIT_PER_USER = 5
    settings.AI_AUTHORING_MONTHLY_LIMIT = 100


@pytest.fixture
def doble(monkeypatch, encendido):
    """Reemplaza ``propuestas.proponer`` y ``guia.responder``: cuenta llamadas y devuelve un resultado fijo."""
    llamadas = {"propose": 0, "guide": 0}

    def proponer(**kwargs):
        llamadas["propose"] += 1
        return {"mensaje": "Propuesta simulada", "cambios": [], "modo": "connected", "model": "claude-opus-5-5", "changes": 2}

    def responder(**kwargs):
        llamadas["guide"] += 1
        return {"accionId": None, "modo": "foco", "mensaje": "Guía simulada", "model": "claude-haiku-5-5", "changes": 0}

    monkeypatch.setattr(propuestas, "proponer", proponer)
    monkeypatch.setattr(guia, "responder", responder)
    return llamadas


def _proponer(cliente, version, **extra):
    cuerpo = {"peticion": SECRETO, "pantalla": "Editor-Mapa", **extra}
    return cliente.post(f"{RUTA}/{version.pk}/assistant/propose", cuerpo, format="json")


def _guiar(cliente, version, **extra):
    cuerpo = {"pregunta": SECRETO, "acciones": [], **extra}
    return cliente.post(f"{RUTA}/{version.pk}/assistant/guide", cuerpo, format="json")


def _estado(cliente, version):
    return cliente.get(f"{RUTA}/{version.pk}/assistant/status")


def _filas(accion):
    return list(AuditLog.objects.filter(action=accion))


# ─── apagado ────────────────────────────────────────────────────────────────────────────
def test_apagado_el_estado_dice_disabled_y_propose_y_guide_son_404_sin_tocar_al_proveedor(cliente, version, doble, settings):
    settings.AI_AUTHORING_ENABLED = False

    estado = _estado(cliente, version)
    assert estado.status_code == 200
    assert estado.data["data"] == {"enabled": False, "mode": "disabled", "remainingToday": 5}
    for respuesta in (_proponer(cliente, version), _guiar(cliente, version)):
        assert respuesta.status_code == 404
        assert respuesta.data["message"] == "El asistente no está disponible"
    assert doble == {"propose": 0, "guide": 0}
    assert not AuthoringAssistantUsage.objects.exists()
    assert not AuditLog.objects.filter(action__startswith="AI_AUTHORING").exists()


# ─── permisos ───────────────────────────────────────────────────────────────────────────
def test_un_estudiante_es_403_y_un_docente_ajeno_es_404_en_las_tres_rutas(encendido, estudiante, docentes, version, doble):
    ajeno = cliente_de(docentes[0][1])
    estudiante_cliente = cliente_de(estudiante)
    for cliente in (estudiante_cliente, ajeno):
        esperado = 403 if cliente is estudiante_cliente else 404
        assert _proponer(cliente, version).status_code == esperado
        assert _guiar(cliente, version).status_code == esperado
        assert _estado(cliente, version).status_code == esperado
    assert doble == {"propose": 0, "guide": 0}


def test_el_dueno_y_el_admin_pasan(encendido, cliente, docentes, version, doble):
    assert _proponer(cliente, version).status_code == 200
    assert _guiar(cliente_de(docentes[1]), version).status_code == 200


def test_una_version_que_no_es_borrador_es_409_y_no_gasta_cupo(encendido, cliente, version, doble):
    CaseVersion.objects.filter(pk=version.pk).update(status="PUBLISHED")

    respuesta = _proponer(cliente, version)

    assert respuesta.status_code == 409 and respuesta.data["code"] == "VERSION_NOT_EDITABLE"
    assert _guiar(cliente, version).status_code == 409
    assert doble == {"propose": 0, "guide": 0}
    assert not AuthoringAssistantUsage.objects.exists()


def test_una_version_que_no_existe_es_404(encendido, cliente, version, doble):
    CaseVersion.objects.filter(pk=version.pk).delete()
    assert _proponer(cliente, version).status_code == 404


# ─── cuerpo ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "cuerpo",
    [{}, {"peticion": "", "pantalla": "p"}, {"peticion": "  ", "pantalla": "p"}, {"peticion": 3, "pantalla": "p"},
     {"peticion": "x"}, {"peticion": "x", "pantalla": 7}, {"peticion": "x", "pantalla": "###"},
     {"peticion": "x" * 2001, "pantalla": "p"}, {"peticion": "x", "pantalla": "p", "seleccion": "s" * 201}],
)
def test_un_cuerpo_mal_formado_de_propose_es_400_y_no_gasta_nada(cliente, version, doble, cuerpo):
    respuesta = cliente.post(f"{RUTA}/{version.pk}/assistant/propose", cuerpo, format="json")

    assert respuesta.status_code == 400
    assert doble["propose"] == 0 and not AuthoringAssistantUsage.objects.exists()


@pytest.mark.parametrize("cuerpo", [
    {}, {"pregunta": 1, "acciones": []}, {"pregunta": "x"}, {"pregunta": "x", "acciones": "no"},
    {"pregunta": "", "acciones": []}, {"pregunta": "x" * 501, "acciones": []},
    {"pregunta": "x", "acciones": [{"id": "a", "nombre": "A"}]},
    {"pregunta": "x", "acciones": [{"id": "con espacio", "nombre": "A", "pantalla": "p"}]},
    {"pregunta": "x", "acciones": [{"id": "a", "nombre": "A", "pantalla": "p" * 65}]},
    {"pregunta": "x", "acciones": [{"id": f"a{i}", "nombre": "A", "pantalla": "p"} for i in range(61)]},
])
def test_un_cuerpo_mal_formado_de_guide_es_400_antes_del_cupo(cliente, version, doble, cuerpo):
    assert cliente.post(f"{RUTA}/{version.pk}/assistant/guide", cuerpo, format="json").status_code == 400
    assert doble["guide"] == 0 and not AuthoringAssistantUsage.objects.exists()


def test_sesenta_acciones_es_el_tope_que_si_pasa(cliente, version, doble):
    acciones = [{"id": f"a.{i}", "nombre": "A", "pantalla": "p"} for i in range(60)]
    assert _guiar(cliente, version, acciones=acciones).status_code == 200


# ─── estado ─────────────────────────────────────────────────────────────────────────────
def test_el_estado_dice_el_modo_y_lo_que_queda_de_cupo(cliente, version, doble):
    assert _estado(cliente, version).data["data"] == {"enabled": True, "mode": "connected", "remainingToday": 5}
    _proponer(cliente, version)
    _guiar(cliente, version)
    assert _estado(cliente, version).data["data"]["remainingToday"] == 3


def test_con_un_proveedor_real_sin_clave_el_modo_es_disabled(cliente, version, encendido, settings):
    settings.AI_AUTHORING_PROVIDER = "anthropic"

    assert _estado(cliente, version).data["data"] == {"enabled": False, "mode": "disabled", "remainingToday": 5}


# ─── camino feliz y auditoría ───────────────────────────────────────────────────────────
def test_propose_devuelve_el_resultado_y_audita_sin_el_texto(cliente, docente, version, doble):
    respuesta = _proponer(cliente, version, seleccion={"tipo": "objeto"})

    assert respuesta.status_code == 200
    assert respuesta.data["data"]["mensaje"] == "Propuesta simulada"
    (fila,) = _filas("AI_AUTHORING_PROPOSE")
    assert fila.actor_id == docente.id and fila.resource_type == "CASE_VERSION" and fila.resource_id == str(version.pk)
    contexto = json.loads(fila.context_json)
    assert contexto["taxonomy"] == "asistente_autoria.proponer"
    assert contexto["screen"] == "editor-mapa" and contexto["model"] == "claude-opus-5-5"
    assert contexto["changes"] == 2 and contexto["outcome"] == "ok" and isinstance(contexto["duration_ms"], int)
    assert SECRETO not in fila.context_json and "Propuesta simulada" not in fila.context_json


def test_guide_se_audita_con_su_propia_accion_y_sin_la_pregunta(cliente, version, doble):
    assert _guiar(cliente, version).status_code == 200

    (fila,) = _filas("AI_AUTHORING_GUIDE")
    contexto = json.loads(fila.context_json)
    assert contexto["taxonomy"] == "asistente_autoria.guiar" and contexto["outcome"] == "ok"
    assert SECRETO not in fila.context_json


def test_el_proveedor_falso_responde_el_contrato_completo(cliente, version, encendido):
    propuesta = _proponer(cliente, version)
    guia_respuesta = _guiar(cliente, version, acciones=CATALOGO)

    assert propuesta.status_code == 200
    assert set(propuesta.data["data"]) == {"mensaje", "cambios", "changes", "model", "modo"}
    assert propuesta.data["data"]["modo"] == "connected" and propuesta.data["data"]["cambios"][0]["op"] == "add-scene"
    assert guia_respuesta.status_code == 200
    assert set(guia_respuesta.data["data"]) == {"accionId", "modo", "mensaje", "model", "changes"}
    assert guia_respuesta.data["data"]["accionId"] == "mapa.agregar-sala" and guia_respuesta.data["data"]["changes"] == 0


def test_proponer_no_escribe_nada_en_el_caso(cliente, version, caso, encendido):
    antes = (version.nodes.count(), version.version)

    assert _proponer(cliente, version).status_code == 200

    version.refresh_from_db()
    assert (version.nodes.count(), version.version) == antes


# ─── límites ────────────────────────────────────────────────────────────────────────────
def test_pasado_el_limite_diario_es_429_con_su_mensaje_y_sin_fila_de_auditoria(cliente, version, doble, settings):
    settings.AI_AUTHORING_DAILY_LIMIT_PER_USER = 2
    assert _proponer(cliente, version).status_code == 200
    assert _guiar(cliente, version).status_code == 200
    auditorias = AuditLog.objects.filter(action__startswith="AI_AUTHORING").count()

    respuesta = _proponer(cliente, version)

    assert respuesta.status_code == 429
    assert respuesta.data["code"] == "AI_LIMIT_EXCEEDED" and respuesta.data["message"] == MENSAJE_DIARIO
    assert doble == {"propose": 1, "guide": 1}
    assert AuditLog.objects.filter(action__startswith="AI_AUTHORING").count() == auditorias
    assert _estado(cliente, version).data["data"]["remainingToday"] == 0


def test_el_limite_mensual_es_global_entre_personas(cliente, docentes, version, doble, settings):
    settings.AI_AUTHORING_MONTHLY_LIMIT = 1
    assert _proponer(cliente, version).status_code == 200

    respuesta = _proponer(cliente_de(docentes[1]), version)  # el admin también puede autorar este caso

    assert respuesta.status_code == 429
    assert respuesta.data["code"] == "AI_LIMIT_EXCEEDED" and respuesta.data["message"] == MENSAJE_MENSUAL


def test_el_cupo_es_por_persona(cliente, docentes, version, doble, settings):
    settings.AI_AUTHORING_DAILY_LIMIT_PER_USER = 2
    for _ in range(2):
        assert _proponer(cliente, version).status_code == 200

    assert _proponer(cliente_de(docentes[1]), version).status_code == 200


def test_devolver_nunca_baja_de_cero(docente, encendido):
    limites.devolver(docente)
    assert not AuthoringAssistantUsage.objects.filter(user=docente, count__lt=0).exists()
    limites.consumir(docente)
    limites.devolver(docente)
    limites.devolver(docente)
    assert AuthoringAssistantUsage.objects.get(user=docente).count == 0


# ─── fallos del proveedor ───────────────────────────────────────────────────────────────
@pytest.mark.parametrize("tipo", ["timeout", "http", "malformed"])
def test_un_fallo_del_proveedor_es_un_502_en_espanol_que_no_gasta_cupo(cliente, version, encendido, monkeypatch, tipo):
    def proponer(**kwargs):
        raise errores.ErrorDeProveedor(tipo, f"fallo interno con {CLAVE}")

    monkeypatch.setattr(propuestas, "proponer", proponer)

    respuesta = _proponer(cliente, version)

    assert respuesta.status_code == 502
    assert respuesta.data["code"] == "AI_PROVIDER_ERROR" and respuesta.data["message"] == MENSAJE_PROVEEDOR
    assert CLAVE not in respuesta.content.decode() and "fallo interno" not in respuesta.content.decode()
    assert _estado(cliente, version).data["data"]["remainingToday"] == 5
    assert json.loads(_filas("AI_AUTHORING_PROPOSE")[0].context_json)["outcome"] == "error"


def test_un_rechazo_es_422_y_si_gasta_cupo(cliente, version, encendido, monkeypatch):
    def responder(**kwargs):
        raise errores.ErrorDeProveedor("refusal", "no")

    monkeypatch.setattr(guia, "responder", responder)

    respuesta = _guiar(cliente, version)

    assert respuesta.status_code == 422
    assert respuesta.data["code"] == "AI_REFUSED" and respuesta.data["message"] == MENSAJE_RECHAZO
    assert _estado(cliente, version).data["data"]["remainingToday"] == 4
    assert json.loads(_filas("AI_AUTHORING_GUIDE")[0].context_json)["outcome"] == "refusal"


def test_una_propuesta_invalida_es_422_con_motivo_fijo_y_gasta_cupo(cliente, version, encendido, monkeypatch):
    def proponer(**kwargs):
        raise propuestas.PropuestaInvalida("Cambio 1: el elemento no está en el caso.")

    monkeypatch.setattr(propuestas, "proponer", proponer)

    respuesta = _proponer(cliente, version)

    assert respuesta.status_code == 422
    assert respuesta.data["code"] == "AI_PROPOSAL_INVALID" and respuesta.data["message"] == MENSAJE_INVALIDA
    assert respuesta.data["motivo"] == "Cambio 1: el elemento no está en el caso."
    assert _estado(cliente, version).data["data"]["remainingToday"] == 4
    assert json.loads(_filas("AI_AUTHORING_PROPOSE")[0].context_json)["outcome"] == "invalid"


def test_un_error_inesperado_devuelve_el_cupo_y_se_propaga(cliente, version, encendido, monkeypatch, docente):
    def proponer(**kwargs):
        raise RuntimeError("falla del codigo")

    monkeypatch.setattr(propuestas, "proponer", proponer)
    cliente.raise_request_exception = False

    respuesta = _proponer(cliente, version)

    assert respuesta.status_code == 500
    assert limites.restante_hoy(docente) == 5


def test_un_fallo_dentro_del_proveedor_real_nunca_filtra_la_clave(cliente, version, encendido, monkeypatch, settings):
    """Anthropic falla de verdad (red simulada): 502, cupo devuelto y la clave en ninguna parte."""
    settings.AI_AUTHORING_PROVIDER = "anthropic"
    settings.AI_AUTHORING_API_KEY = CLAVE

    def solicitar(url, datos, cabeceras, *args, **kwargs):
        raise URLError(f"conexión rechazada con {cabeceras['x-api-key']}")

    monkeypatch.setattr(proveedores, "_solicitar", solicitar)

    respuesta = _proponer(cliente, version)

    assert respuesta.status_code == 502
    assert CLAVE not in respuesta.content.decode()
    assert _estado(cliente, version).data["data"]["remainingToday"] == 5
    for fila in AuditLog.objects.all():
        assert CLAVE not in fila.context_json and CLAVE not in (fila.user_agent or "")
    assert CLAVE not in json.dumps(_estado(cliente, version).data)


def test_el_tiempo_agotado_se_clasifica_como_timeout(cliente, version, encendido, monkeypatch, settings):
    settings.AI_AUTHORING_PROVIDER = "anthropic"
    settings.AI_AUTHORING_API_KEY = CLAVE

    def solicitar(*args, **kwargs):
        raise TimeoutError("lento")

    monkeypatch.setattr(proveedores, "_solicitar", solicitar)

    assert _guiar(cliente, version, acciones=CATALOGO).status_code == 502
    assert json.loads(_filas("AI_AUTHORING_GUIDE")[0].context_json)["outcome"] == "error"


def test_el_proveedor_recibe_la_configuracion_de_tiempo_y_tokens(cliente, version, encendido, monkeypatch, settings):
    settings.AI_AUTHORING_TIMEOUT_SECONDS = 33
    settings.AI_AUTHORING_MAX_TOKENS_PROPOSE = 1234
    visto = {}

    def responder(self, instrucciones, mensajes, **kwargs):
        visto.update(kwargs)
        return json.dumps({"message": "Listo.", "changes": []})

    monkeypatch.setattr(ProveedorFalso, "responder", responder)

    assert _proponer(cliente, version).status_code == 200
    assert visto == {"max_tokens": 1234, "tiempo": 33}
    assert config_del_asistente.actual().timeout_seconds == 33

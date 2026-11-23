"""La guía del editor: elige una acción del catálogo que manda el cliente (SIEP-244).

Jamás hay red. Se prueba que la respuesta nunca confía en el modelo (id inventado → ``null``, modo raro → ``foco``,
mensaje malo → texto fijo), que se usa el modelo rápido y que el catálogo vacío no llama al proveedor.
"""
import json

import pytest

from apps.ia.asistente import config as config_del_asistente
from apps.ia.asistente import errores, esquema, guia, prompts
from apps.ia.proveedores import ProveedorFalso

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-244")]

FALLBACK = "No encontré esa acción. Prueba con el buscador de acciones."
FOUND = "Te muestro dónde está."
CATALOGO = [
    {"id": "mapa.agregar-sala", "nombre": "Agregar una sala", "pantalla": "editor-mapa"},
    {"id": "dialogo.nueva-linea", "nombre": "Escribir una línea de diálogo", "pantalla": "editor-dialogo"},
]


@pytest.fixture
def proveedor(monkeypatch, settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"
    visto = {"llamadas": 0}
    respuesta = {"valor": {"accionId": "mapa.agregar-sala", "modo": "resaltar", "mensaje": "Aquí está."}}

    def responder(self, instrucciones, mensajes, **kwargs):
        visto.update(llamadas=visto["llamadas"] + 1, instrucciones=instrucciones, mensajes=mensajes, kwargs=kwargs,
                     modelo=self.modelo)
        valor = respuesta["valor"]
        return valor if isinstance(valor, str) else json.dumps(valor)

    monkeypatch.setattr(ProveedorFalso, "responder", responder)
    visto["respuesta"] = respuesta
    return visto


def _responder(pregunta="¿Dónde agrego una sala?", acciones=None, **cambios):
    config = config_del_asistente.actual()
    if cambios:
        config = type(config)(**{**config.__dict__, **cambios})
    return guia.responder(config=config, pregunta=pregunta, acciones=CATALOGO if acciones is None else acciones)


def test_devuelve_una_accion_del_catalogo_enviado_y_nunca_una_inventada(proveedor):
    assert _responder() == {"accionId": "mapa.agregar-sala", "modo": "resaltar", "mensaje": "Aquí está.",
                            "model": "claude-haiku-5-5", "changes": 0}

    proveedor["respuesta"]["valor"] = {"accionId": "borrar.todo", "modo": "foco", "mensaje": "Ahí."}
    resultado = _responder()
    assert resultado["accionId"] is None and resultado["mensaje"] == "Ahí."


def test_pregunta_fuera_de_lugar_devuelve_accion_null(proveedor):
    proveedor["respuesta"]["valor"] = {"accionId": None, "modo": "foco", "mensaje": "Eso no está en el editor."}

    resultado = _responder("¿Cuál es la capital de Francia?")

    assert resultado["accionId"] is None and resultado["mensaje"] == "Eso no está en el editor."
    assert proveedor["llamadas"] == 1


def test_usa_el_modelo_rapido_con_las_instrucciones_y_el_esquema_de_la_guia(proveedor):
    resultado = _responder(model_fast="claude-haiku-9-9")

    assert proveedor["modelo"] == "claude-haiku-9-9" and resultado["model"] == "claude-haiku-9-9"
    assert proveedor["instrucciones"].startswith(prompts.MARCA_GUIA)
    assert prompts.SYSTEM_GUIDE in proveedor["instrucciones"]
    assert json.dumps(esquema.GUIA, ensure_ascii=False) in proveedor["instrucciones"]
    assert proveedor["kwargs"] == {"max_tokens": 600, "tiempo": 60}


def test_el_mensaje_lleva_la_pregunta_y_el_catalogo_y_nada_mas(proveedor):
    _responder("¿Dónde agrego una sala?")

    (mensaje,) = proveedor["mensajes"]
    assert mensaje == {"role": "user", "content": prompts.guide_message("¿Dónde agrego una sala?", CATALOGO)}
    for accion in CATALOGO:
        assert accion["id"] in mensaje["content"] and accion["nombre"] in mensaje["content"]


def test_la_pregunta_no_manda_correos_ni_numeros_largos(proveedor):
    _responder("¿Cómo escribo a ana@correo.co o al 3001234567?")

    contenido = proveedor["mensajes"][0]["content"]
    assert "ana@correo.co" not in contenido and "3001234567" not in contenido


def test_el_esquema_de_la_guia_es_cerrado():
    assert esquema.GUIA["additionalProperties"] is False
    assert set(esquema.GUIA["required"]) == {"accionId", "modo", "mensaje"}
    assert esquema.GUIA["properties"]["modo"]["enum"] == ["resaltar", "foco", "recorrido"]


@pytest.mark.parametrize("modo", ["otro", None, 3, "RESALTAR"])
def test_un_modo_raro_se_vuelve_foco(proveedor, modo):
    proveedor["respuesta"]["valor"] = {"accionId": "mapa.agregar-sala", "modo": modo, "mensaje": "Aquí."}

    assert _responder()["modo"] == "foco"


@pytest.mark.parametrize("mensaje", ["", "   ", None, 7, ["x"]])
def test_un_mensaje_malo_se_vuelve_el_texto_fijo(proveedor, mensaje):
    proveedor["respuesta"]["valor"] = {"accionId": None, "modo": "foco", "mensaje": mensaje}

    assert _responder()["mensaje"] == FALLBACK


@pytest.mark.parametrize("mensaje", ["", None, "Hay un charco de sangre."])
def test_con_accion_valida_y_mensaje_inservible_el_texto_es_neutro(proveedor, mensaje):
    proveedor["respuesta"]["valor"] = {"accionId": "mapa.agregar-sala", "modo": "resaltar", "mensaje": mensaje}

    resultado = _responder()

    assert resultado["accionId"] == "mapa.agregar-sala" and resultado["mensaje"] == FOUND


def test_un_mensaje_largo_se_recorta_en_una_palabra_con_puntos_suspensivos(proveedor):
    proveedor["respuesta"]["valor"] = {"accionId": None, "modo": "foco", "mensaje": "palabra " * 80}

    mensaje = _responder()["mensaje"]

    assert len(mensaje) <= 300 and mensaje.endswith("palabra…")


def test_una_respuesta_json_que_no_es_un_objeto_no_rompe(proveedor):
    proveedor["respuesta"]["valor"] = ["no", "soy", "un", "objeto"]

    assert _responder() == {"accionId": None, "modo": "foco", "mensaje": FALLBACK, "model": "claude-haiku-5-5", "changes": 0}


def test_una_respuesta_que_no_es_json_es_malformada(proveedor):
    proveedor["respuesta"]["valor"] = "esto no es json"

    with pytest.raises(errores.ErrorDeProveedor) as caught:
        _responder()

    assert caught.value.tipo == "malformed"


def test_con_el_catalogo_vacio_no_se_llama_al_proveedor(proveedor):
    resultado = _responder(acciones=[])

    assert proveedor["llamadas"] == 0
    assert resultado == {"accionId": None, "modo": "foco", "mensaje": FALLBACK, "model": "claude-haiku-5-5", "changes": 0}


def test_sin_clave_es_error_del_proveedor_sin_llamar_a_la_red(proveedor, settings):
    settings.AI_AUTHORING_PROVIDER = "anthropic"
    settings.AI_AUTHORING_API_KEY = ""

    with pytest.raises(errores.ErrorDeProveedor) as caught:
        _responder()

    assert caught.value.tipo == "http" and proveedor["llamadas"] == 0


def test_el_proveedor_falso_elige_la_primera_accion_del_catalogo(settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"

    resultado = _responder()

    assert resultado["accionId"] == "mapa.agregar-sala" and resultado["modo"] in esquema.MODOS_DE_GUIA

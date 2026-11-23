"""Las propuestas del asistente de autoría: contexto, esquema y validación contra el caso (SIEP-244).

Jamás hay red: el proveedor es el falso o un doble. Se prueba que (1) el contexto no lleva datos de intentos ni de
cuentas, (2) el esquema es cerrado, (3) la validación es atómica y revisa cada referencia contra ESTA versión y
(4) lo gráfico no pasa nunca y lo revictimizante solo sale como CONTRAINDICATED con su razón.
"""
import json
import re
from pathlib import Path

import jsonschema
import pytest

from apps.ia.asistente import config as config_del_asistente
from apps.ia.asistente import contexto, errores, esquema, prompts, propuestas
from apps.ia.proveedores import ProveedorFalso

pytestmark = [pytest.mark.django_db, pytest.mark.req("SIEP-244")]

LISTA_NEGRA = ("attempt", "student", "user", "email", "password", "ip", "user_agent", "audit", "session",
               "created_by", "createdby", "actor")


@pytest.fixture
def ids(caso):
    return {
        "node": caso["inicio"].id, "map": caso["sala"].id, "object": caso["objeto"].id,
        "character": caso["personaje"].id, "decision": caso["recomendada"].id,
        "contraindicada": caso["contraindicada"].id, "milestone": caso["hito"],
    }


@pytest.fixture
def foreign(ajeno):
    return {"node": ajeno["inicio"].id, "map": ajeno["sala"].id, "object": ajeno["objeto"].id,
            "decision": ajeno["recomendada"].id, "character": ajeno["personaje"].id}


def _scene(**extra):
    return {"op": "add-scene", "id": "nueva-1", "title": "Una conversación tranquila", "narrative": "Se sientan a hablar.",
            "intensity": "MEDIUM", "warningMessage": "", "afterNodeId": None, **extra}


def _line(node, character, **extra):
    return {"op": "add-line", "nodeId": node, "characterId": character, "text": "No sé por dónde empezar.",
            "expression": "preocupada", **extra}


def _response(node, **extra):
    return {"op": "add-response", "nodeId": node, "text": "Tómate el tiempo que necesites.", "responseClass": "RECOMMENDED",
            "feedbackText": "Da seguridad y no presiona.", "prohibitionReason": "", "targetNodeId": node, **extra}


def _ending(**extra):
    return {"op": "add-ending", "key": "final_nuevo", "title": "Un final", "message": "La persona se siente acompañada.",
            "tone": "positive", "when": None, **extra}


def _raw(*changes, message="Te propongo esto."):
    return {"message": message, "changes": list(changes)}


def _invalid(version, raw):
    with pytest.raises(propuestas.PropuestaInvalida) as caught:
        propuestas.validar(version, raw)
    assert str(caught.value) and propuestas.es_motivo_fijo(str(caught.value)), str(caught.value)
    return caught.value


# ─── contexto ───────────────────────────────────────────────────────────────────────────
def _keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield str(key)
            yield from _keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _keys(inner)


def test_el_contexto_no_contiene_campos_de_intentos_ni_usuarios(version):
    construido = contexto.construir(version, "editor-mapa", None)

    claves = list(_keys(construido))
    assert claves
    for clave in claves:
        for prohibida in LISTA_NEGRA:
            assert prohibida not in clave.lower(), f"la clave «{clave}» contiene «{prohibida}»"
    json.dumps(construido)


def test_el_contexto_lleva_escenas_respuestas_salas_personajes_hitos_y_finales(version, caso):
    construido = contexto.construir(version, "editor-mapa", "objeto 3")

    assert construido["screen"] == "editor-mapa" and construido["selection"] == "objeto 3"
    assert {n["id"] for n in construido["nodes"]} == {caso["inicio"].id, caso["cierre"].id}
    assert {"id", "title", "text", "order", "intensity"} <= set(construido["nodes"][0])
    decision = construido["decisions"][0]
    assert {"id", "nodeId", "text", "responseClass", "effects", "feedback", "nextNodeId"} <= set(decision)
    assert [m["id"] for m in construido["maps"]] == [caso["sala"].id]
    assert [o["id"] for o in construido["objects"]] == [caso["objeto"].id]
    assert [c["id"] for c in construido["characters"]] == [caso["personaje"].id]
    assert [m["key"] for m in construido["milestones"]] == ["hito_uno"]
    assert [e["key"] for e in construido["endings"]] == ["final_base"]
    assert "riskLevel" in construido


def test_el_contexto_lleva_las_lineas_de_dialogo_con_el_personaje(version, caso):
    from apps.simulation.models.world import DialogueLine, DialogueTree

    arbol = DialogueTree.objects.create(scene_map=caso["sala"], map_object=caso["objeto"], tree_key="t", speaker_name="Ana")
    DialogueLine.objects.create(dialogue_tree=arbol, display_order=0, speaker_name="Ana", text="Hola.", emotion="triste")

    (linea,) = contexto.construir(version, "p", None)["dialogues"]

    assert linea == {"dialogueId": arbol.id, "mapId": caso["sala"].id, "characterId": caso["personaje"].id,
                     "text": "Hola.", "expression": "triste", "order": 0}


def test_la_seleccion_larga_se_recorta_a_200(version):
    assert len(contexto.construir(version, "p", "x" * 900)["selection"]) == 200
    assert contexto.construir(version, "p", None)["selection"] is None


# ─── esquema ────────────────────────────────────────────────────────────────────────────
def _walk(node):
    yield node
    if isinstance(node, dict):
        for inner in node.values():
            yield from _walk(inner)
    elif isinstance(node, list):
        for inner in node:
            yield from _walk(inner)


def test_el_esquema_es_cerrado_sin_recursion_ni_limites_y_cubre_las_diez_operaciones():
    jsonschema.Draft202012Validator.check_schema(esquema.PROPUESTA)
    for nodo in _walk(esquema.PROPUESTA):
        if isinstance(nodo, dict) and nodo.get("type") == "object":
            assert nodo["additionalProperties"] is False
            assert sorted(nodo["required"]) == sorted(nodo["properties"])
        if isinstance(nodo, dict):
            assert not {"$ref", "$defs", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength"} & set(nodo)
    ops = {v["properties"]["op"]["enum"][0] for v in esquema.PROPUESTA["properties"]["changes"]["items"]["anyOf"]}
    assert ops == {"add-scene", "add-line", "add-response", "place-character", "move", "add-ending",
                   "set-response-class", "set-persona-effect", "mark-milestone", "set-intensity"}


def test_los_vocabularios_del_esquema_son_los_cerrados():
    texto = json.dumps(esquema.PROPUESTA)
    for palabra in ("RECOMMENDED", "ACCEPTABLE", "RISKY", "CONTRAINDICATED", "neutral", "alegre", "preocupada", "triste",
                    "cautelosa", "en-crisis", "LOW", "MEDIUM", "HIGH"):
        assert f'"{palabra}"' in texto
    assert set(esquema.EXPRESIONES) == {"neutral", "alegre", "preocupada", "triste", "cautelosa", "en-crisis"}


def test_el_esquema_cabe_en_el_limite_de_uniones_del_proveedor():
    uniones = sum(
        1
        for nodo in _walk(esquema.PROPUESTA)
        if isinstance(nodo, dict) and nodo.get("type") == "object"
        for propiedad in nodo["properties"].values()
        if "anyOf" in propiedad or isinstance(propiedad.get("type"), list)
    )
    assert uniones <= 16


def test_la_condicion_de_un_final_viaja_como_texto_en_el_esquema():
    variante = next(v for v in esquema.PROPUESTA["properties"]["changes"]["items"]["anyOf"]
                    if v["properties"]["op"]["enum"] == ["add-ending"])
    assert variante["properties"]["when"] == {"type": "string"}


# ─── validación: lo bueno ───────────────────────────────────────────────────────────────
def test_una_propuesta_valida_conserva_el_orden_y_marca_ai_suggested(version, ids):
    cuando = {"kind": "all", "items": [
        {"kind": "milestone", "milestone": ids["milestone"]},
        {"kind": "count", "responseClass": "CONTRAINDICATED", "comparator": "gte", "value": 1},
        {"kind": "persona", "bond": "OPEN", "activation": None},
    ]}
    raw = _raw(
        _scene(afterNodeId=str(ids["node"])),
        _line("nueva-1", ids["character"]),
        _response(str(ids["node"]), targetNodeId="nueva-1"),
        _response(str(ids["node"]), text="Cuéntame con calma.", responseClass="CONTRAINDICATED",
                  prohibitionReason="Presiona a la persona.", targetNodeId=str(ids["node"])),
        {"op": "place-character", "mapId": ids["map"], "characterId": ids["character"], "x": 10, "y": 10,
         "expression": "cautelosa"},
        {"op": "move", "objectId": ids["object"], "x": 12, "y": 14},
        _ending(when=json.dumps(cuando)),
        {"op": "set-response-class", "decisionId": ids["decision"], "responseClass": "RISKY", "prohibitionReason": ""},
        {"op": "set-persona-effect", "decisionId": ids["decision"], "bond": -1, "activation": None},
        {"op": "mark-milestone", "decisionId": ids["decision"], "milestoneKey": ids["milestone"]},
        {"op": "set-intensity", "nodeId": "nueva-1", "intensity": "LOW", "warningMessage": ""},
        message="Agrego una escena nueva.",
    )

    propuesta = propuestas.validar(version, raw)

    assert propuesta.mensaje == "Agrego una escena nueva."
    assert [c["op"] for c in propuesta.cambios] == [c["op"] for c in raw["changes"]]
    assert all(c["aiSuggested"] is True for c in propuesta.cambios)
    assert propuesta.cambios[0]["afterNodeId"] == ids["node"]
    assert propuesta.cambios[2]["nodeId"] == ids["node"] and propuesta.cambios[2]["targetNodeId"] == "nueva-1"
    assert propuesta.cambios[6]["when"] == {"all": [{"milestone": ids["milestone"]},
                                                     {"count": "contraindicated", "gte": 1},
                                                     {"persona": {"bond": "OPEN"}}]}
    assert "aiSuggested" not in raw["changes"][0]
    jsonschema.validate(raw, esquema.PROPUESTA)


def test_la_condicion_de_texto_se_traduce_y_sin_condicion_es_none(version, ids):
    cuando = json.dumps({"kind": "all", "items": [
        {"kind": "milestone", "milestone": ids["milestone"]}, {"kind": "persona", "bond": "OPEN", "activation": None},
    ]})
    cambios = propuestas.validar(version, _raw(_ending(when=cuando), _ending(key="final_por_defecto", when=""))).cambios

    assert cambios[0]["when"] == {"all": [{"milestone": ids["milestone"]}, {"persona": {"bond": "OPEN"}}]}
    assert cambios[1]["when"] is None


def test_validar_deja_el_modelo_vacio_y_sin_cambios_es_valida(version):
    propuesta = propuestas.validar(version, _raw(message="Tu caso ya tiene salida."))
    assert propuesta.modelo == "" and propuesta.cambios == []


# ─── validación: lo malo ────────────────────────────────────────────────────────────────
def test_una_condicion_de_texto_que_no_es_json_o_sale_del_vocabulario_es_invalida(version):
    _invalid(version, _raw(_ending(when="hito cumplido")))
    _invalid(version, _raw(_ending(when="[1, 2]")))
    _invalid(version, _raw(_ending(when=json.dumps({"kind": "metric", "value": 3}))))
    _invalid(version, _raw(_ending(when=json.dumps({"kind": "milestone", "milestone": "no_existe"}))))
    _invalid(version, _raw(_ending(when=" " * 10 + "x" * 5000)))


def test_un_id_de_escena_de_texto_que_no_esta_en_el_caso_es_invalido(version, ids):
    _invalid(version, _raw(_line("987654321", ids["character"])))
    _invalid(version, _raw(_line("-1", ids["character"])))
    _invalid(version, _raw(_line(" 12", ids["character"])))


def test_un_id_temporal_se_declara_antes_de_usarse_y_no_se_repite(version, ids):
    _invalid(version, _raw(_line("nueva-1", ids["character"]), _scene()))
    _invalid(version, _raw(_scene(), _scene()))
    _invalid(version, _raw(_scene(id="otra")))
    _invalid(version, _raw(_scene(afterNodeId="nueva-1")))


def test_ids_reales_de_otro_caso_son_invalidos_en_cada_operacion(version, ids, foreign):
    nodo_ajeno = str(foreign["node"])
    _invalid(version, _raw(_line(nodo_ajeno, ids["character"])))
    _invalid(version, _raw(_response(nodo_ajeno)))
    _invalid(version, _raw(_response(str(ids["node"]), targetNodeId=nodo_ajeno)))
    _invalid(version, _raw(_scene(afterNodeId=nodo_ajeno)))
    _invalid(version, _raw({"op": "place-character", "mapId": foreign["map"], "characterId": ids["character"], "x": 1,
                            "y": 1, "expression": "neutral"}))
    _invalid(version, _raw({"op": "place-character", "mapId": ids["map"], "characterId": foreign["character"], "x": 1,
                            "y": 1, "expression": "neutral"}))
    _invalid(version, _raw({"op": "move", "objectId": foreign["object"], "x": 1, "y": 1}))
    _invalid(version, _raw({"op": "set-response-class", "decisionId": foreign["decision"], "responseClass": "RISKY",
                            "prohibitionReason": ""}))
    _invalid(version, _raw({"op": "set-persona-effect", "decisionId": foreign["decision"], "bond": 1, "activation": None}))
    _invalid(version, _raw({"op": "mark-milestone", "decisionId": foreign["decision"], "milestoneKey": ids["milestone"]}))
    _invalid(version, _raw({"op": "set-intensity", "nodeId": nodo_ajeno, "intensity": "LOW", "warningMessage": ""}))
    _invalid(version, _raw(_line(str(ids["node"]), foreign["character"])))


@pytest.mark.parametrize("mala", ["NEUTRAL", "feliz", "", None, 3])
def test_una_clase_fuera_de_las_cuatro_es_invalida(version, ids, mala):
    _invalid(version, _raw(_response(str(ids["node"]), responseClass=mala)))
    _invalid(version, _raw({"op": "set-response-class", "decisionId": ids["decision"], "responseClass": mala,
                            "prohibitionReason": ""}))


@pytest.mark.parametrize("mala", ["furiosa", "", None, "Neutral"])
def test_una_expresion_fuera_de_las_seis_es_invalida(version, ids, mala):
    _invalid(version, _raw(_line(str(ids["node"]), ids["character"], expression=mala)))
    _invalid(version, _raw({"op": "place-character", "mapId": ids["map"], "characterId": ids["character"], "x": 1,
                            "y": 1, "expression": mala}))


@pytest.mark.parametrize("cuando", [
    {"kind": "metric", "metric": "confianza"},
    {"kind": "milestone", "milestone": "hito_que_el_caso_no_declara"},
    {"kind": "count", "responseClass": "CRITICAL", "comparator": "gte", "value": 1},
    {"kind": "count", "responseClass": "RISKY", "comparator": "mayor", "value": 1},
    {"kind": "persona", "bond": "FELIZ", "activation": None},
    {"kind": "persona", "bond": None, "activation": None},
    {"kind": "all", "items": []},
    {"kind": "not", "item": {"kind": "all", "items": []}},
    "siempre",
])
def test_un_final_con_condicion_fuera_del_vocabulario_es_invalido(version, cuando):
    texto = cuando if isinstance(cuando, str) else json.dumps(cuando)
    _invalid(version, _raw(_ending(when=texto)))


def test_un_final_exige_clave_unica_y_respeta_el_tope(version, monkeypatch):
    _invalid(version, _raw(_ending(key="dos"), _ending(key="dos")))
    _invalid(version, _raw(_ending(key="con espacios")))
    _invalid(version, _raw(_ending(key="final_base")))
    monkeypatch.setattr(propuestas, "MAX_FINALES", 2)
    _invalid(version, _raw(_ending(key="uno"), _ending(key="dos")))


def test_las_referencias_numericas_inventadas_o_fuera_de_rango_son_invalidas(version, ids):
    _invalid(version, _raw({"op": "place-character", "mapId": 987654321, "characterId": ids["character"], "x": 1,
                            "y": 1, "expression": "neutral"}))
    _invalid(version, _raw({"op": "move", "objectId": 987654321, "x": 1, "y": 1}))
    _invalid(version, _raw({"op": "move", "objectId": ids["object"], "x": -5, "y": 1}))
    _invalid(version, _raw({"op": "move", "objectId": ids["object"], "x": 801, "y": 1}))
    _invalid(version, _raw({"op": "mark-milestone", "decisionId": ids["decision"], "milestoneKey": "inventado"}))
    _invalid(version, _raw({"op": "mark-milestone", "decisionId": 987654321, "milestoneKey": ids["milestone"]}))


@pytest.mark.parametrize("persona", [(2, None), (None, -2), (None, None), ("1", None), (True, None), (0.5, None)])
def test_el_efecto_en_la_persona_respeta_el_rango(version, ids, persona):
    _invalid(version, _raw({"op": "set-persona-effect", "decisionId": ids["decision"], "bond": persona[0],
                            "activation": persona[1]}))


def test_una_contraindicada_exige_razon_y_solo_ella_la_lleva(version, ids):
    nodo = str(ids["node"])
    _invalid(version, _raw(_response(nodo, responseClass="CONTRAINDICATED", prohibitionReason="  ")))
    _invalid(version, _raw({"op": "set-response-class", "decisionId": ids["decision"], "responseClass": "CONTRAINDICATED",
                            "prohibitionReason": ""}))
    _invalid(version, _raw(_response(nodo, responseClass="RISKY", prohibitionReason="No debía traer razón.")))


def test_la_ia_no_rebaja_una_respuesta_contraindicada_que_dejo_una_persona(version, ids):
    _invalid(version, _raw({"op": "set-response-class", "decisionId": ids["contraindicada"], "responseClass": "ACCEPTABLE",
                            "prohibitionReason": ""}))


def test_una_escena_de_intensidad_alta_necesita_su_aviso(version, ids):
    _invalid(version, _raw(_scene(intensity="HIGH")))
    assert propuestas.validar(version, _raw(_scene(intensity="HIGH", warningMessage="Contenido sensible."))).cambios
    _invalid(version, _raw({"op": "set-intensity", "nodeId": str(ids["node"]), "intensity": "HIGH", "warningMessage": ""}))


def test_mas_de_doce_cambios_es_invalido(version, ids):
    mover = [{"op": "move", "objectId": ids["object"], "x": 1, "y": 1}] * 12
    assert len(propuestas.validar(version, _raw(*mover)).cambios) == 12
    _invalid(version, _raw(*mover, mover[0]))


def test_la_validacion_es_atomica(version, ids):
    bueno = {"op": "move", "objectId": ids["object"], "x": 1, "y": 1}
    _invalid(version, _raw(bueno, bueno, {"op": "move", "objectId": 987654321, "x": 1, "y": 1}, bueno))


@pytest.mark.parametrize("raw", [None, [], "x", {}, {"message": "a"}, {"changes": []}, {"message": 3, "changes": []},
                                 {"message": "a", "changes": "no"}, {"message": "a", "changes": [3]},
                                 {"message": "a", "changes": [{"op": "borrar-todo"}]},
                                 {"message": "a", "changes": [], "extra": 1}])
def test_una_forma_rota_es_invalida(version, raw):
    _invalid(version, raw)


def test_un_campo_de_mas_o_de_menos_en_un_cambio_es_invalido(version, ids):
    mover = {"op": "move", "objectId": ids["object"], "x": 1, "y": 1}
    _invalid(version, _raw({**mover, "borrar": True}))
    _invalid(version, _raw({"op": "move", "objectId": ids["object"], "x": 1}))
    _invalid(version, _raw({**mover, "x": 1.5}))
    _invalid(version, _raw({**mover, "x": True}))


# ─── filtro de contenido ────────────────────────────────────────────────────────────────
def test_check_text_normaliza_acentos_y_mayusculas():
    assert prompts.check_text("Él describió cómo la golpeó, con SANGRE a borbotones.")
    assert prompts.check_text("Todo va bien, hablemos con calma.") is None
    assert prompts.check_text("¿Por qué no denunciaste antes?") is not None
    assert prompts.check_text("¿Por qué no denunciaste antes?", allow_revictimizing=True) is None
    assert prompts.check_text("sangre a borbotones", allow_revictimizing=True) is not None


def test_vuelve_con_el_grupo_no_es_revictimizante_pero_vuelve_con_el_agresor_si(version, ids):
    ok = propuestas.validar(version, _raw(_response(str(ids["node"]), text="Vuelve con el grupo cuando te sientas lista.")))
    assert ok.cambios[0]["responseClass"] == "RECOMMENDED"
    for inocente in ("Vuelve con el médico mañana.", "Vuelve con el docente si lo necesitas."):
        assert prompts.check_text(inocente) is None
    for danino in ("Vuelve con el agresor.", "Mejor vuelve con tu pareja.", "Regresa con el agresor, es lo mejor."):
        assert prompts.check_text(danino) == prompts.REVICTIMIZING_REASON


def test_los_caracteres_invisibles_no_burlan_el_filtro():
    assert prompts.check_text("había san​gre a borbotones") == prompts.GRAPHIC_REASON
    assert prompts.check_text("sangre­ a borbotones") == prompts.GRAPHIC_REASON
    assert prompts.check_text("¿por qué no⁠ denunciaste?") == prompts.REVICTIMIZING_REASON


def test_el_prompt_de_sistema_no_supone_genero_de_quien_escribe():
    assert "programadora" not in prompts.SYSTEM_AUTHORING


def test_todo_motivo_literal_del_validador_esta_en_la_lista_de_motivos_fijos():
    fuente = Path(propuestas.__file__).read_text(encoding="utf-8")
    literales = re.findall(r'self\.fail\("([^"{]+)"\)', fuente)
    assert len(literales) >= 15
    for literal in literales:
        assert literal in propuestas.MOTIVOS_FIJOS, literal


def test_las_listas_de_marcadores_estan_normalizadas_y_son_suficientes():
    for marcadores in (prompts.GRAPHIC_MARKERS, prompts.REVICTIMIZING_MARKERS):
        assert len(marcadores) >= 14
        for marcador in marcadores:
            assert marcador == prompts.normalize(marcador), marcador


def test_lo_grafico_se_rechaza_en_cualquier_texto_de_cualquier_operacion(version, ids):
    grafico = "Había sangre a borbotones."
    nodo = str(ids["node"])
    _invalid(version, _raw(_line(nodo, ids["character"], text=grafico)))
    _invalid(version, _raw(_response(nodo, feedbackText=grafico)))
    _invalid(version, _raw(_scene(narrative=grafico)))
    _invalid(version, _raw(_ending(message=grafico)))
    _invalid(version, _raw(_response(nodo, text=grafico, responseClass="CONTRAINDICATED", prohibitionReason="Es explícito.")))
    _invalid(version, _raw(message=grafico))


def test_lo_revictimizante_solo_sale_como_contraindicada_con_razon(version, ids):
    texto = "¿Y por qué no denunciaste antes?"
    nodo = str(ids["node"])
    for clase in ("RECOMMENDED", "ACCEPTABLE", "RISKY"):
        _invalid(version, _raw(_response(nodo, text=texto, responseClass=clase)))
    _invalid(version, _raw(_response(nodo, text=texto, responseClass="CONTRAINDICATED", prohibitionReason=" ")))
    ok = propuestas.validar(version, _raw(_response(nodo, text=texto, responseClass="CONTRAINDICATED",
                                                    prohibitionReason="Culpa a la persona.")))
    assert ok.cambios[0]["responseClass"] == "CONTRAINDICATED"
    assert prompts.check_text(texto) == prompts.REVICTIMIZING_REASON


# ─── proponer: lo que viaja al proveedor ────────────────────────────────────────────────
@pytest.fixture
def proveedor(monkeypatch, settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"
    visto = {"llamadas": 0}
    respuesta = {"valor": json.dumps(_raw(message="Listo."))}

    def responder(self, instrucciones, mensajes, **kwargs):
        visto.update(llamadas=visto["llamadas"] + 1, instrucciones=instrucciones, mensajes=mensajes, kwargs=kwargs,
                     modelo=self.modelo)
        return respuesta["valor"]

    monkeypatch.setattr(ProveedorFalso, "responder", responder)
    visto["respuesta"] = respuesta
    return visto


def _proponer(version, **cambios):
    config = config_del_asistente.actual()
    if cambios:
        config = type(config)(**{**config.__dict__, **cambios})
    return propuestas.proponer(config=config, version=version, peticion="Agrega una escena", pantalla="editor-mapa",
                               seleccion={"tipo": "objeto"})


def test_proponer_usa_el_modelo_capaz_y_devuelve_el_contrato(version, proveedor):
    resultado = _proponer(version, model_capable="claude-opus-9-9")

    assert resultado == {"mensaje": "Listo.", "cambios": [], "modo": "connected", "model": "claude-opus-9-9", "changes": 0}
    assert proveedor["modelo"] == "claude-opus-9-9"
    assert proveedor["kwargs"]["max_tokens"] == 8000 and proveedor["kwargs"]["tiempo"] == 60
    assert proveedor["instrucciones"].startswith(prompts.MARCA_PROPONER)
    assert prompts.SYSTEM_AUTHORING in proveedor["instrucciones"]
    assert json.dumps(esquema.PROPUESTA, ensure_ascii=False) in proveedor["instrucciones"]


def test_el_proveedor_recibe_la_peticion_y_el_caso_sin_correos_ni_numeros_largos(version, caso, proveedor):
    caso["inicio"].narrative = "Escríbele a ana.perez@correo.co o al 300 123 4567."
    caso["inicio"].save()

    propuestas.proponer(config=config_del_asistente.actual(), version=version, peticion="Revisa el caso, cédula 1094123456",
                        pantalla="editor-mapa", seleccion=None)

    (mensaje,) = proveedor["mensajes"]
    enviado = mensaje["content"]
    assert "Ana" in enviado and "Revisa el caso" in enviado
    for dato in ("ana.perez@correo.co", "4567", "1094123456"):
        assert dato not in enviado
    for prohibido in ("asistente0@example.test", "attempt"):
        assert prohibido not in enviado


def test_una_propuesta_que_no_pasa_la_validacion_no_se_devuelve(version, ids, proveedor):
    proveedor["respuesta"]["valor"] = json.dumps(_raw(_line("987654321", ids["character"])))

    with pytest.raises(propuestas.PropuestaInvalida):
        _proponer(version)


@pytest.mark.parametrize("texto", ["no es json", "", "[1, 2]"])
def test_una_respuesta_que_no_es_un_objeto_json_es_malformada(version, proveedor, texto):
    proveedor["respuesta"]["valor"] = texto

    with pytest.raises((errores.ErrorDeProveedor, propuestas.PropuestaInvalida)) as caught:
        _proponer(version)

    assert getattr(caught.value, "tipo", "malformed") == "malformed"


def test_la_respuesta_con_cercas_de_codigo_se_lee(version, proveedor):
    proveedor["respuesta"]["valor"] = "```json\n" + json.dumps(_raw(message="Con cercas.")) + "\n```"

    assert _proponer(version)["mensaje"] == "Con cercas."


def test_sin_proveedor_configurado_es_error_http_sin_llamar(version, proveedor, settings):
    settings.AI_AUTHORING_PROVIDER = "anthropic"
    settings.AI_AUTHORING_API_KEY = ""

    with pytest.raises(errores.ErrorDeProveedor) as caught:
        _proponer(version)

    assert caught.value.tipo == "http" and proveedor["llamadas"] == 0


def test_el_proveedor_falso_propone_una_escena_valida_de_punta_a_punta(version, settings):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "falso"

    resultado = _proponer(version)

    assert resultado["changes"] == 1 and resultado["cambios"][0]["op"] == "add-scene"
    assert resultado["cambios"][0]["aiSuggested"] is True

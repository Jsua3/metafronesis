"""Disponibilidad y comentarios según los hechos de exploración del intento."""
import json
from collections import Counter

from apps.simulation.casedef import conditions
from apps.simulation.models import AttemptWorldState, MapObject, SceneMap
from apps.simulation.models.attempt import REGISTERED_DECISION_EVENT_TYPES

EXPRESIONES = ("neutral", "alegre", "preocupada", "triste", "cautelosa", "en-crisis")
GESTOS = ("se-acerca", "asiente", "se-aparta", "baja-la-mirada", "se-agita")


def _leer(texto, defecto):
    try:
        return json.loads(texto)
    except (TypeError, ValueError):
        return defecto


leer_json = _leer


def sala_clave(mapa):
    """La clave de sala del mapa: ``salaId`` del ambiente o, sin ella, la clave del mapa."""
    ambiente = _leer(mapa.ambient_json, {})
    sala = ambiente.get("salaId") if isinstance(ambiente, dict) else None
    return sala if isinstance(sala, str) and sala.strip() else mapa.map_key


def registrar(estado, tipo, clave):
    """Conserva los hechos por sala y la exploración de intentos anteriores."""
    flags = dict(estado.flags)
    salas = flags.get("exploredBySala")
    if not isinstance(salas, dict):
        salas = {}
        flags["exploredBeforeSala"] = {"talked": flags.get("viewedNpcKeys", []), "inspected": estado.inspected_object_keys}
    sala = sala_clave(estado.scene_map)
    entrada = dict(salas.get(sala, {}))
    entrada[tipo] = list(dict.fromkeys([*entrada.get(tipo, []), clave]))
    salas[sala] = entrada
    flags["exploredBySala"] = salas
    estado.flags = flags


def contexto(intento, estado):
    narrativo = intento.state_json if isinstance(intento.state_json, dict) else {}
    persona = narrativo.get("persona", {})
    persona = persona if isinstance(persona, dict) else {}
    def nivel(valor, valores):
        return valores[max(0, min(2, 1 + valor))] if type(valor) is int else valores[1]
    cuentas = Counter(opcion.lower() for opcion in intento.events.filter(event_type__in=REGISTERED_DECISION_EVENT_TYPES, decision_option__isnull=False).values_list("decision_option__response_class", flat=True))
    explorado = {"talked": [], "inspected": [], "has": [], "used": []}
    if estado:
        flags = estado.flags if isinstance(estado.flags, dict) else {}
        salas = flags.get("exploredBySala")
        if isinstance(salas, dict):
            mapa = estado.scene_map if estado.scene_map.node_id == intento.current_node_id else SceneMap.objects.filter(node_id=intento.current_node_id).first()
            sala = sala_clave(mapa) if mapa else ""
            entrada = salas.get(sala, {})
            anterior = flags.get("exploredBeforeSala", {})
            for tipo in ("talked", "inspected"):
                explorado[tipo] = list(entrada.get(tipo, [])) + list(anterior.get(tipo, []))
        else:
            explorado["talked"] = flags.get("viewedNpcKeys", [])
            explorado["inspected"] = estado.inspected_object_keys
        explorado["has"] = estado.inventory
        explorado["used"] = estado.used_tool_keys
    return {"milestones": narrativo.get("milestones", []), "counts": cuentas,
            "persona": {"bond": nivel(persona.get("bond", 0), ("WITHDRAWN", "GUARDED", "OPEN")),
                        "activation": nivel(persona.get("activation", 0), ("CALM", "TENSE", "CRISIS"))},
            "explored": explorado}


def opciones(intento, estado=None):
    if estado is None:
        estado = AttemptWorldState.objects.filter(attempt=intento).select_related("scene_map").first()
    disponibles = list(intento.current_node.options.order_by("id"))
    contexto_actual = contexto(intento, estado)
    ofrecidas = []
    for opcion in disponibles:
        requisito = _leer(opcion.requires_json, None)
        if requisito == {} or (conditions.is_valid(requisito, facts=True) and conditions.evaluate(requisito, contexto_actual)):
            ofrecidas.append(opcion)
    return ofrecidas or disponibles


def evaluar_comentarios(intento, estado):
    """Cada comentario bien formado de la escena con su motivo de retención; ``motivo`` es ``None`` si se dice ahora.

    Motivos: ``broken`` (la condición ``cuando`` no es válida), ``condition`` (no se cumple) y ``absent`` (se cumple, pero
    ningún personaje visible puede decirlo). ``posicion`` es el índice en la lista del documento; ``dto`` solo si se dice.
    """
    documentos = _leer(intento.current_node.comments_json, [])
    if not isinstance(documentos, list):
        return []
    contexto_actual = contexto(intento, estado)
    mapa_id = estado.scene_map_id if estado else None
    personas = list(MapObject.objects.filter(scene_map__case_version=intento.case_version, object_type="PERSON", visible=True, character__isnull=False).select_related("character", "scene_map").order_by("id"))
    resultado = []
    for posicion, comentario in enumerate(documentos):
        if not isinstance(comentario, dict) or not isinstance(comentario.get("personaje"), str) or not isinstance(comentario.get("linea"), str):
            continue
        condicion = comentario.get("cuando", {})
        evaluado = {"posicion": posicion, "comentario": comentario, "motivo": None, "dto": None}
        resultado.append(evaluado)
        if condicion != {}:
            if not conditions.is_valid(condicion, facts=True):
                evaluado["motivo"] = "broken"
                continue
            if not conditions.evaluate(condicion, contexto_actual):
                evaluado["motivo"] = "condition"
                continue
        candidatos = [persona for persona in personas if persona.character.character_key == comentario["personaje"] and (persona.scene_map_id == mapa_id or persona.scene_map.node_id == intento.current_node_id)]
        candidatos.sort(key=lambda persona: persona.scene_map_id != mapa_id)
        if not candidatos:
            evaluado["motivo"] = "absent"
            continue
        emocion, gesto = comentario.get("emocion"), comentario.get("gesto")
        evaluado["dto"] = {"id": f"{intento.current_node_id}-{posicion}", "objectKey": candidatos[0].object_key,
                           "line": comentario["linea"], "emotion": emocion if emocion in EXPRESIONES else None,
                           "gesture": gesto if gesto in GESTOS else None}
    return resultado


def comentarios(intento, estado):
    return [evaluado["dto"] for evaluado in evaluar_comentarios(intento, estado) if evaluado["dto"] is not None]


def reaccion(intento, opcion, mapa):
    """Resuelve la reacción autorada en el mapa donde se eligió la opción."""
    datos = _leer(opcion.reaction_json, {})
    if not isinstance(datos, dict) or not datos:
        return None
    personas = list(MapObject.objects.filter(scene_map__case_version=intento.case_version, object_type="PERSON", visible=True).select_related("character", "scene_map").order_by("id"))
    personaje = datos.get("personaje")
    if isinstance(personaje, str) and personaje:
        personas = [persona for persona in personas if persona.character_id and persona.character.character_key == personaje and (persona.scene_map_id == mapa or persona.scene_map.node_id == opcion.source_node_id)]
    else:
        personas = [persona for persona in personas if persona.decision_option_id == opcion.id or persona.dialoguetree_set.filter(choices__decision_option=opcion).exists()]
    personas.sort(key=lambda persona: (persona.scene_map_id != mapa, persona.scene_map.node_id != opcion.source_node_id, persona.id))
    linea = datos.get("linea") if isinstance(datos.get("linea"), str) else ""
    if not personas and not linea:
        return None
    emocion, gesto = datos.get("emocion"), datos.get("gesto")
    if gesto not in GESTOS:
        activacion = contexto(intento, None)["persona"]["activation"]
        gesto = {"RECOMMENDED": "se-acerca", "RISKY": "baja-la-mirada", "CONTRAINDICATED": "se-agita" if activacion == "CRISIS" else "se-aparta"}.get(opcion.response_class, "asiente")
    return {"line": linea, "emotion": emocion if emocion in EXPRESIONES else None,
            "gesture": gesto, "objectKey": personas[0].object_key if personas else None}

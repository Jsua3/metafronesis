"""Operaciones de autoría de salas, objetos y pistas."""
import json
import re
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from jsonschema import Draft202012Validator

from django.db import transaction
from django.db.models import Max
from django.http import Http404
from django.shortcuts import get_object_or_404

from apps.simulation.models import DecisionOption, SimulationNode
from apps.simulation.models.world import (
    DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH, CaseCharacter, CollisionZone, DialogueTree, MapObject, SceneHint, SceneMap,
)
from apps.simulation.services.audit_service import auditable
from shared.exceptions import ApiError
from shared.jsonutils import INT4_MAX, INT4_MIN, read_map, write_map
from .activos_mundo import recurso_permitido
from .mundo_serializers import ObjetoSerializer
from . import editor, geometria_salas, guardas, validacion_mundo

TAMANO_OBJETO = 48
CONTROL_TEXTO = re.compile(r"[\x00-\x1f\x7f]|<[^>]*>")


@lru_cache(maxsize=1)
def _esquema_estructura():
    return Draft202012Validator(json.loads(Path(__file__).with_name("estructura_sala.json").read_text(encoding="utf-8")))


@lru_cache(maxsize=1)
def _iconos():
    return frozenset(json.loads(Path(__file__).with_name("iconos.json").read_text(encoding="utf-8")))


def _error(mensaje):
    raise ApiError("VALIDATION_ERROR", mensaje, 400)


def _revision(usuario, version_id, datos):
    version = guardas.version_editable(usuario, version_id)
    guardas.exigir_revision(version, datos.get("revision"))
    return version


def _unica(modelo, instancia, mensaje, **filtros):
    if modelo.objects.filter(**filtros).exclude(pk=instancia.pk).exists():
        _error(mensaje)


def _mapa(version, mapa, datos):
    if datos.get("nodeId") is not None:
        mapa.node = get_object_or_404(SimulationNode, case_version=version, pk=datos["nodeId"])
    if not mapa.node_id:
        _error("La sala debe tener una escena.")
    mapa.map_key = datos["mapKey"]
    _unica(SceneMap, mapa, "Ya hay un mapa con esa clave en el caso.", case_version=version, map_key=mapa.map_key)
    _unica(SceneMap, mapa, "Ese nodo ya tiene un mapa.", node=mapa.node)
    mapa.title = datos["title"]
    mapa.width = datos.get("width") or DEFAULT_MAP_WIDTH
    mapa.height = datos.get("height") or DEFAULT_MAP_HEIGHT
    if mapa.width < 0:
        mapa.width = DEFAULT_MAP_WIDTH
    if mapa.height < 0:
        mapa.height = DEFAULT_MAP_HEIGHT
    mapa.theme = datos.get("theme") if datos.get("theme") is not None else "clinical-soft"
    mapa.spawn_x = datos.get("spawnX") or 0
    mapa.spawn_y = datos.get("spawnY") or 0
    mapa.save()


def _objeto(version, objeto, datos):
    objeto.object_key = datos["objectKey"]
    _unica(MapObject, objeto, "Ya hay un objeto con esa clave en este mapa.", scene_map=objeto.scene_map, object_key=objeto.object_key)
    for clave, campo in (("label", "label"), ("objectType", "object_type")):
        setattr(objeto, campo, datos[clave])
    for clave, campo in (("x", "position_x"), ("y", "position_y")):
        setattr(objeto, campo, datos.get(clave) or 0)
    for clave in ("width", "height"):
        setattr(objeto, clave, datos.get(clave) if (datos.get(clave) or 0) > 0 else TAMANO_OBJETO)
    icono = datos.get("icon")
    if icono and icono != objeto.icon and icono not in _iconos():
        _error("El icono no está en la lista de iconos disponibles.")
    for clave, campo, valor in (
        ("colorHex", "color_hex", "#4FA3A5"), ("icon", "icon", "psychology"),
        ("shortCode", "short_code", "ACT"), ("interactionPrompt", "interaction_prompt", ""),
        ("interactionText", "interaction_text", ""), ("toolCode", "tool_code", None),
    ):
        setattr(objeto, campo, datos.get(clave) if datos.get(clave) is not None else valor)
    objeto.collision = datos.get("collision", False)
    objeto.visible = datos.get("visible", False)
    if "aiSuggested" in datos:
        objeto.ai_suggested = datos["aiSuggested"]
    decision_id = datos.get("decisionOptionId")
    objeto.decision_option = get_object_or_404(DecisionOption, pk=decision_id, case_version=version) if decision_id is not None else None
    if "characterId" in datos:
        personaje_id = datos["characterId"]
        objeto.character = get_object_or_404(CaseCharacter, pk=personaje_id, case_version=version) if personaje_id is not None else None
    objeto.save()


def _pista(pista, datos):
    texto = datos["text"].strip()
    if not texto or CONTROL_TEXTO.search(texto):
        _error("La pista debe contener texto plano en una sola línea.")
    pista.text = texto
    if datos.get("hintOrder") is not None:
        pista.hint_order = datos["hintOrder"]
    elif not pista.pk:
        ultimo = SceneHint.objects.filter(scene_map=pista.scene_map).aggregate(ultimo=Max("hint_order"))["ultimo"]
        pista.hint_order = (ultimo or 0) + 1
    pista.save()


@transaction.atomic
def _operar(usuario, version_id, datos, tipo, operacion, elemento_id=None, mapa_id=None):
    version = _revision(usuario, version_id, datos)
    if tipo == "mapa":
        elemento = SceneMap(case_version=version) if operacion == "crear" else get_object_or_404(SceneMap, case_version=version, pk=elemento_id)
        aplicar = _mapa
    else:
        modelo = MapObject if tipo == "objeto" else SceneHint
        if operacion == "crear":
            mapa = get_object_or_404(SceneMap, case_version=version, pk=mapa_id)
            elemento = modelo(scene_map=mapa)
        else:
            elemento = get_object_or_404(modelo, scene_map__case_version=version, pk=elemento_id)
        aplicar = _objeto if tipo == "objeto" else _pista
    if operacion == "borrar":
        elemento.delete()
    elif tipo == "pista":
        aplicar(elemento, datos)
    else:
        aplicar(version, elemento, datos)
    guardas.tocar(version, usuario)
    return editor.editor(usuario, version_id)


@auditable("ADMIN_CREATE_MAP", "CASE_VERSION", resource_id_param_index=1)
def crear_mapa(usuario, version_id, datos):
    return _operar(usuario, version_id, datos, "mapa", "crear")


@auditable("ADMIN_UPDATE_MAP", "CASE_VERSION", resource_id_param_index=1)
def actualizar_mapa(usuario, version_id, datos, elemento_id):
    return _operar(usuario, version_id, datos, "mapa", "actualizar", elemento_id)


@auditable("ADMIN_DELETE_MAP", "CASE_VERSION", resource_id_param_index=1)
def borrar_mapa(usuario, version_id, datos, elemento_id):
    return _operar(usuario, version_id, datos, "mapa", "borrar", elemento_id)


@auditable("ADMIN_CREATE_OBJECT", "CASE_VERSION", resource_id_param_index=1)
def crear_objeto(usuario, version_id, datos, mapa_id):
    return _operar(usuario, version_id, datos, "objeto", "crear", mapa_id=mapa_id)


@auditable("ADMIN_UPDATE_OBJECT", "CASE_VERSION", resource_id_param_index=1)
def actualizar_objeto(usuario, version_id, datos, elemento_id):
    return _operar(usuario, version_id, datos, "objeto", "actualizar", elemento_id)


@auditable("ADMIN_DELETE_OBJECT", "CASE_VERSION", resource_id_param_index=1)
def borrar_objeto(usuario, version_id, datos, elemento_id):
    return _operar(usuario, version_id, datos, "objeto", "borrar", elemento_id)


@auditable("ADMIN_CREATE_HINT", "CASE_VERSION", resource_id_param_index=1)
def crear_pista(usuario, version_id, datos, mapa_id):
    return _operar(usuario, version_id, datos, "pista", "crear", mapa_id=mapa_id)


@auditable("ADMIN_UPDATE_HINT", "CASE_VERSION", resource_id_param_index=1)
def actualizar_pista(usuario, version_id, datos, elemento_id):
    return _operar(usuario, version_id, datos, "pista", "actualizar", elemento_id)


@auditable("ADMIN_DELETE_HINT", "CASE_VERSION", resource_id_param_index=1)
def borrar_pista(usuario, version_id, datos, elemento_id):
    return _operar(usuario, version_id, datos, "pista", "borrar", elemento_id)


def _entero_mundo(valor, nombre, defecto=0):
    if valor is None:
        return defecto
    if isinstance(valor, bool) or not isinstance(valor, int) or not INT4_MIN <= valor <= INT4_MAX:
        _error(f"El valor de {nombre} debe ser un entero válido.")
    return valor


def _definicion_mundo(version, mapa):
    objetos = list(MapObject.objects.filter(scene_map=mapa).order_by("id"))
    zonas = CollisionZone.objects.filter(scene_map=mapa).order_by("id")
    salida = next((objeto for objeto in objetos if objeto.object_type == "EXIT"), None)
    return {
        "schemaVersion": 2, "caseVersionId": version.pk, "revision": version.version, "nodeId": mapa.node_id,
        "map": {"id": mapa.pk, "key": mapa.map_key, "title": mapa.title, "width": mapa.width, "height": mapa.height, "theme": mapa.theme, "spawnX": mapa.spawn_x, "spawnY": mapa.spawn_y, "ambient": read_map(mapa.ambient_json), "structure": mapa.structure},
        "objects": [{"id": objeto.pk, "key": objeto.object_key, "label": objeto.label, "type": objeto.object_type, "x": objeto.position_x, "y": objeto.position_y, "width": objeto.width, "height": objeto.height, "zIndex": objeto.z_index, "facing": objeto.facing, "colorHex": objeto.color_hex, "icon": objeto.icon, "shortCode": objeto.short_code, "collision": objeto.collision, "visible": objeto.visible, "interactionPrompt": objeto.interaction_prompt, "interactionText": objeto.interaction_text, "decisionOptionId": objeto.decision_option_id, "characterId": objeto.character_id, "toolCode": objeto.tool_code, "unlockCondition": read_map(objeto.unlock_condition_json), "movementPattern": read_map(objeto.movement_pattern_json), "metadata": read_map(objeto.metadata_json), "aiSuggested": objeto.ai_suggested} for objeto in objetos],
        "collisionZones": [{"id": zona.pk, "key": zona.zone_key, "label": zona.label, "x": zona.position_x, "y": zona.position_y, "width": zona.width, "height": zona.height} for zona in zonas],
        "dialogues": [{"id": arbol.pk, "key": arbol.tree_key, "speakerName": arbol.speaker_name, "portraitKey": arbol.portrait_key, "emotion": arbol.emotion, "mapObjectId": arbol.map_object_id, "lines": [{"order": linea.display_order, "speakerName": linea.speaker_name, "text": linea.text, "emotion": linea.emotion, "aiSuggested": linea.ai_suggested} for linea in arbol.lines.all()], "choices": [{"key": opcion.choice_key, "text": opcion.text, "decisionOptionId": opcion.decision_option_id, "requiredToolCode": opcion.required_tool_code, "effect": read_map(opcion.effect_json), "displayOrder": opcion.display_order} for opcion in arbol.choices.all()]} for arbol in DialogueTree.objects.filter(scene_map=mapa).prefetch_related("lines", "choices").order_by("id")],
        "clinicalTools": [{"id": herramienta.pk, "code": herramienta.tool_code, "label": herramienta.label, "icon": herramienta.icon, "category": herramienta.category, "description": herramienta.description, "active": herramienta.active} for herramienta in version.clinical_tools.order_by("id")],
        "safeExit": {"configured": salida is not None, "exitObjectKey": salida.object_key if salida else None, "supportResources": []},
        "validation": validacion_mundo.validar(version),
        "availableDecisions": [{"id": decision.pk, "optionKey": decision.option_key, "text": decision.text, "responseClass": decision.response_class, "targetNodeKey": decision.target_node.node_key, "prohibitedConduct": decision.response_class == "CONTRAINDICATED"} for decision in version.decisions.filter(source_node=mapa.node).select_related("target_node").order_by("id")],
        "rooms": [{"nodeId": sala.node_id, "nodeKey": sala.node.node_key, "mapKey": sala.map_key, "title": sala.title} for sala in version.scene_maps.select_related("node").order_by("id")],
    }


def _guardar_zonas(mapa, zonas):
    claves = [zona["key"] for zona in zonas]
    if len(claves) != len(set(claves)):
        _error("Cada zona de colisión debe tener una clave única.")
    existentes = list(CollisionZone.objects.filter(scene_map=mapa))
    por_id = {zona.pk: zona for zona in existentes}
    por_clave = {zona.zone_key: zona for zona in existentes}
    reclamados = {zona["id"] for zona in zonas if zona.get("id") in por_id}
    elegidas = []
    for datos in zonas:
        zona = por_id.get(datos.get("id"))
        if zona is None:
            candidata = por_clave.get(datos["key"])
            zona = candidata if candidata and candidata.pk not in reclamados else None
        zona = zona or CollisionZone(scene_map=mapa)
        if zona.pk and zona.pk in [elemento.pk for elemento in elegidas]:
            _error("Una zona de colisión aparece más de una vez.")
        zona.zone_key = datos["key"]
        zona.label = datos.get("label")
        zona.position_x, zona.position_y = datos["x"], datos["y"]
        zona.width, zona.height = max(datos["width"], 1), max(datos["height"], 1)
        elegidas.append(zona)
    # Se liberan las claves antes de renombrar, conservando las filas reclamadas.
    CollisionZone.objects.filter(scene_map=mapa).exclude(pk__in=[zona.pk for zona in elegidas if zona.pk]).delete()
    for zona in elegidas:
        if zona.pk:
            CollisionZone.objects.filter(pk=zona.pk).update(zone_key=f"__temporal_{uuid4().hex}")
    for zona in elegidas:
        zona.save()


@auditable("ADMIN_SAVE_WORLD", "CASE_VERSION", resource_id_param_index=1)
@transaction.atomic
def guardar_mundo(usuario, version_id, datos, nodo_id):
    version = _revision(usuario, version_id, datos)
    if "dialogues" in datos:
        _error("El guardado de di?logos todav?a no est? disponible.")
    mapa = _buscar_mapa(version, nodo_id)
    definicion = datos.get("map")
    if definicion is not None:
        ambiente = definicion.get("ambient")
        if ambiente is not None:
            if not isinstance(ambiente, dict) or not recurso_permitido(ambiente.get("backgroundImage")):
                _error("El fondo de la sala no es un recurso permitido.")
            mapa.ambient_json = write_map(ambiente)
        for clave, campo in (("width", "width"), ("height", "height"), ("spawnX", "spawn_x"), ("spawnY", "spawn_y")):
            if clave in definicion:
                valor = _entero_mundo(definicion[clave], f"map.{clave}")
                if valor > 0 or (clave in ("spawnX", "spawnY") and valor == 0):
                    setattr(mapa, campo, valor)
        if "theme" in definicion:
            tema = definicion["theme"]
            if not isinstance(tema, str) or len(tema) > 100:
                _error("El tema de la sala no es válido.")
            mapa.theme = tema
        if "structure" in definicion:
            estructura = definicion["structure"]
            if estructura is not None:
                if not _esquema_estructura().is_valid(estructura):
                    _error("La estructura de la sala no es v?lida.")
                piezas = estructura.get("piezas", [])
                identificadores = [pieza["id"] for pieza in piezas]
                if len(identificadores) != len(set(identificadores)):
                    _error("Los identificadores de las piezas deben ser ?nicos.")
            mapa.structure = estructura
        mapa.save()
    if "collisionZones" in datos:
        _guardar_zonas(mapa, datos["collisionZones"])
    if "objects" in datos:
        _guardar_objetos_mundo(version, mapa, datos["objects"])
    geometria_salas.recalcular(version)
    mapa.refresh_from_db()
    guardas.tocar(version, usuario)
    return _definicion_mundo(version, mapa)


def _guardar_objetos_mundo(version, mapa, objetos):
    claves = [objeto.get("key") for objeto in objetos]
    if any(not isinstance(clave, str) or not clave for clave in claves) or len(claves) != len(set(claves)):
        _error("Cada objeto debe tener una clave única.")
    existentes = list(MapObject.objects.filter(scene_map=mapa))
    por_id = {objeto.pk: objeto for objeto in existentes}
    por_clave = {objeto.object_key: objeto for objeto in existentes}
    for objeto in objetos:
        if objeto.get("id") is not None:
            _entero_mundo(objeto["id"], "objects.id")
    reclamados = {objeto.get("id") for objeto in objetos if objeto.get("id") in por_id}
    preparados = []
    for datos in objetos:
        identificador = datos.get("id")
        if identificador is not None:
            _entero_mundo(identificador, "objects.id")
        objeto = por_id.get(identificador)
        if objeto is None:
            candidata = por_clave.get(datos["key"])
            objeto = candidata if candidata and candidata.pk not in reclamados else None
        objeto = objeto or MapObject(scene_map=mapa)
        if objeto.pk and any(anterior.pk == objeto.pk for anterior, _, _ in preparados):
            _error("Un objeto aparece más de una vez.")
        solicitud = {**datos, "objectKey": datos["key"], "objectType": datos.get("type")}
        serializador = ObjetoSerializer(data=solicitud)
        serializador.is_valid(raise_exception=True)
        preparados.append((objeto, serializador.validated_data, datos))
    MapObject.objects.filter(scene_map=mapa).exclude(pk__in=[objeto.pk for objeto, _, _ in preparados if objeto.pk]).delete()
    for objeto, _, _ in preparados:
        if objeto.pk:
            MapObject.objects.filter(pk=objeto.pk).update(object_key=f"__temporal_{uuid4().hex}")
    for objeto, solicitud, datos in preparados:
        _objeto(version, objeto, solicitud)
        objeto.z_index = _entero_mundo(datos.get("zIndex"), "objects.zIndex")
        objeto.facing = datos.get("facing") or "down"
        if objeto.facing not in ("up", "down", "left", "right"):
            _error("La orientación del objeto no es válida.")
        for clave, campo in (("unlockCondition", "unlock_condition_json"), ("movementPattern", "movement_pattern_json"), ("metadata", "metadata_json")):
            valor = datos.get(clave) or {}
            if not isinstance(valor, dict):
                _error(f"El campo {clave} debe ser un objeto.")
            setattr(objeto, campo, write_map(valor))
        objeto.save()


def _buscar_mapa(version, nodo_id):
    mapas = SceneMap.objects.filter(case_version=version).order_by("id")
    if nodo_id is not None:
        try:
            nodo_id = int(nodo_id)
        except (TypeError, ValueError):
            _error("El identificador de la escena debe ser un entero.")
        mapas = mapas.filter(node_id=nodo_id)
    mapa = mapas.first()
    if mapa is None:
        raise Http404
    return mapa


def leer_mundo(usuario, version_id, nodo_id):
    version = editor.version_visible(usuario, version_id)
    return _definicion_mundo(version, _buscar_mapa(version, nodo_id))

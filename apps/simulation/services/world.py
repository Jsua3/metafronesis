"""Lectura y desplazamiento del mundo de un intento."""

import json
import math
import ipaddress
import re
from collections import deque
from urllib.parse import urlsplit

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from shared.idempotency import normalize_request_id

from apps.simulation.models import AttemptEvent, AttemptWorldState, ClinicalTool, DecisionOption, MapObject, SceneMap
from apps.simulation.models.world import DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH
from . import attempt_api, attempt_duration, world_layout, disponibilidad_mundo
from .attempt_lock import lock_attempt_row

# Caja de choque del jugador, igual que en el cliente: ancho y alto en píxeles, anclada en los pies.
ANCHO_JUGADOR, ALTO_JUGADOR = 22, 16
# Desplazamiento plausible entre dos sincronizaciones: margen fijo más velocidad máxima por segundo,
# con un tope de segundos para que una pausa larga no autorice cualquier salto.
DESPLAZAMIENTO_BASE, VELOCIDAD_MAXIMA, SEGUNDOS_MAXIMOS = 240, 300, 30
# Distancia máxima a la que el jugador puede cruzar una puerta.
ALCANCE_PUERTA = 120


def _mapa_json(valor):
    try:
        resultado = json.loads(valor or "{}")
    except (TypeError, ValueError):
        return {}
    return resultado if isinstance(resultado, dict) else {}


def _estado(intento):
    estado = AttemptWorldState.objects.filter(attempt=intento).select_related("scene_map").first()
    if estado is not None and estado.synced_node_id == intento.current_node_id:
        return estado
    mapa = SceneMap.objects.filter(node_id=intento.current_node_id, case_version_id=intento.case_version_id).first()
    if mapa is None:
        if estado is not None:
            return estado
        raise NotFound("La escena no tiene mapa configurado.")
    if estado is None:
        estado = AttemptWorldState(attempt=intento)
    estado.scene_map = mapa
    estado.synced_node_id = intento.current_node_id
    estado.player_x, estado.player_y = mapa.spawn_x, mapa.spawn_y
    estado.flags = {**estado.flags, "positionSyncedAt": (intento.last_activity_at or intento.started_at).timestamp()}
    estado.save()
    return estado


def _dialogo(objeto):
    arbol = objeto.dialoguetree_set.order_by("id").first()
    if arbol is None:
        return None
    return {"key": arbol.tree_key, "speakerName": arbol.speaker_name, "portraitKey": arbol.portrait_key,
            "emotion": arbol.emotion,
            "lines": [{"order": linea.display_order, "speakerName": linea.speaker_name,
                       "text": linea.text, "emotion": linea.emotion} for linea in arbol.lines.order_by("display_order")],
            "choices": [{"key": opcion.choice_key, "text": opcion.text, "decisionOptionId": opcion.decision_option_id,
                         "requiredToolCode": opcion.required_tool_code, "effect": _mapa_json(opcion.effect_json)}
                        for opcion in arbol.choices.order_by("display_order")]}


def _objeto(objeto):
    return {
        "key": objeto.object_key, "label": objeto.label, "type": objeto.object_type,
        "x": objeto.position_x, "y": objeto.position_y, "width": objeto.width, "height": objeto.height,
        "color": objeto.color_hex, "icon": objeto.icon, "shortCode": objeto.short_code,
        "collision": objeto.collision, "interactionPrompt": objeto.interaction_prompt,
        "interactionText": objeto.interaction_text, "decisionOptionId": objeto.decision_option_id,
        "toolCode": objeto.tool_code, "dialogue": _dialogo(objeto), "movementPattern": _mapa_json(objeto.movement_pattern_json),
        "facing": objeto.facing, "metadata": _mapa_json(objeto.metadata_json),
    }


def _recurso_permitido(valor):
    if not isinstance(valor, str) or len(valor) > 300 or re.search(r"[\x00-\x1f\x7f\\]|%(?:2e|2f|5c)", valor, re.I):
        return False
    if valor.startswith("/assets/"):
        return ".." not in valor and "//" not in valor
    try:
        partes = urlsplit(valor)
        if partes.scheme != "https" or not partes.hostname or partes.username or partes.password or partes.port or partes.path in ("", "/"):
            return False
        try:
            ipaddress.ip_address(partes.hostname)
            return False
        except ValueError:
            return partes.hostname.lower() in {host.lower() for host in getattr(settings, "SIEP_ALLOWED_ASSET_HOSTS", [])}
    except ValueError:
        return False


def _mundo(intento, estado):
    mapa = estado.scene_map
    ambiente = _mapa_json(mapa.ambient_json)
    if isinstance(mapa.structure, dict) or (ambiente.get("backgroundImage") and not _recurso_permitido(ambiente["backgroundImage"])):
        ambiente.pop("backgroundImage", None)
    objetos = mapa.map_objects.filter(visible=True).order_by("id")
    activo = intento.status == "IN_PROGRESS" and not intento.current_node.terminal_node
    opciones = disponibilidad_mundo.opciones(intento, estado) if activo else []
    comentarios = disponibilidad_mundo.comentarios(intento, estado) if activo else []
    return {
        "attemptId": str(intento.pk), "status": intento.status,
        "map": {"id": mapa.id, "key": mapa.map_key, "title": mapa.title, "width": mapa.width,
                "height": mapa.height, "theme": mapa.theme, "spawnX": mapa.spawn_x,
                "spawnY": mapa.spawn_y, "ambient": ambiente,
                "structure": mapa.structure if isinstance(mapa.structure, dict) else None},
        "player": {"x": estado.player_x, "y": estado.player_y},
        "objects": [_objeto(objeto) for objeto in objetos if not (
            objeto.object_type == "TOOL" and objeto.tool_code and objeto.tool_code in estado.inventory)],
        "collisions": [{"key": zona.zone_key, "label": zona.label, "x": zona.position_x,
                        "y": zona.position_y, "width": zona.width, "height": zona.height}
                       for zona in mapa.collision_zones.order_by("id")],
        "tools": [{"code": herramienta.tool_code, "label": herramienta.label, "icon": herramienta.icon,
                   "category": herramienta.category, "description": herramienta.description, "active": herramienta.active}
                  for herramienta in ClinicalTool.objects.filter(case_version_id=intento.case_version_id, active=True).order_by("id")],
        "inventory": estado.inventory, "inspectedObjectKeys": estado.inspected_object_keys,
        "viewedDialogueKeys": estado.viewed_dialogue_keys, "usedToolKeys": estado.used_tool_keys,
        "flags": {clave: estado.flags[clave] for clave in ("viewedNpcKeys",) if clave in estado.flags},
        "decisionOptions": [{"id": opcion.id, "text": opcion.text} for opcion in opciones], "comments": comentarios, "layout": world_layout.construir(intento, mapa),
    }


def _acuse(intento, estado):
    return {"attemptId": str(intento.pk), "status": intento.status, "map": {"key": estado.scene_map.map_key},
            "player": {"x": estado.player_x, "y": estado.player_y}}


def _activo(intento):
    if intento.status != "IN_PROGRESS":
        raise ValidationError("El intento ya no acepta interacciones en el mundo.")


def _ejecutar(usuario, identificador, operacion):
    with transaction.atomic():
        lock_attempt_row(identificador)
        intento = attempt_api.owned(usuario, identificador, lock=True)
        resultado = None if intento._time_expired else operacion(intento)
    attempt_api._error_si_vencido(intento)
    return resultado


def leer(usuario, identificador):
    return _ejecutar(usuario, identificador, lambda intento: _mundo(intento, _estado(intento)))


def progreso(usuario, identificador):
    def construir(intento):
        nodos = list(intento.case_version.nodes.order_by("id"))
        por_id = {nodo.id: nodo for nodo in nodos}
        vecinos = {nodo.id: [] for nodo in nodos}
        for origen, destino in DecisionOption.objects.filter(case_version_id=intento.case_version_id).order_by("id").values_list("source_node_id", "target_node_id"):
            if origen in vecinos and destino in por_id:
                vecinos[origen].append(destino)
        cola = deque(nodo.id for nodo in nodos if nodo.start_node)
        ordenados, vistos = [], set()
        while cola:
            nodo_id = cola.popleft()
            if nodo_id in vistos:
                continue
            vistos.add(nodo_id)
            ordenados.append(por_id[nodo_id])
            cola.extend(vecinos[nodo_id])
        ordenados.extend(nodo for nodo in nodos if nodo.id not in vistos)
        visitados = list(dict.fromkeys(intento.events.filter(
            event_type__in=["NODE_ENTERED", "ATTEMPT_STARTED", "DECISION_SELECTED", "DECISION_CHANGED", "PROHIBITED_DECISION_SELECTED"],
            node__isnull=False).order_by("occurred_at", "id").values_list("node__node_key", flat=True)))
        if intento.current_node.node_key not in visitados:
            visitados.append(intento.current_node.node_key)
        return {"nodes": [{"key": nodo.node_key, "label": nodo.title.strip() or "Nodo",
                           "start": nodo.start_node, "terminal": nodo.terminal_node} for nodo in ordenados],
                "visitedNodeKeys": visitados, "currentNodeKey": intento.current_node.node_key}
    return _ejecutar(usuario, identificador, construir)


def _entero(valor, nombre):
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or abs(valor) > 1000000 or not math.isfinite(valor):
        raise ValidationError(f"{nombre} debe ser un número finito válido.")
    return int(valor)


def _interseca(rectangulo, obstaculo):
    posicion_x, posicion_y, ancho, alto = rectangulo
    return (posicion_x < obstaculo.position_x + obstaculo.width and posicion_x + ancho > obstaculo.position_x
            and posicion_y < obstaculo.position_y + obstaculo.height and posicion_y + alto > obstaculo.position_y)


def mover(usuario, identificador, datos):
    def ejecutar(intento):
        _activo(intento)
        estado = _estado(intento)
        clave = datos.get("currentMapKey")
        if not isinstance(clave, str) or not clave.strip():
            raise ValidationError("currentMapKey es obligatorio.")
        if clave != estado.scene_map.map_key:
            return _mundo(intento, estado)
        posicion_x = _entero(datos.get("playerX"), "playerX")
        posicion_y = _entero(datos.get("playerY"), "playerY")
        rectangulo = (posicion_x - ANCHO_JUGADOR // 2, posicion_y - ALTO_JUGADOR, ANCHO_JUGADOR, ALTO_JUGADOR)
        ancho, alto = estado.scene_map.width or DEFAULT_MAP_WIDTH, estado.scene_map.height or DEFAULT_MAP_HEIGHT
        if rectangulo[0] < 0 or rectangulo[1] < 0 or rectangulo[0] + ANCHO_JUGADOR > ancho or rectangulo[1] + ALTO_JUGADOR > alto:
            raise ValidationError("La posición está fuera de los límites del mapa.")
        marca = estado.flags.get("positionSyncedAt")
        ahora = timezone.now().timestamp()
        if isinstance(marca, (int, float)) and math.hypot(posicion_x - estado.player_x, posicion_y - estado.player_y) > DESPLAZAMIENTO_BASE + VELOCIDAD_MAXIMA * min(max(ahora - marca, 0), SEGUNDOS_MAXIMOS):
            raise ValidationError("Desplazamiento no plausible para el tiempo transcurrido.")
        obstaculos = list(estado.scene_map.collision_zones.all()) + [objeto for objeto in estado.scene_map.map_objects.filter(collision=True, visible=True)
                        if not (objeto.object_type == "TOOL" and objeto.tool_code in estado.inventory)]
        if any(_interseca(rectangulo, obstaculo) for obstaculo in obstaculos):
            raise ValidationError("La posición cae dentro de un obstáculo del mapa.")
        estado.player_x, estado.player_y = posicion_x, posicion_y
        estado.flags = {**estado.flags, "positionSyncedAt": ahora}
        estado.save(update_fields=["player_x", "player_y", "flags", "updated_at"])
        attempt_duration.record_activity(intento)
        return _acuse(intento, estado)
    return _ejecutar(usuario, identificador, ejecutar)


def entrar(usuario, identificador, datos):
    def ejecutar(intento):
        clave, puerta_clave = datos.get("targetNodeKey"), datos.get("doorKey")
        solicitud = normalize_request_id(datos.get("requestId"))
        if solicitud:
            anterior = intento.events.filter(request_id=solicitud).first()
            if anterior:
                if anterior.event_type != "ROOM_ENTERED" or anterior.detail != f"Puerta hacia sala {clave}":
                    raise ValidationError("requestId ya corresponde a otra acción.")
                return _mundo(intento, _estado(intento))
        _activo(intento)
        if not isinstance(clave, str) or not clave.strip():
            raise ValidationError("targetNodeKey es obligatorio.")
        if not isinstance(puerta_clave, str) or not puerta_clave.strip():
            raise ValidationError("doorKey es obligatorio para cambiar de sala.")
        destino = get_object_or_404(SceneMap, case_version_id=intento.case_version_id, node__node_key=clave)
        estado = _estado(intento)
        puerta = get_object_or_404(MapObject, scene_map=estado.scene_map, object_key=puerta_clave, object_type="EXIT")
        metadata = _mapa_json(puerta.metadata_json)
        if metadata.get("targetNodeKey") != clave:
            raise ValidationError("La puerta no conduce a la sala solicitada.")
        distancia_x = max(puerta.position_x - estado.player_x, 0, estado.player_x - puerta.position_x - puerta.width)
        distancia_y = max(puerta.position_y - estado.player_y, 0, estado.player_y - puerta.position_y - puerta.height)
        if math.hypot(distancia_x, distancia_y) > ALCANCE_PUERTA:
            raise ValidationError("Estás demasiado lejos de la puerta para interactuar.")
        bloqueada = metadata.get("lockedMessage") or "La puerta está bloqueada."
        if (any(requisito not in estado.inspected_object_keys for requisito in (metadata.get("requiresInspected") or []))
            or any(requisito not in estado.inventory for requisito in (metadata.get("requiresTools") or []))
            or (metadata.get("requiresNodes") and intento.current_node.node_key not in metadata["requiresNodes"])
            or any(requisito not in (estado.flags.get("viewedNpcKeys") or []) for requisito in (metadata.get("requiresNpcs") or []))):
            raise ValidationError(bloqueada)
        entrada_x = _entero(metadata.get("entryX"), "entryX")
        entrada_y = _entero(metadata.get("entryY"), "entryY")
        estado.scene_map = destino
        estado.player_x = min(max(entrada_x, 0), destino.width or DEFAULT_MAP_WIDTH)
        estado.player_y = min(max(entrada_y, 0), destino.height or DEFAULT_MAP_HEIGHT)
        estado.flags = {**estado.flags, "positionSyncedAt": timezone.now().timestamp()}
        estado.save()
        attempt_duration.record_activity(intento)
        AttemptEvent.objects.create(attempt=intento, node=intento.current_node, event_type="ROOM_ENTERED",
                                    detail=f"Puerta hacia sala {clave}", request_id=solicitud)
        return _mundo(intento, estado)
    return _ejecutar(usuario, identificador, ejecutar)

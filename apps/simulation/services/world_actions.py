"""Acciones de exploración del mundo propio de un intento."""
import math
import re
from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from shared.exceptions import ApiError
from shared.idempotency import DUPLICATE_WINDOW_SECONDS, normalize_request_id
from apps.simulation.models import AttemptEvent, AttemptHintView, ClinicalTool, MapObject, SceneHint
from apps.simulation.models.world import DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH
from . import attempt_duration, world, disponibilidad_mundo


ALCANCE_INTERACCION = 120
RADIO_DEAMBULACION = 160


def _pistas(intento):
    estado = world._estado(intento)
    pistas = list(SceneHint.objects.filter(scene_map=estado.scene_map).order_by("hint_order", "id"))
    vistas = set(AttemptHintView.objects.filter(attempt=intento, hint__scene_map=estado.scene_map).values_list("hint_id", flat=True))
    resultado = {"available": sum(pista.id not in vistas for pista in pistas),
                 "shown": [{"id": pista.id, "order": pista.hint_order, "text": pista.text} for pista in pistas if pista.id in vistas]}
    if not pistas:
        resultado["reason"] = "NONE_FOR_SCENE"
    elif not resultado["available"]:
        resultado["reason"] = "ALL_SHOWN"
    return resultado, pistas, vistas


def pistas(usuario, identificador):
    return world._ejecutar(usuario, identificador, lambda intento: _pistas(intento)[0])


def siguiente(usuario, identificador, datos):
    def ejecutar(intento):
        solicitud = normalize_request_id(datos.get("requestId"))
        anterior = intento.events.filter(request_id=solicitud).first() if solicitud else None
        if anterior:
            if anterior.event_type != "HINT_VIEWED":
                raise ValidationError("requestId ya corresponde a otra acción.")
            return _pistas(intento)[0]
        world._activo(intento)
        limite = timezone.now() - timedelta(seconds=DUPLICATE_WINDOW_SECONDS)
        if intento.events.filter(event_type="HINT_VIEWED", occurred_at__gte=limite).exists():
            return _pistas(intento)[0]
        resultado, disponibles, vistas = _pistas(intento)
        pista = next((elemento for elemento in disponibles if elemento.id not in vistas), None)
        if pista is None:
            raise ApiError("NO_MORE_HINTS", "No hay más pistas para esta escena.", 409)
        AttemptHintView.objects.create(attempt=intento, hint=pista)
        AttemptEvent.objects.create(attempt=intento, node=intento.current_node, event_type="HINT_VIEWED", detail=f"Pista {pista.hint_order} solicitada", request_id=solicitud)
        return _pistas(intento)[0]
    return world._ejecutar(usuario, identificador, ejecutar)


def _numero_movimiento(valor):
    return (not isinstance(valor, bool) and isinstance(valor, (int, float))
            and abs(valor) <= 1_000_000 and math.isfinite(valor))


def _distancia_rectangulo(posicion_x, posicion_y, rectangulo):
    origen_x, origen_y, ancho, alto = rectangulo
    distancia_x = max(origen_x - posicion_x, 0, posicion_x - origen_x - ancho)
    distancia_y = max(origen_y - posicion_y, 0, posicion_y - origen_y - alto)
    return math.hypot(distancia_x, distancia_y)


def _cerca(estado, objeto):
    origen_x, origen_y = objeto.position_x, objeto.position_y
    ancho, alto = objeto.width or 0, objeto.height or 0
    movimiento = world._mapa_json(objeto.metadata_json).get("movimiento") if objeto.object_type == "PERSON" else None
    rectangulo = (origen_x, origen_y, ancho, alto)
    if movimiento == "deambula" or (isinstance(movimiento, dict) and movimiento.get("tipo") == "deambula"):
        rectangulo = (origen_x - RADIO_DEAMBULACION, origen_y - RADIO_DEAMBULACION, ancho + 2 * RADIO_DEAMBULACION, alto + 2 * RADIO_DEAMBULACION)
    elif isinstance(movimiento, dict):
        limite_x, limite_y = objeto.scene_map.width or DEFAULT_MAP_WIDTH, objeto.scene_map.height or DEFAULT_MAP_HEIGHT
        def acotar(punto):
            return (max(0, min(punto["x"], limite_x)), max(0, min(punto["y"], limite_y)))
        def punto_valido(punto):
            return isinstance(punto, dict) and _numero_movimiento(punto.get("x")) and _numero_movimiento(punto.get("y"))
        if movimiento.get("tipo") == "va-y-viene" and punto_valido(movimiento.get("hasta")):
            destino_x, destino_y = acotar(movimiento["hasta"])
            rectangulo = (min(origen_x, destino_x), min(origen_y, destino_y),
                          abs(origen_x - destino_x) + ancho, abs(origen_y - destino_y) + alto)
        elif movimiento.get("tipo") == "ruta":
            puntos, modo = movimiento.get("puntos"), movimiento.get("modo")
            pausa = movimiento.get("pausaMs")
            if (isinstance(puntos, list) and 2 <= len(puntos) <= 8 and modo in ("circuito", "ida-y-vuelta")
                    and all(punto_valido(punto) for punto in puntos)
                    and ("pausaMs" not in movimiento or (_numero_movimiento(pausa) and 0 <= pausa <= 10000))):
                paradas = [(origen_x, origen_y)] + [acotar(punto) for punto in puntos]
                tramos = list(zip(paradas, paradas[1:]))
                if modo == "circuito":
                    tramos.append((paradas[-1], paradas[0]))
                distancia = math.inf
                for inicio, fin in tramos:
                    pasos = max(1, math.ceil(math.hypot(fin[0] - inicio[0], fin[1] - inicio[1]) / 2))
                    for paso in range(pasos + 1):
                        posicion_x = inicio[0] + (fin[0] - inicio[0]) * paso / pasos
                        posicion_y = inicio[1] + (fin[1] - inicio[1]) * paso / pasos
                        distancia = min(distancia, _distancia_rectangulo(estado.player_x, estado.player_y,
                                                                        (posicion_x, posicion_y, ancho, alto)))
                if distancia > ALCANCE_INTERACCION:
                    raise ValidationError("Estás demasiado lejos para interactuar.")
                return
    if _distancia_rectangulo(estado.player_x, estado.player_y, rectangulo) > ALCANCE_INTERACCION:
        raise ValidationError("Estás demasiado lejos para interactuar.")


def _evento(intento, tipo, detalle, solicitud=None):
    attempt_duration.record_activity(intento)
    AttemptEvent.objects.create(attempt=intento, node=intento.current_node, event_type=tipo, detail=detalle, request_id=solicitud)


def _registrar_persona(intento, estado, clave, *otras_claves):
    hablados_aqui = world._hablados_aqui(intento, estado)
    disponibilidad_mundo.registrar(estado, "talked", clave)
    estado.flags = {
        **estado.flags,
        "viewedNpcKeys": list(dict.fromkeys([*estado.flags.get("viewedNpcKeys", []), clave, *otras_claves])),
        world.HABLADOS_POR_NODO: {
            **estado.flags.get(world.HABLADOS_POR_NODO, {}),
            str(intento.current_node_id): list(dict.fromkeys([*hablados_aqui, clave])),
        },
    }


def interactuar(usuario, identificador, clave):
    def ejecutar(intento):
        world._activo(intento)
        estado = world._estado(intento)
        objeto = get_object_or_404(MapObject, scene_map=estado.scene_map, object_key=clave, visible=True)
        _cerca(estado, objeto)
        # Como en v3, autoría conserva la condición; el juego no la evalúa al interactuar.
        disponibilidad_mundo.registrar(estado, "inspected", clave)
        if clave not in estado.inspected_object_keys:
            estado.inspected_object_keys = [*estado.inspected_object_keys, clave]
        dialogo = world._dialogo(objeto)
        if dialogo and dialogo["key"] not in estado.viewed_dialogue_keys:
            estado.viewed_dialogue_keys = [*estado.viewed_dialogue_keys, dialogo["key"]]
        if dialogo and objeto.object_type == "PERSON":
            _registrar_persona(intento, estado, clave, dialogo["key"])
        herramienta = objeto.tool_code or None
        if herramienta and herramienta not in estado.inventory:
            estado.inventory = [*estado.inventory, herramienta]
        estado.save()
        _evento(intento, "MAP_INTERACTION_OPENED", objeto.interaction_prompt)
        return {"world": world._mundo(intento, estado), "interaction": world._objeto(objeto), "dialogue": dialogo,
                "preparedDecisionOptionId": objeto.decision_option_id, "unlockedToolCode": herramienta}
    return world._ejecutar(usuario, identificador, ejecutar)


def usar(usuario, identificador, datos):
    def ejecutar(intento):
        world._activo(intento)
        estado = world._estado(intento)
        codigo, objetivo = datos.get("toolCode"), datos.get("targetInteractionKey")
        if not isinstance(codigo, str) or not codigo.strip() or (objetivo is not None and not isinstance(objetivo, str)):
            raise ValidationError("La herramienta y el objetivo deben ser textos válidos.")
        objetivo = (objetivo or "").strip() or None
        herramienta = get_object_or_404(ClinicalTool, case_version=intento.case_version, tool_code=codigo)
        if codigo not in estado.inventory:
            raise ValidationError("La herramienta no está en tu inventario; recógela primero.")
        objeto = None
        if objetivo:
            objeto = get_object_or_404(MapObject, scene_map=estado.scene_map, object_key=objetivo, visible=True)
            _cerca(estado, objeto)
        pertinente = (herramienta.category.strip().lower() == "global") if not objeto else (
            objeto.tool_code == codigo or objeto.dialoguetree_set.filter(choices__required_tool_code=codigo).exists())
        # Lo que la herramienta muestra sobre este objetivo, si el caso lo escribió (metadatos.usoHerramienta).
        usos = world._mapa_json(objeto.metadata_json).get("usoHerramienta") if objeto else None
        propio = usos.get(codigo) if isinstance(usos, dict) else None
        if pertinente and isinstance(propio, str) and propio.strip():
            mensaje = propio.strip()
        elif pertinente:
            mensaje = f"Has aplicado {herramienta.label} de forma pertinente" + (" en el contexto adecuado" if objetivo else "") + ". Esto contribuye a una intervención profesional y ética."
        else:
            mensaje = f"Has utilizado {herramienta.label}, pero este no es el contexto más apropiado para esta herramienta. Considera revisar qué herramienta se ajusta mejor a la situación actual."
        solicitud = normalize_request_id(datos.get("requestId"))
        detalle = f"Herramienta usada: {codigo}" + (f" sobre {objetivo}" if objetivo else "") + f" — {'pertinente' if pertinente else 'no pertinente'}"
        anterior = intento.events.filter(request_id=solicitud).first() if solicitud else None
        if anterior and (anterior.event_type != "TOOL_USED" or anterior.node_id != intento.current_node_id
                         or anterior.detail != detalle):
            raise ValidationError("requestId ya corresponde a otra acción.")
        uso = codigo + (f"@{objetivo}" if objetivo else "")
        usos_aqui = world._usos_aqui(intento, estado)
        usado = uso in usos_aqui
        if not usado and not anterior:
            if uso not in estado.used_tool_keys:
                estado.used_tool_keys = [*estado.used_tool_keys, uso]
            por_nodo = estado.flags.get(world.USOS_POR_NODO, {})
            estado.flags = {**estado.flags, world.USOS_POR_NODO: {
                **por_nodo, str(intento.current_node_id): [*usos_aqui, uso],
            }}
            estado.save()
            _evento(intento, "TOOL_USED", detalle, solicitud)
        return {"world": world._mundo(intento, estado), "toolCode": codigo, "targetKey": objetivo,
                "pertinent": pertinente, "feedbackMessage": mensaje, "alreadyUsed": usado and not anterior}
    return world._ejecutar(usuario, identificador, ejecutar)


def personaje(usuario, identificador, clave):
    def ejecutar(intento):
        world._activo(intento)
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", clave):
            raise ValidationError("La clave del personaje no es válida.")
        estado = world._estado(intento)
        ambientales = world._mapa_json(estado.scene_map.ambient_json).get("ambientNpcs")
        npc = next((elemento for elemento in ambientales if isinstance(elemento, dict) and elemento.get("key") == clave), None) if isinstance(ambientales, list) else None
        if npc:
            posicion_x = world._entero(npc.get("x"), "x")
            posicion_y = world._entero(npc.get("y"), "y")
            radio = world._entero(npc.get("interactionRadius"), "interactionRadius")
            if radio <= 0 or math.hypot(estado.player_x - posicion_x, estado.player_y - posicion_y) > radio + 16:
                raise ValidationError("El personaje está fuera de alcance o tiene un radio inválido.")
        else:
            objeto = get_object_or_404(MapObject, scene_map=estado.scene_map, object_key=clave, object_type="PERSON", visible=True)
            _cerca(estado, objeto)
        _registrar_persona(intento, estado, clave)
        estado.save()
        _evento(intento, "NPC_DIALOGUE_VIEWED", f"{world.PREFIJO_NPC_ESCUCHADO}{clave}")
        return world._mundo(intento, estado)
    return world._ejecutar(usuario, identificador, ejecutar)

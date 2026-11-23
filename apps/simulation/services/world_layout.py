"""Plano espacial de las salas por piezas, separado del recorrido narrativo."""

from collections import deque

from apps.simulation.models import MapObject, SceneMap
from shared.jsonutils import read_map


ENCUADRES = {
    "tres-paredes": (True, True), "dos-paredes-izquierda": (True, False),
    "dos-paredes-derecha": (False, True), "una-pared": (False, False),
}
ANCHOS = (960, 1200, 1440, 1680, 1920)
OPUESTOS = {"derecha": "izquierda", "izquierda": "derecha", "fondo": "camara", "camara": "fondo"}


def _muro(meta, objeto, sala):
    ancho = sala["width"] if sala["width"] in ANCHOS else 960
    izquierda, derecha = ENCUADRES[sala["frame"]]
    borde = 96 + 19 * (ancho - 960) // 240
    limite_izquierdo = borde if izquierda else 0
    limite_derecho = ancho - borde if derecha else ancho
    if meta.get("muro") in OPUESTOS and isinstance(meta.get("pos"), int) and not isinstance(meta["pos"], bool):
        return meta["muro"], meta["pos"]
    caminable_izquierda = borde if izquierda else 24
    caminable_derecha = ancho - borde if derecha else ancho - 24
    if objeto.position_y >= 470:
        muro = "camara"
    elif objeto.position_x <= caminable_izquierda + 24:
        muro = "izquierda"
    elif objeto.position_x >= caminable_derecha - 24:
        muro = "derecha"
    else:
        muro = "fondo"
    posicion = objeto.position_x - limite_izquierdo if muro in ("fondo", "camara") else objeto.position_y - 230
    largo = (limite_derecho - limite_izquierdo if muro in ("fondo", "camara")
             else 298 if (izquierda if muro == "izquierda" else derecha) else 0)
    return muro, min(max(posicion, 0), largo)


def _solapa(posicion, ancho, ocupadas):
    posicion_x, posicion_y = posicion
    return any(posicion_x < otro_x + otro_ancho + 96 and otro_x < posicion_x + ancho + 96
               and posicion_y < otro_y + 624 and otro_y < posicion_y + 624
               for otro_x, otro_y, otro_ancho in ocupadas)


def _disponible(posicion, ancho, muro, ocupadas):
    posicion_x, posicion_y = posicion
    for fila in range(12):
        if not _solapa((posicion_x, posicion_y), ancho, ocupadas):
            return posicion_x, posicion_y
        for paso in range(1, 401):
            for signo in (1, -1):
                candidata = ((posicion_x + signo * paso * 8, posicion_y) if muro in ("fondo", "camara")
                             else (posicion_x, posicion_y + signo * paso * 8))
                if not _solapa(candidata, ancho, ocupadas):
                    return candidata
        if muro == "fondo":
            posicion_y -= 624
        elif muro == "camara":
            posicion_y += 624
        elif muro == "derecha":
            posicion_x += ancho + 96
        else:
            posicion_x -= ancho + 96
    return max((otro_x + otro_ancho for otro_x, _, otro_ancho in ocupadas), default=0) + 96, 0


def construir(intento, mapa_actual):
    if not isinstance(mapa_actual.structure, dict):
        return None
    mapas = list(SceneMap.objects.filter(case_version_id=intento.case_version_id).select_related("node")
                 .order_by("node__display_order", "node_id", "id"))
    salas, escena_sala, representantes = {}, {}, {}
    inicial = None
    for mapa in mapas:
        ambiente = read_map(mapa.ambient_json)
        clave = ambiente.get("salaId") if isinstance(ambiente.get("salaId"), str) and ambiente["salaId"] else mapa.node.node_key
        escena_sala[mapa.node_id] = escena_sala[mapa.node.node_key] = clave
        if mapa.node.start_node and inicial is None:
            inicial = clave
        if clave in salas:
            continue
        estructura = mapa.structure if isinstance(mapa.structure, dict) else {}
        ancho = estructura.get("ancho") if estructura.get("ancho") in ANCHOS else mapa.width or 960
        encuadre = ambiente.get("encuadre") if ambiente.get("encuadre") in ENCUADRES else "tres-paredes"
        manual = ambiente.get("plano")
        if not isinstance(manual, dict) or any(not isinstance(manual.get(eje), int) or isinstance(manual.get(eje), bool) for eje in ("x", "y")):
            manual = None
        salas[clave] = {"key": clave, "title": mapa.title or mapa.node.title, "width": ancho, "frame": encuadre,
                        "place": ambiente.get("lugarId") if isinstance(ambiente.get("lugarId"), str) else None,
                        "manual": (manual["x"], manual["y"]) if manual else None}
        representantes[mapa.pk] = clave
    puertas = []
    for objeto in MapObject.objects.filter(scene_map_id__in=representantes, object_type="EXIT", visible=True).order_by("id"):
        origen = representantes[objeto.scene_map_id]
        meta = read_map(objeto.metadata_json)
        destino = escena_sala.get(meta.get("targetNodeKey"))
        if destino is not None and destino != origen:
            muro, posicion = _muro(meta, objeto, salas[origen])
            puertas.append({"key": objeto.object_key, "from": origen, "to": destino, "wall": muro, "pos": posicion})
    vecinos = {clave: [] for clave in salas}
    for puerta in puertas:
        origen, destino = puerta["from"], puerta["to"]
        if salas[origen]["place"] == salas[destino]["place"]:
            vecinos[origen].append((destino, puerta, False))
            vecinos[destino].append((origen, puerta, True))
    actual = escena_sala[mapa_actual.node_id]
    grupo, cola = {actual}, deque([actual])
    while cola:
        origen = cola.popleft()
        for destino, _, _ in vecinos[origen]:
            if destino not in grupo:
                grupo.add(destino)
                cola.append(destino)
    posiciones = {clave: salas[clave]["manual"] for clave in grupo if salas[clave]["manual"] is not None}
    ocupadas = [(posicion[0], posicion[1], salas[clave]["width"]) for clave, posicion in posiciones.items()]
    inicio = inicial if inicial in grupo else next(clave for clave in salas if clave in grupo)
    if inicio not in posiciones:
        posiciones[inicio] = (0, 0)
        ocupadas.append((0, 0, salas[inicio]["width"]))
    cola, vistos = deque([inicio]), {inicio}
    while cola:
        origen = cola.popleft()
        origen_x, origen_y = posiciones[origen]
        for destino, puerta, inverso in vecinos[origen]:
            if destino not in vistos:
                vistos.add(destino)
                cola.append(destino)
            if destino in posiciones:
                continue
            muro = puerta["wall"]
            if muro == "derecha":
                candidata = (origen_x - 96 - salas[destino]["width"] if inverso else origen_x + salas[origen]["width"] + 96, origen_y)
            elif muro == "izquierda":
                candidata = (origen_x + salas[origen]["width"] + 96 if inverso else origen_x - 96 - salas[destino]["width"], origen_y)
            else:
                sala_puerta = salas[destino] if inverso else salas[origen]
                ancho_geo = sala_puerta["width"] if sala_puerta["width"] in ANCHOS else 960
                borde = 96 + 19 * (ancho_geo - 960) // 240 if ENCUADRES[sala_puerta["frame"]][0] else 0
                centro = (origen_x + salas[origen]["width"] // 2 - borde - puerta["pos"] if inverso
                          else origen_x + borde + puerta["pos"] - salas[destino]["width"] // 2)
                candidata = (8 * (centro // 8), origen_y + (624 if (muro == "fondo") == inverso else -624))
            posiciones[destino] = _disponible(candidata, salas[destino]["width"], OPUESTOS[muro] if inverso else muro, ocupadas)
            ocupadas.append((*posiciones[destino], salas[destino]["width"]))
    visitadas = {inicial, actual}
    for evento in intento.events.select_related("node"):
        if evento.node_id:
            visitadas.add(escena_sala.get(evento.node_id))
        if evento.event_type == "ROOM_ENTERED" and evento.detail and evento.detail.startswith("Puerta hacia sala "):
            visitadas.add(escena_sala.get(evento.detail.removeprefix("Puerta hacia sala ")))
    return {"currentRoom": actual,
            "rooms": [{"key": clave, "title": sala["title"], "width": sala["width"], "frame": sala["frame"],
                       "plan": {"x": posiciones[clave][0], "y": posiciones[clave][1]}, "visited": clave in visitadas}
                      for clave, sala in salas.items() if clave in grupo],
            "doors": [puerta for puerta in puertas if puerta["from"] in grupo and puerta["to"] in grupo]}

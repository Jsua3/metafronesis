from collections import deque

from apps.simulation.models.world import MapObject, SceneMap
from shared.jsonutils import read_map

SEPARACION = 96
ALTO_SALA = 528
ANCHO_SALA = 960
PASO = 8
MAX_PASOS = 400
MAX_FILAS = 12
ANCHOS = (960, 1200, 1440, 1680, 1920)
ENCUADRES = {"tres-paredes": (True, True), "dos-paredes-izquierda": (True, False), "dos-paredes-derecha": (False, True), "una-pared": (False, False)}
PISO = 230
MARGEN = 24
UMBRAL_CAMARA = 470
OPUESTO = {"derecha": "izquierda", "izquierda": "derecha", "fondo": "camara", "camara": "fondo"}


def plano(version):
    mapas = list(SceneMap.objects.filter(case_version=version).select_related("node").order_by("node__display_order", "node_id", "id"))
    salas = {}
    escenas = {}
    representantes = {}
    inicial = None
    for mapa in mapas:
        ambiente = read_map(mapa.ambient_json)
        clave = ambiente.get("salaId") if isinstance(ambiente.get("salaId"), str) and ambiente.get("salaId") else mapa.node.node_key
        escenas[mapa.node.node_key] = clave
        if mapa.node.start_node and inicial is None:
            inicial = clave
        if clave in salas:
            salas[clave]["piezas"] = salas[clave]["piezas"] or bool(mapa.structure if isinstance(mapa.structure, dict) else {})
            continue
        estructura = mapa.structure if isinstance(mapa.structure, dict) else {}
        ancho = estructura.get("ancho") if estructura.get("ancho") in ANCHOS else (mapa.width or ANCHO_SALA)
        encuadre = ambiente.get("encuadre") if ambiente.get("encuadre") in ENCUADRES else "tres-paredes"
        manual = ambiente.get("plano")
        posicion = (manual["x"], manual["y"]) if isinstance(manual, dict) and type(manual.get("x")) is int and type(manual.get("y")) is int else None
        salas[clave] = {"key": clave, "title": mapa.title or mapa.node.title, "width": ancho, "frame": encuadre, "lugar": ambiente.get("lugarId"), "manual": posicion, "piezas": bool(estructura), "doors": []}
        representantes[mapa.pk] = clave
    if not any(sala["piezas"] for sala in salas.values()):
        return None
    for objeto in MapObject.objects.filter(scene_map_id__in=representantes, object_type="EXIT", visible=True).order_by("id"):
        origen = representantes[objeto.scene_map_id]
        metadatos = read_map(objeto.metadata_json)
        destino = escenas.get(metadatos.get("targetNodeKey"))
        if not destino or destino == origen:
            continue
        muro = metadatos.get("muro")
        posicion = metadatos.get("pos")
        if muro not in OPUESTO or type(posicion) is not int:
            ancho = salas[origen]["width"] if salas[origen]["width"] in ANCHOS else ANCHO_SALA
            izquierda, derecha = ENCUADRES[salas[origen]["frame"]]
            borde = 96 + 19 * (ancho - ANCHO_SALA) // 240
            limite_izquierdo = borde if izquierda else 0
            zona_izquierda = borde if izquierda else MARGEN
            zona_derecha = ancho - borde if derecha else ancho - MARGEN
            if objeto.position_y >= UMBRAL_CAMARA:
                muro = "camara"
            elif objeto.position_x <= zona_izquierda + MARGEN:
                muro = "izquierda"
            elif objeto.position_x >= zona_derecha - MARGEN:
                muro = "derecha"
            else:
                muro = "fondo"
            posicion = objeto.position_x - limite_izquierdo if muro in ("fondo", "camara") else objeto.position_y - PISO
            largo = (ancho - (borde if derecha else 0) - limite_izquierdo) if muro in ("fondo", "camara") else ((ALTO_SALA - PISO) if (izquierda if muro == "izquierda" else derecha) else 0)
            posicion = min(max(posicion, 0), largo)
        salas[origen]["doors"].append({"key": objeto.object_key, "from": origen, "to": destino, "wall": muro, "pos": posicion})
    vecinos = {clave: set() for clave in salas}
    for sala in salas.values():
        for puerta in sala["doors"]:
            destino = puerta["to"]
            if salas[destino]["lugar"] == sala["lugar"]:
                vecinos[sala["key"]].add(destino)
                vecinos[destino].add(sala["key"])
    grupos = []
    pendientes = set(salas)
    while pendientes:
        comienzo = next(clave for clave in salas if clave in pendientes)
        grupo = set()
        cola = [comienzo]
        while cola:
            clave = cola.pop()
            if clave in grupo:
                continue
            grupo.add(clave)
            pendientes.discard(clave)
            cola.extend(vecinos[clave] - grupo)
        grupos.append(grupo)
    salida = []
    siguiente_x = 0
    for grupo in grupos:
        orden = [clave for clave in salas if clave in grupo]
        posiciones = {clave: salas[clave]["manual"] for clave in orden if salas[clave]["manual"] is not None}
        arranque = inicial if inicial in grupo else orden[0]
        posiciones.setdefault(arranque, (0, 0))
        cola = deque([arranque])
        vistos = {arranque}
        while cola:
            origen = cola.popleft()
            conexiones = [(puerta["to"], puerta["wall"], puerta["pos"], False) for puerta in salas[origen]["doors"] if puerta["to"] in grupo]
            conexiones += [(clave, puerta["wall"], puerta["pos"], True) for clave in orden for puerta in salas[clave]["doors"] if puerta["to"] == origen]
            for destino, muro, posicion, inverso in conexiones:
                if destino not in vistos:
                    vistos.add(destino)
                    cola.append(destino)
                if destino in posiciones:
                    continue
                origen_x, origen_y = posiciones[origen]
                direccion = OPUESTO[muro] if inverso else muro
                ancho = salas[destino]["width"]
                if direccion == "derecha":
                    candidato = (origen_x + salas[origen]["width"] + SEPARACION, origen_y)
                elif direccion == "izquierda":
                    candidato = (origen_x - ancho - SEPARACION, origen_y)
                else:
                    sala_puerta = salas[destino] if inverso else salas[origen]
                    ancho_geometria = sala_puerta["width"] if sala_puerta["width"] in ANCHOS else ANCHO_SALA
                    borde = 96 + 19 * (ancho_geometria - ANCHO_SALA) // 240
                    limite_izquierdo = borde if ENCUADRES[sala_puerta["frame"]][0] else 0
                    if inverso:
                        coordenada = origen_x + salas[origen]["width"] // 2 - limite_izquierdo - posicion
                    else:
                        coordenada = origen_x + limite_izquierdo + posicion - ancho // 2
                    candidato = (PASO * (coordenada // PASO), origen_y + (-1 if direccion == "fondo" else 1) * (ALTO_SALA + SEPARACION))
                posiciones[destino] = _ubicar(candidato, ancho, direccion, posiciones, salas)
        for clave in orden:
            if clave not in posiciones:
                derecha = max((punto[0] + salas[otra]["width"] for otra, punto in posiciones.items()), default=0)
                posiciones[clave] = (derecha + SEPARACION, 0)
        piezas = [clave for clave in orden if salas[clave]["piezas"]]
        if not piezas:
            continue
        izquierda = min(posiciones[clave][0] for clave in piezas)
        for clave in piezas:
            sala = salas[clave]
            salida.append({"key": clave, "title": sala["title"], "width": sala["width"], "frame": sala["frame"], "plan": {"x": posiciones[clave][0] + siguiente_x - izquierda, "y": posiciones[clave][1]}, "visited": False})
        siguiente_x += max(posiciones[clave][0] + salas[clave]["width"] for clave in piezas) - izquierda + SEPARACION
    salida.sort(key=lambda sala: list(salas).index(sala["key"]))
    claves = {sala["key"] for sala in salida}
    return {"rooms": salida, "doors": [puerta for sala in salas.values() for puerta in sala["doors"] if puerta["from"] in claves and puerta["to"] in claves]}


def _ubicar(candidato, ancho, direccion, posiciones, salas):
    def libre(prueba):
        return all(prueba[0] >= punto[0] + salas[clave]["width"] + SEPARACION or punto[0] >= prueba[0] + ancho + SEPARACION or prueba[1] >= punto[1] + ALTO_SALA + SEPARACION or punto[1] >= prueba[1] + ALTO_SALA + SEPARACION for clave, punto in posiciones.items())

    actual_x, actual_y = candidato
    for fila in range(MAX_FILAS):
        if libre((actual_x, actual_y)):
            return actual_x, actual_y
        for distancia in range(1, MAX_PASOS + 1):
            for signo in (1, -1):
                prueba = (actual_x + signo * PASO * distancia, actual_y) if direccion in ("fondo", "camara") else (actual_x, actual_y + signo * PASO * distancia)
                if libre(prueba):
                    return prueba
        if direccion == "fondo":
            actual_y -= ALTO_SALA + SEPARACION
        elif direccion == "camara":
            actual_y += ALTO_SALA + SEPARACION
        elif direccion == "derecha":
            actual_x += ancho + SEPARACION
        else:
            actual_x -= ancho + SEPARACION
    return (max((punto[0] + salas[clave]["width"] for clave, punto in posiciones.items()), default=0) + SEPARACION, 0)

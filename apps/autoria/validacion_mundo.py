"""Validación geométrica y límites de las salas de una versión."""
from apps.simulation.models.world import CollisionZone, DialogueChoice, DialogueTree, MapObject, SceneMap
from shared.jsonutils import read_map
from .activos_mundo import recurso_permitido

ANCHO_MAXIMO = 2560
ALTO_MAXIMO = 1920
MAXIMO_OBJETOS = 250
MAXIMO_COLISIONES = 300
MAXIMO_DISPARADORES = 100
UMBRAL_DIALOGOS = 50


def validar(version):
    errores = []
    advertencias = []

    def agregar(codigo, mensaje, referencia=None):
        errores.append({"severity": "ERROR", "code": codigo, "message": mensaje, "entityRef": referencia})

    nodos = list(version.nodes.all())
    decisiones = list(version.decisions.all())
    if not nodos:
        agregar("NO_NODES", "El caso debe tener al menos una escena.")
    else:
        inicios = [nodo for nodo in nodos if nodo.start_node]
        if not inicios:
            agregar("NO_START_NODE", "El caso debe tener una escena inicial.")
        elif len(inicios) > 1:
            agregar("MULTIPLE_START_NODES", "El caso debe tener una sola escena inicial.")
        if not any(nodo.terminal_node for nodo in nodos):
            agregar("NO_TERMINAL_NODE", "El caso debe tener una escena final.")
        adyacentes = {nodo.pk: [] for nodo in nodos}
        for decision in decisiones:
            if decision.source_node_id not in adyacentes or decision.target_node_id not in adyacentes:
                agregar("DECISION_NODE_NOT_IN_CASE", "La decisi?n apunta fuera del caso.", f"decision:{decision.pk}")
            else:
                adyacentes[decision.source_node_id].append(decision.target_node_id)
        alcanzados = None
        if len(inicios) == 1:
            alcanzados = set()
            pendientes = [inicios[0].pk]
            while pendientes:
                actual = pendientes.pop()
                if actual not in alcanzados:
                    alcanzados.add(actual)
                    pendientes.extend(adyacentes[actual])
        grados = {identificador: 0 for identificador in adyacentes}
        for destinos in adyacentes.values():
            for destino in destinos:
                grados[destino] += 1
        pendientes = [identificador for identificador, grado in grados.items() if grado == 0]
        visitados = 0
        while pendientes:
            actual = pendientes.pop()
            visitados += 1
            for destino in adyacentes[actual]:
                grados[destino] -= 1
                if grados[destino] == 0:
                    pendientes.append(destino)
        if visitados != len(adyacentes):
            agregar("GRAPH_CYCLE", "El grafo contiene un ciclo.")
        nodos_con_mapa = set(version.scene_maps.values_list("node_id", flat=True))
        for nodo in nodos:
            if not nodo.terminal_node and nodo.pk not in nodos_con_mapa:
                agregar("NODE_WITHOUT_MAP", "La escena no tiene mapa.", f"node:{nodo.pk}")
            if not nodo.terminal_node and not adyacentes[nodo.pk] and (alcanzados is None or nodo.pk in alcanzados):
                agregar("NODE_WITHOUT_OPTIONS", "La escena no tiene opciones.", f"node:{nodo.pk}")
            if alcanzados is not None and nodo.pk not in alcanzados:
                advertencias.append({"severity": "WARNING", "code": "UNREACHABLE_NODE", "message": "No se puede alcanzar la escena.", "entityRef": f"node:{nodo.pk}"})
    mapas = list(SceneMap.objects.filter(case_version=version))
    objetos = list(MapObject.objects.filter(scene_map__case_version=version))
    zonas = list(CollisionZone.objects.filter(scene_map__case_version=version))
    arboles = list(DialogueTree.objects.filter(scene_map__case_version=version))
    elecciones = list(DialogueChoice.objects.filter(dialogue_tree__scene_map__case_version=version).select_related("dialogue_tree"))
    for mapa in mapas:
        referencia = f"map:{mapa.pk}"
        if not (0 <= mapa.spawn_x <= mapa.width and 0 <= mapa.spawn_y <= mapa.height):
            agregar("SPAWN_OUT_OF_BOUNDS", "La aparición está fuera del mapa.", referencia)
        if mapa.width > ANCHO_MAXIMO or mapa.height > ALTO_MAXIMO:
            agregar("MAP_TOO_LARGE", "El mapa supera el tamaño permitido.", referencia)
        if not recurso_permitido(read_map(mapa.ambient_json).get("backgroundImage")):
            agregar("MAP_BACKGROUND_NOT_ALLOWED", "El fondo de la sala no es un recurso permitido.", referencia)
        objetos_mapa = [objeto for objeto in objetos if objeto.scene_map_id == mapa.pk]
        zonas_mapa = [zona for zona in zonas if zona.scene_map_id == mapa.pk]
        if len(objetos_mapa) > MAXIMO_OBJETOS:
            agregar("TOO_MANY_OBJECTS", "La sala tiene demasiados objetos.", referencia)
        if len(zonas_mapa) > MAXIMO_COLISIONES:
            agregar("TOO_MANY_COLLISIONS", "La sala tiene demasiadas zonas de colisión.", referencia)
        if sum(objeto.object_type == "TRIGGER" for objeto in objetos_mapa) > MAXIMO_DISPARADORES:
            agregar("TOO_MANY_TRIGGERS", "La sala tiene demasiados disparadores.", referencia)
        if sum(arbol.scene_map_id == mapa.pk for arbol in arboles) >= UMBRAL_DIALOGOS:
            advertencias.append({"severity": "WARNING", "code": "MANY_DIALOGUES", "message": "La sala tiene muchos di?logos.", "entityRef": referencia})
        for elemento, codigo, prefijo in ([(objeto, "OBJECT_OUT_OF_BOUNDS", "object") for objeto in objetos_mapa] + [(zona, "COLLISION_OUT_OF_BOUNDS", "collision") for zona in zonas_mapa]):
            if elemento.position_x < 0 or elemento.position_y < 0 or elemento.position_x + elemento.width > mapa.width or elemento.position_y + elemento.height > mapa.height:
                agregar(codigo, "El elemento está fuera del mapa.", f"{prefijo}:{elemento.pk}")
    opciones_ofrecidas = {objeto.decision_option_id for objeto in objetos if objeto.decision_option_id}
    opciones_ofrecidas.update(eleccion.decision_option_id for eleccion in elecciones if eleccion.decision_option_id)
    for decision in decisiones:
        if decision.response_class == "CONTRAINDICATED" and not (decision.prohibition_reason or "").strip():
            agregar("PROHIBITED_WITHOUT_REASON", "La decisi?n prohibida necesita una raz?n.", f"decision:{decision.pk}")
        if not (decision.feedback_text or decision.immediate_feedback or "").strip():
            advertencias.append({"severity": "WARNING", "code": "DECISION_WITHOUT_FEEDBACK", "message": "La decisi?n no tiene retroalimentaci?n.", "entityRef": f"decision:{decision.pk}"})
        if decision.pk not in opciones_ofrecidas:
            agregar("OPTION_WITHOUT_TRIGGER", "Ning?n objeto o di?logo ofrece esta decisi?n.", f"decision:{decision.pk}")
    claves_nodos = {nodo.node_key: nodo.pk for nodo in nodos}
    nodos_con_mapa = {mapa.node_id for mapa in mapas}
    claves_objetos = {objeto.object_key for objeto in objetos}
    herramientas = set(version.clinical_tools.values_list("tool_code", flat=True))
    claves_personajes = claves_objetos | {arbol.tree_key for arbol in arboles}
    for mapa in mapas:
        personajes = read_map(mapa.ambient_json).get("ambientNpcs")
        if isinstance(personajes, list):
            claves_personajes.update(personaje.get("key") for personaje in personajes if isinstance(personaje, dict) and isinstance(personaje.get("key"), str))
    for objeto in objetos:
        referencia = f"object:{objeto.pk}"
        metadatos = read_map(objeto.metadata_json)
        destino = metadatos.get("targetNodeKey")
        if objeto.object_type == "EXIT" and isinstance(destino, str) and destino.strip() and claves_nodos.get(destino) not in nodos_con_mapa:
            agregar("DOOR_TARGET_MISSING", "La puerta apunta a una escena sin mapa.", referencia)
        requisitos = (("requiresTools", herramientas), ("requiresNodes", set(claves_nodos)), ("requiresInspected", claves_objetos), ("requiresNpcs", claves_personajes))
        faltantes = [objeto.tool_code] if objeto.tool_code and objeto.tool_code not in herramientas else []
        for campo, disponibles in requisitos:
            valores = metadatos.get(campo)
            if isinstance(valores, list):
                faltantes.extend(valor for valor in valores if isinstance(valor, str) and valor not in disponibles)
        for faltante in faltantes:
            agregar("REQUIRES_UNKNOWN", f"Se pide ?{faltante}?, que el caso no tiene.", referencia)
            errores[-1]["detail"] = faltante
    for eleccion in elecciones:
        if eleccion.required_tool_code and eleccion.required_tool_code not in herramientas:
            agregar("REQUIRES_UNKNOWN", f"Se pide ?{eleccion.required_tool_code}?, que el caso no tiene.", f"map:{eleccion.dialogue_tree.scene_map_id}")
            errores[-1]["detail"] = eleccion.required_tool_code
    if not any(objeto.object_type == "EXIT" for objeto in objetos):
        agregar("NO_SAFE_EXIT", "El caso debe tener una salida segura.")
    return {"errors": errores, "warnings": advertencias, "canPublish": not errores}

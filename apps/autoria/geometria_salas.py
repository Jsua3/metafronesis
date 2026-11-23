"""Derivación de paredes y puertas para salas armadas por piezas."""
from collections import defaultdict

from apps.simulation.models.world import CollisionZone, MapObject, SceneMap
from shared.jsonutils import read_map, write_map
from .plano import ALTO_SALA, ANCHO_SALA, ANCHOS, ENCUADRES, MARGEN, PASO_ANCHO, PISO, SEPARACION

ZONA_SUPERIOR = 236
ZONA_ALTO = 250
HOLGURA_HORIZONTAL = 16
HOLGURA_SUPERIOR = 24
HOLGURA_INFERIOR = 10
PASO_BORDE = 19
CAMARA_NUMERADOR = 19
CAMARA_DENOMINADOR = 16
MUROS = frozenset(("fondo", "izquierda", "derecha", "camara"))
CLAVES_PARED = frozenset(("pared-fondo", "pared-izquierda", "pared-derecha", "borde-izquierdo", "borde-derecho", "borde-delantero"))


def _forma(mapa):
    estructura = mapa.structure
    if not isinstance(estructura, dict) or estructura.get("ancho") not in ANCHOS:
        return None
    encuadre = read_map(mapa.ambient_json).get("encuadre")
    return encuadre if isinstance(encuadre, str) and encuadre in ENCUADRES else "tres-paredes", estructura["ancho"]


def _zona(encuadre, ancho):
    izquierda, derecha = ENCUADRES[encuadre]
    borde = SEPARACION + PASO_BORDE * (ancho - ANCHO_SALA) // PASO_ANCHO
    comienzo = borde if izquierda else MARGEN
    final = ancho - borde if derecha else ancho - MARGEN
    return comienzo, final, borde


def _llegada(muro, posicion, encuadre, ancho):
    comienzo, final, borde = _zona(encuadre, ancho)
    izquierda, _ = ENCUADRES[encuadre]
    limite = borde if izquierda else 0
    if muro == "fondo":
        horizontal, vertical = limite + posicion, PISO
    elif muro == "camara":
        centro = ancho // 2
        numerador = (limite + posicion - centro) * CAMARA_NUMERADOR
        horizontal = centro + (2 * numerador + CAMARA_DENOMINADOR) // (2 * CAMARA_DENOMINADOR)
        vertical = ALTO_SALA
    else:
        fondo = ALTO_SALA - PISO
        numerador = posicion * (borde - MARGEN)
        horizontal = borde - (2 * numerador + fondo) // (2 * fondo)
        if muro == "derecha":
            horizontal = ancho - horizontal
        vertical = PISO + posicion
    horizontal = min(max(horizontal, comienzo + HOLGURA_HORIZONTAL), final - HOLGURA_HORIZONTAL)
    vertical = min(max(vertical, ZONA_SUPERIOR + HOLGURA_SUPERIOR), ZONA_SUPERIOR + ZONA_ALTO - HOLGURA_INFERIOR)
    return horizontal, vertical


def _muro_posicion(metadatos):
    muro = metadatos.get("muro")
    posicion = metadatos.get("pos")
    return (muro, posicion) if isinstance(muro, str) and muro in MUROS and type(posicion) is int else None


def _paredes(mapa, encuadre, ancho):
    comienzo, final, _ = _zona(encuadre, ancho)
    izquierda, derecha = ENCUADRES[encuadre]
    filas = [CollisionZone(scene_map=mapa, zone_key="pared-fondo", label="Pared del fondo", position_x=0, position_y=0, width=ancho, height=ZONA_SUPERIOR)]
    if comienzo:
        filas.append(CollisionZone(scene_map=mapa, zone_key="pared-izquierda" if izquierda else "borde-izquierdo", label="Pared izquierda" if izquierda else "Borde izquierdo", position_x=0, position_y=ZONA_SUPERIOR, width=comienzo, height=ZONA_ALTO))
    if final < ancho:
        filas.append(CollisionZone(scene_map=mapa, zone_key="pared-derecha" if derecha else "borde-derecho", label="Pared derecha" if derecha else "Borde derecho", position_x=final, position_y=ZONA_SUPERIOR, width=ancho - final, height=ZONA_ALTO))
    filas.append(CollisionZone(scene_map=mapa, zone_key="borde-delantero", label="Borde delantero", position_x=0, position_y=ZONA_SUPERIOR + ZONA_ALTO, width=ancho, height=ALTO_SALA - ZONA_SUPERIOR - ZONA_ALTO))
    actuales = {(zona.zone_key, zona.label, zona.position_x, zona.position_y, zona.width, zona.height) for zona in mapa.collision_zones.filter(zone_key__in=CLAVES_PARED)}
    nuevas = {(zona.zone_key, zona.label, zona.position_x, zona.position_y, zona.width, zona.height) for zona in filas}
    if actuales != nuevas:
        mapa.collision_zones.filter(zone_key__in=CLAVES_PARED).delete()
        CollisionZone.objects.bulk_create(filas)


def recalcular(version):
    mapas = list(SceneMap.objects.filter(case_version=version).select_related("node").order_by("id"))
    por_escena = {mapa.node.node_key: mapa for mapa in mapas}
    salas = {mapa.node.node_key: read_map(mapa.ambient_json).get("salaId") or mapa.node.node_key for mapa in mapas}
    puertas = defaultdict(list)
    for objeto in MapObject.objects.filter(scene_map__case_version=version, object_type="EXIT").order_by("id"):
        puertas[objeto.scene_map_id].append((objeto, read_map(objeto.metadata_json)))
    for mapa in mapas:
        forma = _forma(mapa)
        if forma is None:
            continue
        encuadre, ancho = forma
        if (mapa.width, mapa.height) != (ancho, ALTO_SALA):
            mapa.width, mapa.height = ancho, ALTO_SALA
            mapa.save(update_fields=["width", "height", "updated_at"])
        _paredes(mapa, encuadre, ancho)
        for puerta, metadatos in puertas[mapa.pk]:
            posicion = _muro_posicion(metadatos)
            if posicion is None:
                continue
            horizontal, vertical = _llegada(*posicion, encuadre, ancho)
            nueva = dict(metadatos)
            clave_destino = metadatos.get("targetNodeKey")
            destino = por_escena.get(clave_destino) if isinstance(clave_destino, str) else None
            if destino:
                llegada = (destino.spawn_x, destino.spawn_y)
                forma_destino = _forma(destino)
                pareja = None
                for candidata, datos in puertas[destino.pk]:
                    if isinstance(metadatos.get("par"), str):
                        coincide = candidata.object_key == metadatos["par"]
                    else:
                        objetivo = datos.get("targetNodeKey")
                        coincide = isinstance(objetivo, str) and (objetivo == mapa.node.node_key or (salas.get(objetivo) is not None and salas.get(objetivo) == salas[mapa.node.node_key]))
                    if coincide:
                        pareja = _muro_posicion(datos)
                        break
                if forma_destino and pareja:
                    llegada = _llegada(*pareja, *forma_destino)
                nueva["entryX"], nueva["entryY"] = llegada
            if (puerta.position_x, puerta.position_y) != (horizontal, vertical) or nueva != metadatos:
                puerta.position_x, puerta.position_y = horizontal, vertical
                puerta.metadata_json = write_map(nueva)
                puerta.save(update_fields=["position_x", "position_y", "metadata_json"])

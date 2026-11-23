"""Reglas de la compuerta sobre las salas armadas por piezas (portadas de OCL-13, OCL-14, OCL-15 y OCL-18 de v3).

Solo miran los mapas que traen ``structure``: un caso de imagen fija no cambia de veredicto. Los errores salen con el mismo
formato que ``validacion_mundo`` (``severity``, ``code``, ``message``, ``entityRef``) y se suman a los suyos.

- ``STRUCTURE_CATALOG``    (OCL-18) el ancho, el piso y su variante, el muro y su paleta, cada pieza, cada modelo de puerta y cada
  capa propia o tapete están en el catálogo (``biblioteca/piezas/manifiesto.json``). Sin catálogo no se puede revisar y se dice.
- ``STRUCTURE_WALL_FIT``   (OCL-13) cada pieza y cada puerta va en un muro que el encuadre tiene y que su modelo admite, dentro de
  su largo; una pieza de suelo va dentro de la zona caminable; las puertas no van entre las piezas.
- ``STRUCTURE_OVERLAP``    (OCL-14) dos piezas del mismo muro no se estorban (a lo largo del muro y en altura; 8 px más si una es
  puerta).
- ``STRUCTURE_DOOR_RETURN`` (OCL-15, la parte de regreso) la sala de destino tiene una puerta que vuelve, salvo ``sentidoUnico``.
  Que la puerta lleve a una escena con mapa ya lo dice ``DOOR_TARGET_MISSING``.

No se portaron OCL-16 (la llegada de cada puerta es caminable), OCL-17 (todo es alcanzable caminando) y OCL-19 (los trayectos de
las personas): necesitan el recorrido por rejilla de v3 sobre el documento 2.2, que metafronesis no tiene; la llegada la fija
``geometria_salas.recalcular`` dentro de la zona caminable.
"""
from collections import defaultdict

from apps.biblioteca.services import catalogo_piezas
from apps.simulation.models.world import MapObject, SceneMap
from shared.jsonutils import read_map

from .plano import ALTO_SALA, ANCHO_SALA, ANCHOS, ENCUADRES, MARGEN, PASO_ANCHO, PISO, SEPARACION

MUROS = ("fondo", "izquierda", "derecha", "camara")
ZONA_Y, ZONA_ALTO = 236, 250
FONDO = ALTO_SALA - PISO


def _lista(valor):
    return valor if isinstance(valor, list) else []


def _texto(valor):
    return valor if isinstance(valor, str) else None


def _entero(valor):
    return type(valor) is int


def _borde(ancho):
    return SEPARACION + 19 * (ancho - ANCHO_SALA) // PASO_ANCHO


def _largo_muro(muro, encuadre, ancho):
    izquierda, derecha = ENCUADRES[encuadre]
    if muro in ("fondo", "camara"):
        b = _borde(ancho)
        return (ancho - b if derecha else ancho) - (b if izquierda else 0)
    return FONDO if (izquierda if muro == "izquierda" else derecha) else 0


def _zona(encuadre, ancho):
    izquierda, derecha = ENCUADRES[encuadre]
    b = _borde(ancho)
    x0 = b if izquierda else MARGEN
    x1 = ancho - b if derecha else ancho - MARGEN
    return x0, ZONA_Y, x1 - x0, ZONA_ALTO


def _error(codigo, mensaje, mapa, detalle=None):
    return {"severity": "ERROR", "code": codigo, "message": mensaje, "entityRef": f"map:{mapa.pk}", **({"detail": detalle} if detalle else {})}


def _fuera_del_muro(muro, pos, modelo, encuadre, ancho):
    if not isinstance(muro, str) or muro not in MUROS or not _entero(pos):
        return "No dice en qué muro ni en qué posición va: lleva «muro» (fondo, izquierda, derecha o cámara) y «pos» (un entero)."
    largo = _largo_muro(muro, encuadre, ancho)
    if largo == 0:
        return f"La sala no tiene muro «{muro}»: su encuadre no lo incluye."
    if modelo is not None and muro not in modelo.muros:
        return f"Este modelo no puede ir en el muro «{muro}»."
    ocupa = modelo.ocupa if modelo is not None else 0
    if 2 * pos - ocupa < 0 or 2 * pos + ocupa > 2 * largo:
        return f"La pieza se sale del muro «{muro}», que mide {largo} px."
    return None


def _dibujo(mapa):
    """``(encuadre, ancho)`` del mapa, con el encuadre por omisión si no trae uno válido; ``ancho`` es ``None`` si no es del catálogo."""
    estructura = mapa.structure
    ancho = estructura.get("ancho")
    encuadre = read_map(mapa.ambient_json).get("encuadre")
    return (encuadre if isinstance(encuadre, str) and encuadre in ENCUADRES else "tres-paredes"), (
        ancho if type(ancho) is int and ancho in ANCHOS else None
    )


def _catalogo_de_la_sala(catalogo, mapa, ancho, errores):
    estructura = mapa.structure
    if ancho is None:
        errores.append(_error("STRUCTURE_CATALOG", "El ancho de la sala no es uno del catálogo (960, 1200, 1440, 1680 o 1920).", mapa))
    acabados = estructura.get("acabados") if isinstance(estructura.get("acabados"), dict) else {}
    piso, variante = acabados.get("piso"), acabados.get("variante", "a")
    if not catalogo.tiene_piso(piso, variante):
        errores.append(_error("STRUCTURE_CATALOG", f"El piso «{piso}» en la variante «{variante}» no está en el catálogo.", mapa))
    if not catalogo.tiene_muro(acabados.get("muro"), acabados.get("paleta")):
        errores.append(_error("STRUCTURE_CATALOG", f"El muro «{acabados.get('muro')}» con la paleta «{acabados.get('paleta')}» no está en el catálogo.", mapa))
    for pieza in _lista(estructura.get("piezas")):
        if isinstance(pieza, dict) and pieza.get("tipo") != "puerta" and f"{pieza.get('tipo')}/{pieza.get('modelo')}" not in catalogo.piezas:
            errores.append(_error("STRUCTURE_CATALOG", f"La pieza «{pieza.get('tipo')}/{pieza.get('modelo')}» no está en el catálogo.", mapa))
    for campo, conocidas in (("propios", catalogo.propios), ("tapetes", catalogo.tapetes)):
        for capa in _lista(estructura.get(campo)):
            if isinstance(capa, dict) and (not isinstance(capa.get("ruta"), str) or capa["ruta"] not in conocidas):
                errores.append(_error("STRUCTURE_CATALOG", f"La imagen «{capa.get('ruta')}» no está en el catálogo.", mapa))


def _en_muros(catalogo, mapa, puertas):
    """``(nombre, muro, pos, modelo)`` de lo que está puesto en un muro: las piezas y las puertas bien formadas."""
    resultado = []
    for pieza in _lista(mapa.structure.get("piezas")):
        modelo = catalogo.piezas.get(f"{pieza.get('tipo')}/{pieza.get('modelo')}") if isinstance(pieza, dict) else None
        if modelo and isinstance(pieza.get("muro"), str) and pieza["muro"] in MUROS and _entero(pieza.get("pos")):
            resultado.append((pieza.get("id") or pieza["modelo"], pieza["muro"], pieza["pos"], modelo))
    for objeto, meta in puertas:
        modelo = catalogo.piezas.get(f"puerta/{meta.get('modelo')}")
        if modelo and isinstance(meta.get("muro"), str) and meta["muro"] in MUROS and _entero(meta.get("pos")):
            resultado.append((objeto.object_key, meta["muro"], meta["pos"], modelo))
    return resultado


def _revisar_mapa(catalogo, mapa, puertas, errores):
    encuadre, ancho = _dibujo(mapa)
    _catalogo_de_la_sala(catalogo, mapa, ancho, errores)
    if ancho is None:
        return  # sin ancho del catálogo no hay geometría
    zona = _zona(encuadre, ancho)
    for pieza in _lista(mapa.structure.get("piezas")):
        if not isinstance(pieza, dict):
            continue
        modelo = catalogo.piezas.get(f"{pieza.get('tipo')}/{pieza.get('modelo')}")
        if pieza.get("tipo") == "puerta":
            errores.append(_error("STRUCTURE_WALL_FIT", "Las puertas no van entre las piezas: son objetos de salida (EXIT) con muro y posición.", mapa, pieza.get("id")))
        elif "muro" in pieza:
            motivo = _fuera_del_muro(pieza.get("muro"), pieza.get("pos"), modelo, encuadre, ancho)
            if motivo:
                errores.append(_error("STRUCTURE_WALL_FIT", motivo, mapa, pieza.get("id")))
        elif _entero(pieza.get("x")) and _entero(pieza.get("y")):
            if modelo is not None and not modelo.de_suelo:
                errores.append(_error("STRUCTURE_WALL_FIT", "Esta pieza va colgada de un muro, no apoyada en el suelo.", mapa, pieza.get("id")))
            if not (zona[0] <= pieza["x"] <= zona[0] + zona[2] and zona[1] <= pieza["y"] <= zona[1] + zona[3]):
                errores.append(_error("STRUCTURE_WALL_FIT", "La pieza de suelo queda fuera de la zona donde se camina.", mapa, pieza.get("id")))
    for objeto, meta in puertas:
        motivo = _fuera_del_muro(meta.get("muro"), meta.get("pos"), catalogo.piezas.get(f"puerta/{meta.get('modelo')}"), encuadre, ancho)
        if motivo:
            errores.append(_error("STRUCTURE_WALL_FIT", motivo, mapa, objeto.object_key))
    colocadas = _en_muros(catalogo, mapa, puertas)
    for a in range(len(colocadas)):
        for b in range(a + 1, len(colocadas)):
            nombre_a, muro_a, pos_a, modelo_a = colocadas[a]
            nombre_b, muro_b, pos_b, modelo_b = colocadas[b]
            if muro_a != muro_b:
                continue
            holgura = 16 if modelo_a.es_puerta or modelo_b.es_puerta else 0  # 8 px, al doble por comparar 2·|Δpos|
            cerca = 2 * abs(pos_a - pos_b) < modelo_a.ocupa + modelo_b.ocupa + holgura
            en_altura = modelo_a.franja[0] < modelo_b.franja[1] and modelo_b.franja[0] < modelo_a.franja[1]
            if cerca and en_altura:
                errores.append(_error("STRUCTURE_OVERLAP", f"«{nombre_a}» y «{nombre_b}» se montan una sobre otra en el muro «{muro_a}».", mapa, nombre_a))


def _regresa(meta, origen, sala_origen, sala_de):
    objetivo = meta.get("targetNodeKey")
    return objetivo == origen or (isinstance(objetivo, str) and objetivo in sala_de and sala_de[objetivo] == sala_origen)


def _revisar_regresos(mapas, puertas, errores):
    por_escena = {mapa.node.node_key: mapa for mapa in mapas}
    sala_de = {clave: read_map(mapa.ambient_json).get("salaId") or clave for clave, mapa in por_escena.items()}
    for mapa in mapas:
        if not isinstance(mapa.structure, dict):
            continue
        origen = mapa.node.node_key
        for objeto, meta in puertas[mapa.pk]:
            destino = por_escena.get(_texto(meta.get("targetNodeKey")))
            if destino is None or meta.get("sentidoUnico") is True:
                continue  # sin destino lo dice DOOR_TARGET_MISSING
            en_destino = puertas[destino.pk]
            par = meta.get("par")
            if isinstance(par, str):
                pareja = next(((o, m) for o, m in en_destino if o.object_key == par), None)
                if pareja is None:
                    motivo = f"La puerta de regreso «{par}» no está en la sala de destino."
                elif not _regresa(pareja[1], origen, sala_de[origen], sala_de):
                    motivo = f"La puerta «{par}» de la sala de destino no vuelve a esta sala."
                else:
                    continue
            elif any(_regresa(m, origen, sala_de[origen], sala_de) for _, m in en_destino):
                continue
            else:
                motivo = "La sala de destino no tiene puerta de regreso; si es de un solo sentido, márcala como de sentido único."
            errores.append(_error("STRUCTURE_DOOR_RETURN", motivo, mapa, objeto.object_key))


def validar(version):
    """Los errores de estructura de todas las salas por piezas de la versión (lista vacía si no hay ninguna)."""
    mapas = list(SceneMap.objects.filter(case_version=version).select_related("node").order_by("id"))
    con_estructura = [mapa for mapa in mapas if isinstance(mapa.structure, dict)]
    if not con_estructura:
        return []
    catalogo = catalogo_piezas.catalogo_vigente()
    if catalogo is None:
        return [{
            "severity": "ERROR", "code": "STRUCTURE_CATALOG_UNAVAILABLE", "entityRef": None,
            "message": "El catálogo de piezas de la biblioteca no está disponible: no se pueden revisar las salas por piezas.",
        }]
    puertas = defaultdict(list)
    for objeto in MapObject.objects.filter(scene_map__case_version=version, object_type="EXIT").order_by("id"):
        puertas[objeto.scene_map_id].append((objeto, read_map(objeto.metadata_json)))
    errores = []
    for mapa in con_estructura:
        _revisar_mapa(catalogo, mapa, puertas[mapa.pk], errores)
    _revisar_regresos(mapas, puertas, errores)
    return errores

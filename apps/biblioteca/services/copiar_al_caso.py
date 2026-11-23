"""Copia las salas elegidas de un lugar de la biblioteca a un borrador de caso.

**Copia por valor.** Lo que se escribe en el caso son filas y JSON nuevos construidos aquí campo por campo: ningún diccionario
del lugar cargado se guarda ni se comparte, así que editar la biblioteca después no toca un caso ya creado.

Por cada sala elegida, en el orden pedido (la primera es la escena de inicio): una escena (``SimulationNode``, clave = id de
la sala) y su mapa (``SceneMap``), los muebles como ``PROP`` (los que chocan dejan su huella como ``CollisionZone``), los
objetos con su tipo, las personas como ``PERSON`` enlazadas a un ``CaseCharacter`` (uno por personaje) y las puertas hacia
otra sala elegida como ``EXIT``. Del lugar entero pasan al caso las herramientas, los hitos y el nivel de riesgo.

Debe llamarse dentro de la transacción que crea el borrador: si algo falla no queda una copia a medias.
"""
import copy
import json
from dataclasses import dataclass

from rest_framework import status

from apps.simulation.models import CaseCharacter, ClinicalTool, CollisionZone, MapObject, SceneMap, SimulationNode
from apps.simulation.models.world import MAP_OBJECT_TYPES
from apps.simulation.services import case_rules
from shared.exceptions import ApiError
from shared.jsonutils import read_map

from . import geometria
from .geometria import ALTO_SALA, ANCHO_SALA
from .lugares import url_de_arte

TEMA = "clinical-soft"
COLUMNAS_DEL_GRAFO, SEPARACION_X, SEPARACION_Y, ORIGEN_X, ORIGEN_Y = 4, 280, 200, 180, 180
MAXIMO_SALAS = 40
TAMANO_OBJETO = 32
TAMANO_PERSONA = (48, 48)
TAMANO_PUERTA = (24, 40)
ICONO_POR_TIPO = {"PERSON": "person", "EXIT": "door_front", "NOTE": "article", "RESOURCE": "description"}
ICONO_POR_DEFECTO = "inventory_2"
ICONO_HERRAMIENTA = "assignment"
COLOR = "#4FA3A5"
#: ``metadata.apoyo``: la posición del objeto es el punto donde apoya en el suelo (centro inferior), no el centro de su caja.
APOYO = "pies"
MIRANDO = {"abajo": "down", "izquierda": "left", "arriba": "up", "derecha": "right"}
FPS_POR_DEFECTO = 6


@dataclass(frozen=True)
class ResumenCopia:
    """Lo que la copia escribió: las escenas por sala, sus personas y los nombres de los personajes."""

    lugar_id: str
    nodos: dict
    personas: dict
    personajes: dict


def _rechazar(mensaje):
    return ApiError("VALIDATION_ERROR", mensaje, status.HTTP_400_BAD_REQUEST, field="salas")


def validar_salas(lugar, salas):
    """Las salas pedidas como lista de ids: no vacía, sin repetidas y todas del lugar (400 con ``field: salas``)."""
    if not isinstance(salas, list) or not salas:
        raise _rechazar("Elige al menos una sala del lugar.")
    if len(salas) > MAXIMO_SALAS:
        raise _rechazar(f"Un caso admite hasta {MAXIMO_SALAS} salas.")
    existentes = {sala["id"] for sala in lugar.get("salas", [])}
    vistas = set()
    for sala in salas:
        if not isinstance(sala, str) or sala not in existentes:
            raise _rechazar("Una de las salas elegidas no existe en este lugar.")
        if sala in vistas:
            raise _rechazar("Una sala está elegida más de una vez.")
        vistas.add(sala)
    return list(salas)


def clave_de_hito(clave):
    """La clave de un hito de la biblioteca (``valorar-el-riesgo``) en la forma que entiende el modelo de reglas."""
    traducida = clave.replace("-", "_")
    if not case_rules.NAME.fullmatch(traducida):
        raise ApiError(
            "BIBLIOTECA_INVALIDA", "Un hito del lugar tiene una clave que el caso no admite.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return traducida


class _Claves:
    """Claves de objeto únicas dentro de una sala: la primera es la base, las demás ``base-2``, ``base-3``…"""

    def __init__(self):
        self._usadas = set()

    def nueva(self, base):
        clave, numero = base, 2
        while clave in self._usadas:
            clave, numero = f"{base}-{numero}", numero + 1
        self._usadas.add(clave)
        return clave


def _asignar_claves(sala, entradas=None):
    """Las claves de objeto de una sala en el orden exacto de la copia: muebles, objetos, personas y puertas.

    Con ``entradas`` (las salas elegidas) solo las puertas que llevan a una sala elegida reciben clave.
    """
    claves = _Claves()
    return {
        "muebles": [claves.nueva(colocado["ref"]) for colocado in sala.get("muebles", [])],
        "objetos": [claves.nueva(colocado["ref"]) for colocado in sala.get("objetos", [])],
        "personajes": [claves.nueva(colocado["ref"]) for colocado in sala.get("personajes", [])],
        "puertas": [
            claves.nueva(puerta["id"]) for puerta in sala.get("puertas", [])
            if entradas is None or puerta["hacia"] in entradas
        ],
    }


def claves_de_sala(sala):
    """``{"muebles", "objetos", "personajes", "puertas"}`` → las claves de objeto que la copia asigna en esa sala."""
    return _asignar_claves(sala)


def _json(valor):
    return json.dumps(valor, ensure_ascii=False)


def _objeto(escena, clave, etiqueta, tipo, posicion, tamano, **campos):
    if tipo not in MAP_OBJECT_TYPES:
        raise ApiError(
            "BIBLIOTECA_INVALIDA", "Un objeto del lugar tiene un tipo que el caso no admite.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    metadata = campos.pop("metadata", {})
    return MapObject(
        scene_map=escena, object_key=clave, label=etiqueta, object_type=tipo, position_x=posicion[0],
        position_y=posicion[1], width=tamano[0], height=tamano[1], color_hex=COLOR,
        icon=ICONO_POR_TIPO.get(tipo, ICONO_POR_DEFECTO), metadata_json=_json(metadata), **campos,
    )


def _muebles(escena, sala, catalogo, lugar_id, claves):
    objetos, zonas = [], []
    for colocado, clave in zip(sala.get("muebles", []), claves):
        modelo = catalogo[colocado["ref"]]
        choca = bool(modelo["colision"])
        metadata = {"arte": url_de_arte(lugar_id, modelo["arte"]), "colision": choca, "apoyo": APOYO}
        if colocado.get("espejo"):
            metadata["espejo"] = True
        # El choque lo lleva solo la zona del suelo: ``collision`` del objeto va en falso porque su posición es el
        # centro inferior y no la esquina de la caja.
        objetos.append(_objeto(
            escena, clave, modelo["nombre"], "PROP", (colocado["x"], colocado["y"]), (modelo["ancho"], modelo["alto"]),
            collision=False, metadata=metadata,
        ))
        if choca:
            zonas.append(CollisionZone(
                scene_map=escena, zone_key=f"choque-{clave}", label=modelo["nombre"],
                position_x=colocado["x"] - modelo["ancho"] // 2, position_y=colocado["y"] - modelo["alto"],
                width=modelo["ancho"], height=modelo["alto"],
            ))
    return objetos, zonas


def _paredes(escena, sala):
    return [
        CollisionZone(
            scene_map=escena, zone_key=pared.clave, label=pared.etiqueta,
            position_x=pared.x, position_y=pared.y, width=pared.ancho, height=pared.alto,
        )
        for pared in geometria.paredes(sala["encuadre"])
    ]


def _objetos(escena, sala, catalogo, lugar_id, claves):
    resultado = []
    for colocado, clave in zip(sala.get("objetos", []), claves):
        modelo = catalogo[colocado["ref"]]
        metadata = {"arte": url_de_arte(lugar_id, modelo["arte"]), "apoyo": APOYO}
        animacion = modelo.get("animacionCerca")
        if isinstance(animacion, dict):
            metadata["animacionCerca"] = {
                "hoja": url_de_arte(lugar_id, animacion["hoja"]),
                "cuadros": animacion["cuadros"],
                "fps": animacion.get("fps", FPS_POR_DEFECTO),
            }
        resultado.append(_objeto(
            escena, clave, modelo["nombre"], modelo["tipo"], (colocado["x"], colocado["y"]),
            (TAMANO_OBJETO, TAMANO_OBJETO),
            interaction_prompt=modelo.get("textoInteraccion") or "", interaction_text=modelo.get("alRevisar") or "",
            metadata=metadata,
        ))
    return resultado


def _personas(escena, sala, personajes, caracteres, claves):
    resultado = []
    for colocado, clave in zip(sala.get("personajes", []), claves):
        info = personajes[colocado["ref"]]
        metadata = {"recipeId": info["recipeId"], "movimiento": "quieto", "apoyo": APOYO}
        if colocado.get("expresion"):
            metadata["expresion"] = colocado["expresion"]
        resultado.append(_objeto(
            escena, clave, info["nombre"], "PERSON", (colocado["x"], colocado["y"]), TAMANO_PERSONA,
            interaction_prompt="Hablar", facing=MIRANDO.get(colocado.get("mirando"), "down"),
            character=caracteres[colocado["ref"]], metadata=metadata,
        ))
    return resultado


def _puertas(escena, sala, entradas, claves):
    resultado = []
    elegidas = [puerta for puerta in sala.get("puertas", []) if puerta["hacia"] in entradas]
    for puerta, clave in zip(elegidas, claves):
        destino = entradas[puerta["hacia"]]
        metadata = {"targetNodeKey": puerta["hacia"], "entryX": destino["x"], "entryY": destino["y"], "pintada": True}
        resultado.append(_objeto(
            escena, clave, puerta["etiqueta"], "EXIT", (puerta["x"], puerta["y"]), TAMANO_PUERTA,
            interaction_prompt=puerta["etiqueta"], metadata=metadata,
        ))
    return resultado


def _personajes_del_caso(version, lugar, elegidas):
    """Un ``CaseCharacter`` por personaje del lugar que aparece en alguna sala elegida, en el orden en que aparece."""
    por_id = {personaje["id"]: personaje for personaje in lugar.get("personajes", [])}
    caracteres = {}
    for sala in elegidas:
        for colocado in sala.get("personajes", []):
            referencia = colocado["ref"]
            if referencia in caracteres:
                continue
            info = por_id[referencia]
            caracteres[referencia] = CaseCharacter.objects.create(
                case_version=version, character_key=referencia, display_name=info["nombre"],
                role_label=info.get("rol", ""), display_order=len(caracteres),
            )
    return caracteres


def _herramientas(version, lugar):
    ClinicalTool.objects.bulk_create([
        ClinicalTool(
            case_version=version, tool_code=herramienta["id"], label=herramienta["nombre"], icon=ICONO_HERRAMIENTA,
            category="clinical", description=herramienta.get("descripcion", ""), active=True,
        )
        for herramienta in lugar.get("catalogo", {}).get("herramientas", [])
    ])


def _reglas(version, lugar):
    """Los hitos y el nivel de riesgo del lugar en ``rules`` (las demás claves de las reglas se conservan)."""
    reglas = read_map(version.rules)
    hitos = [
        {
            "key": clave_de_hito(hito["key"]), "label": hito["label"],
            "description": hito.get("description", ""), "decisive": bool(hito.get("decisive", False)),
        }
        for hito in lugar.get("hitos", [])
    ]
    if hitos:
        reglas["milestones"] = hitos
    if lugar.get("nivelRiesgoPorDefecto"):
        reglas["riskLevel"] = lugar["nivelRiesgoPorDefecto"]
    version.rules = _json(reglas)
    version.save(update_fields=["rules"])


def copiar_al_caso(version, lugar, salas):
    """Copia ``salas`` (ids, en orden) del ``lugar`` cargado a ``version``; devuelve el ``ResumenCopia``."""
    identificadores = validar_salas(lugar, salas)
    lugar = copy.deepcopy(lugar)
    lugar_id = lugar["id"]
    por_id = {sala["id"]: sala for sala in lugar["salas"]}
    elegidas = [por_id[identificador] for identificador in identificadores]
    entradas = {sala["id"]: sala["entrada"] for sala in elegidas}
    catalogo = lugar.get("catalogo", {})
    muebles = {mueble["id"]: mueble for mueble in catalogo.get("muebles", [])}
    objetos = {objeto["id"]: objeto for objeto in catalogo.get("objetos", [])}
    personajes = {personaje["id"]: personaje for personaje in lugar.get("personajes", [])}
    caracteres = _personajes_del_caso(version, lugar, elegidas)

    nodos, personas = {}, {}
    for posicion, sala in enumerate(elegidas):
        nodo = SimulationNode.objects.create(
            case_version=version, node_key=sala["id"], title=sala["nombre"], narrative=sala["descripcion"],
            start_node=posicion == 0, terminal_node=False, display_order=posicion,
            position_x=ORIGEN_X + (posicion % COLUMNAS_DEL_GRAFO) * SEPARACION_X,
            position_y=ORIGEN_Y + (posicion // COLUMNAS_DEL_GRAFO) * SEPARACION_Y,
        )
        ambiente = {
            "backgroundImage": url_de_arte(lugar_id, sala["fondo"]), "encuadre": sala["encuadre"],
            "salaId": sala["id"], "lugarId": lugar_id,
        }
        entrada = sala["entrada"]
        escena = SceneMap.objects.create(
            case_version=version, node=nodo, map_key=f"sala-{sala['id']}", title=sala["nombre"], width=ANCHO_SALA,
            height=ALTO_SALA, theme=TEMA, spawn_x=entrada["x"], spawn_y=entrada["y"], ambient_json=_json(ambiente),
        )
        claves = _asignar_claves(sala, entradas)
        de_muebles, zonas = _muebles(escena, sala, muebles, lugar_id, claves["muebles"])
        de_personas = _personas(escena, sala, personajes, caracteres, claves["personajes"])
        MapObject.objects.bulk_create(
            de_muebles + _objetos(escena, sala, objetos, lugar_id, claves["objetos"]) + de_personas
            + _puertas(escena, sala, entradas, claves["puertas"])
        )
        CollisionZone.objects.bulk_create(_paredes(escena, sala) + zonas)
        nodos[sala["id"]] = nodo
        personas[sala["id"]] = dict(zip(claves["personajes"], [colocado["ref"] for colocado in sala.get("personajes", [])]))
    _herramientas(version, lugar)
    _reglas(version, lugar)
    return ResumenCopia(
        lugar_id=lugar_id, nodos=nodos, personas=personas,
        personajes={referencia: caracter.display_name for referencia, caracter in caracteres.items()},
    )

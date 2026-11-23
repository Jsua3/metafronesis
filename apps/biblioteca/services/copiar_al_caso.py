"""Copia las salas elegidas de un lugar de la biblioteca a un borrador de caso.

**Copia por valor.** Lo que se escribe en el caso son filas y JSON nuevos construidos aquí campo por campo: editar la
biblioteca después no toca un caso ya creado, ni dos casos se tocan entre sí.

Por cada sala elegida, en el orden pedido (la primera es la escena de inicio):

- una escena (``SimulationNode``, clave = id de la sala) y su mapa (``SceneMap``: fondo en ``ambient.backgroundImage``,
  ``ambient.encuadre``, entrada = punto de aparición) y las paredes del encuadre como ``CollisionZone``; el mapa dice a
  qué sala y a qué lugar pertenece en ``ambient.salaId`` y ``ambient.lugarId``;
- los muebles -> ``PROP`` con el tamaño del catálogo; los que chocan dejan su huella en el suelo como ``CollisionZone``;
- los objetos -> su tipo, ``interaction_text`` = ``alRevisar`` e ``interaction_prompt`` = ``textoInteraccion``;
- los personajes -> ``PERSON`` enlazada a un ``CaseCharacter`` (uno por personaje del lugar);
- las puertas que llevan a otra sala elegida -> ``EXIT`` con ``metadata.{targetNodeKey, entryX, entryY, pintada}``.

Del lugar entero pasan al caso las herramientas (``ClinicalTool``), los hitos y el nivel de riesgo (``rules``).

Todas las posiciones son las de la biblioteca: el punto de apoyo en el suelo (centro inferior). ``metadata.apoyo =
"pies"`` se lo dice al juego. Esta versión copia lugares de imagen fija (esquema 2 de la biblioteca): ``porPiezas`` se
acepta pero un lugar sin plantilla por piezas se copia de imagen fija, como en v3.
"""
import copy
import json
from dataclasses import dataclass

from rest_framework import status

from apps.simulation.models import (
    CaseCharacter,
    ClinicalTool,
    CollisionZone,
    MapObject,
    SceneMap,
    SimulationNode,
)
from apps.simulation.models.world import MAP_OBJECT_TYPES
from apps.simulation.services import case_rules
from shared.exceptions import ApiError
from shared.jsonutils import read_map

from . import geometria
from .geometria import ALTO_SALA, ANCHO_SALA
from .lugares import url_de_arte

#: El tema de las salas autoradas; el fondo de la biblioteca va encima, en ``ambient.backgroundImage``.
TEMA = "clinical-soft"
#: Las escenas se colocan en el grafo en una cuadrícula que no se solapa: ``COLUMNAS`` por fila, separación fija.
COLUMNAS, SEPARACION_X, SEPARACION_Y, ORIGEN_X, ORIGEN_Y = 4, 280, 200, 180, 180
MAX_SALAS = 40
#: Los objetos y herramientas de la biblioteca son iconos de 32 × 32.
TAMANO_OBJETO = 32
TAMANO_PERSONA = (48, 48)
#: La puerta ya está pintada en el fondo: su caja solo marca dónde se cruza. Es lo bastante chica para caber en la sala aunque
#: la puerta esté en el borde (x = 936, y = 486), que es donde la validación del mundo exige que quepa.
TAMANO_PUERTA = (24, 40)
FPS_POR_DEFECTO = 6
#: Material Symbols válidos (``apps/simulation/data/material_icons.json``) para el marcador de cada tipo.
ICONO_POR_TIPO = {"PERSON": "person", "EXIT": "door_front", "NOTE": "article", "RESOURCE": "description"}
ICONO_POR_DEFECTO = "inventory_2"
ICONO_HERRAMIENTA = "assignment"
COLOR = "#4FA3A5"
#: ``metadata.apoyo``: la posición del objeto es el punto donde apoya en el suelo (centro inferior), no el centro de su caja.
APOYO = "pies"
#: La orientación de la biblioteca (``mirando``) en la del caso (``facing``): las 4 de siempre más las 4 diagonales del
#: contrato x-siep 2.2 (sección 6). Una sin traducción queda mirando abajo.
MIRANDO = {
    "abajo": "down", "abajo-izquierda": "down-left", "izquierda": "left", "arriba-izquierda": "up-left",
    "arriba": "up", "arriba-derecha": "up-right", "derecha": "right", "abajo-derecha": "down-right",
}


@dataclass(frozen=True)
class ResumenCopia:
    """Lo que la copia escribió, para que quien llama pueda decírselo a la persona."""

    lugar_id: str
    salas: tuple
    nodos: int
    mapas: int
    muebles: int
    objetos: int
    personajes: int  # personas colocadas en las salas
    personajes_del_caso: int  # personajes distintos (CaseCharacter)
    puertas: int
    herramientas: int
    hitos: int


def _rechazar(mensaje):
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
    return ApiError("VALIDATION_ERROR", mensaje, status.HTTP_400_BAD_REQUEST, field="salas")


def validar_salas(lugar, salas):
    """Las salas pedidas como lista de ids: no vacía, sin repetidas y todas del lugar (400 con ``field: salas``)."""
    if not isinstance(salas, list) or not salas:
        raise _rechazar("Elige al menos una sala del lugar.")
    if len(salas) > MAX_SALAS:
        raise _rechazar(f"Un caso admite hasta {MAX_SALAS} salas.")
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
        clave, sufijo = base, 2
        while clave in self._usadas:
            clave, sufijo = f"{base}-{sufijo}", sufijo + 1
        self._usadas.add(clave)
        return clave


def _asignar_claves(sala, entradas=None):
    """Las claves de objeto de una sala en el orden exacto de la copia: muebles, objetos, personas y puertas.

    ``entradas`` son las salas elegidas (``id → entrada``): con ellas solo las puertas que llevan a una sala elegida
    reciben clave, como en la copia; sin ellas se cuentan todas las puertas.
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
    """``{"muebles", "objetos", "personajes", "puertas"}`` → las claves de objeto que la copia asigna en esa sala.

    Misma fuente que la copia. De las puertas devuelve las de todas (la copia solo crea las que llevan a una sala
    elegida, algo que aquí no se sabe): es un superconjunto.
    """
    return _asignar_claves(sala)


def _json(valor):
    return json.dumps(valor, ensure_ascii=False)


def _objeto(escena, clave, etiqueta, tipo, x, y, ancho, alto, **campos):
    if tipo not in MAP_OBJECT_TYPES:
        raise ApiError(
            "BIBLIOTECA_INVALIDA", "Un objeto del lugar tiene un tipo que el caso no admite.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    metadata = campos.pop("metadata", {})
    return MapObject(
        scene_map=escena, object_key=clave, label=etiqueta, object_type=tipo, position_x=x, position_y=y,
        width=ancho, height=alto, color_hex=COLOR, icon=ICONO_POR_TIPO.get(tipo, ICONO_POR_DEFECTO),
        metadata_json=_json(metadata), **campos,
    )


def _muebles(escena, sala, catalogo, lugar_id, claves):
    objetos, zonas = [], []
    for colocado, clave in zip(sala.get("muebles", []), claves):
        modelo = catalogo[colocado["ref"]]
        choca = bool(modelo["colision"])
        metadata = {"arte": url_de_arte(lugar_id, modelo["arte"]), "colision": choca, "apoyo": APOYO}
        if colocado.get("espejo"):
            metadata["espejo"] = True
        # El choque lo lleva SOLO la zona de abajo. ``collision`` del objeto va en falso: el servidor
        # (``world_service._position_blocked``) lee la caja de un objeto con choque como esquina superior izquierda, y la
        # posición de la biblioteca es el centro inferior, así que bloquearía una caja desplazada (un bloqueo fantasma).
        objetos.append(_objeto(
            escena, clave, modelo["nombre"], "PROP", colocado["x"], colocado["y"], modelo["ancho"], modelo["alto"],
            collision=False, metadata=metadata,
        ))
        if choca:
            # La caja de choque es la huella en el suelo: el punto de apoyo es su centro inferior. Con ``huella`` (esquema 3)
            # es la base del mueble (ancho × fondo); sin ella, la caja entera del dibujo, como siempre.
            huella = modelo.get("huella")
            ancho, fondo = (huella["ancho"], huella["fondo"]) if isinstance(huella, dict) else (modelo["ancho"], modelo["alto"])
            zonas.append(CollisionZone(
                scene_map=escena, zone_key=f"choque-{clave}", label=modelo["nombre"],
                position_x=colocado["x"] - ancho // 2, position_y=colocado["y"] - fondo, width=ancho, height=fondo,
            ))
    return objetos, zonas


def _punto(entrada):
    """La entrada de una sala como ``{x, y}``: la biblioteca la trae así o como ``[x, y]`` (esquema 3 de P1)."""
    if isinstance(entrada, (list, tuple)):
        return {"x": entrada[0], "y": entrada[1]}
    return {"x": entrada["x"], "y": entrada["y"]}


def _paredes(escena, sala):
    """Las paredes y bordes del encuadre de la sala: lo que el dibujo ya muestra como pared, ahora también en el mundo."""
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
            escena, clave, modelo["nombre"], modelo["tipo"], colocado["x"], colocado["y"],
            TAMANO_OBJETO, TAMANO_OBJETO,
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
        ancho, alto = TAMANO_PERSONA
        resultado.append(_objeto(
            escena, clave, info["nombre"], "PERSON", colocado["x"], colocado["y"], ancho, alto,
            interaction_prompt="Hablar", facing=MIRANDO.get(colocado.get("mirando"), "down"),
            character=caracteres[colocado["ref"]], metadata=metadata,
        ))
    return resultado


def _puertas(escena, sala, entradas, claves):
    """Las puertas hacia salas elegidas; las otras no se crean. ``claves`` son las de las puertas elegidas, en orden
    (``_asignar_claves``)."""
    resultado = []
    elegidas = [puerta for puerta in sala.get("puertas", []) if puerta["hacia"] in entradas]  # las otras no se crean
    for puerta, clave in zip(elegidas, claves):
        destino = entradas[puerta["hacia"]]
        ancho, alto = TAMANO_PUERTA
        metadata = {"targetNodeKey": puerta["hacia"], "entryX": destino["x"], "entryY": destino["y"]}
        x, y = puerta["x"], puerta["y"]
        metadata["pintada"] = True
        resultado.append(_objeto(
            escena, clave, puerta["etiqueta"], "EXIT", x, y, ancho, alto,
            interaction_prompt=puerta["etiqueta"], metadata=metadata,
        ))
    return resultado


def _personajes_del_caso(case_version, lugar, elegidas):
    """Un ``CaseCharacter`` por personaje del lugar que aparece en alguna sala elegida, en el orden en que aparece."""
    por_id = {personaje["id"]: personaje for personaje in lugar.get("personajes", [])}
    caracteres = {}
    for sala in elegidas:
        for colocado in sala.get("personajes", []):
            ref = colocado["ref"]
            if ref in caracteres:
                continue
            info = por_id[ref]
            caracteres[ref] = CaseCharacter.objects.create(
                case_version=case_version, character_key=ref, display_name=info["nombre"],
                role_label=info.get("rol", ""), display_order=len(caracteres),
            )
    return caracteres


def _herramientas(case_version, lugar):
    herramientas = [
        ClinicalTool(
            case_version=case_version, tool_code=herramienta["id"], label=herramienta["nombre"],
            icon=ICONO_HERRAMIENTA, category="clinical", description=herramienta.get("descripcion", ""), active=True,
        )
        for herramienta in lugar.get("catalogo", {}).get("herramientas", [])
    ]
    ClinicalTool.objects.bulk_create(herramientas)
    return len(herramientas)


def _reglas(case_version, lugar):
    """Los hitos y el nivel de riesgo del lugar en ``rules`` (las demás claves de las reglas se conservan)."""
    reglas = read_map(case_version.rules)
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
    case_version.rules = _json(reglas)
    case_version.save(update_fields=["rules"])
    return len(hitos)


def copiar_al_caso(case_version, lugar, salas):
    """Copia ``salas`` (ids, en orden) del ``lugar`` cargado a ``case_version``; devuelve el ``ResumenCopia``.

    Debe llamarse dentro de la transacción que crea el borrador: si algo falla no queda una copia a medias.
    """
    ids = validar_salas(lugar, salas)
    # La copia trabaja sobre su propia copia del lugar: nada de lo que se escribe puede alcanzar (ni ser alcanzado por) el
    # diccionario de quien llama, ni siquiera si éste se muta mientras la copia corre.
    lugar = copy.deepcopy(lugar)
    lugar_id = lugar["id"]
    por_id = {sala["id"]: sala for sala in lugar["salas"]}
    elegidas = [por_id[id_] for id_ in ids]
    entradas = {sala["id"]: _punto(sala["entrada"]) for sala in elegidas}
    catalogo = lugar.get("catalogo", {})
    muebles = {m["id"]: m for m in catalogo.get("muebles", [])}
    objetos = {o["id"]: o for o in catalogo.get("objetos", [])}
    personajes = {p["id"]: p for p in lugar.get("personajes", [])}
    caracteres = _personajes_del_caso(case_version, lugar, elegidas)

    cuenta = {"muebles": 0, "objetos": 0, "personajes": 0, "puertas": 0}
    for posicion, sala in enumerate(elegidas):
        nodo = SimulationNode.objects.create(
            case_version=case_version, node_key=sala["id"], title=sala["nombre"], narrative=sala["descripcion"],
            support_resources_json="[]", required_tools_json="[]", start_node=posicion == 0, terminal_node=False,
            position_x=ORIGEN_X + (posicion % COLUMNAS) * SEPARACION_X,
            position_y=ORIGEN_Y + (posicion // COLUMNAS) * SEPARACION_Y, display_order=posicion,
        )
        ambiente = {
            "backgroundImage": url_de_arte(lugar_id, sala["fondo"]), "encuadre": sala["encuadre"],
            "salaId": sala["id"], "lugarId": lugar_id,
        }
        entrada = entradas[sala["id"]]
        escena = SceneMap.objects.create(
            case_version=case_version, node=nodo, map_key=f"sala-{sala['id']}", title=sala["nombre"],
            width=ANCHO_SALA, height=ALTO_SALA, theme=TEMA, spawn_x=entrada["x"], spawn_y=entrada["y"],
            ambient_json=_json(ambiente),
        )
        claves = _asignar_claves(sala, entradas)
        de_muebles, zonas = _muebles(escena, sala, muebles, lugar_id, claves["muebles"])
        de_objetos = _objetos(escena, sala, objetos, lugar_id, claves["objetos"])
        de_personas = _personas(escena, sala, personajes, caracteres, claves["personajes"])
        de_puertas = _puertas(escena, sala, entradas, claves["puertas"])
        MapObject.objects.bulk_create(de_muebles + de_objetos + de_personas + de_puertas)
        CollisionZone.objects.bulk_create(_paredes(escena, sala) + zonas)
        cuenta["muebles"] += len(de_muebles)
        cuenta["objetos"] += len(de_objetos)
        cuenta["personajes"] += len(de_personas)
        cuenta["puertas"] += len(de_puertas)

    herramientas = _herramientas(case_version, lugar)
    hitos = _reglas(case_version, lugar)
    return ResumenCopia(
        lugar_id=lugar_id, salas=tuple(ids), nodos=len(ids), mapas=len(ids), personajes_del_caso=len(caracteres),
        herramientas=herramientas, hitos=hitos, **cuenta,
    )

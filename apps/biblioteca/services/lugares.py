"""Lee la biblioteca de lugares del disco (P1/P4, esquema 2) y la presenta al editor de casos.

``<BIBLIOTECA_DIR>/escenarios/indice.json`` nombra los lugares y cada ``escenarios/<lugar>/escenario.json`` trae sus salas,
catálogo, hitos y personajes. Se lee del disco **en cada petición** (son tres archivos pequeños): no hay caché que pueda
devolver un diccionario compartido, así que lo que sale de aquí es siempre una copia nueva que el llamador puede mutar.

Solo se sirve un lugar que el índice nombra (un id fuera de él, o con forma rara, es 404 sin tocar el disco): el id
nunca arma una ruta por sí solo. Ninguna respuesta lleva rutas del servidor; el arte (``arte``, ``fondo``, ``hoja``) se
traduce a su URL pública bajo ``/assets/biblioteca/escenarios/<lugar>/…``, la que sirve el frontend.
"""

import copy
import json
import logging
import re
from pathlib import Path, PurePosixPath

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import NotFound

from apps.simulation.services.contracts import ApiError

logger = logging.getLogger(__name__)

#: Donde el frontend publica el arte de la biblioteca (``frontend/src/assets/biblioteca``).
URL_BASE = "/assets/biblioteca/escenarios"
#: Donde el frontend publica ``biblioteca/`` entera: el arte de ``piezas/...`` cuelga de aquí.
URL_PIEZAS = "/assets/biblioteca"
#: La forma de un id de la biblioteca (``clave`` del esquema): minúsculas, números y guiones sueltos.
_CLAVE = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
_MAX_ID = 60

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
_NO_DISPONIBLE = "La biblioteca de lugares no está disponible en este momento."
_NO_EXISTE = "Ese lugar no está en la biblioteca."


def url_de_arte(lugar_id, ruta):
    """La URL pública de una imagen del lugar.

    ``arte/...`` es relativa a la carpeta del lugar (``/assets/biblioteca/escenarios/<lugar>/...``); ``piezas/...`` (esquema 3)
    es del catálogo de piezas, compartido por todos los lugares (``/assets/biblioteca/piezas/...``).
    """
    if (
        not isinstance(ruta, str)
        or not ruta
        or "\\" in ruta
        or PurePosixPath(ruta).is_absolute()
        or ".." in PurePosixPath(ruta).parts
        or ":" in ruta
    ):
        raise ApiError(
            "BIBLIOTECA_NO_DISPONIBLE",
            _NO_DISPONIBLE,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if ruta.startswith("piezas/"):
        return f"{URL_PIEZAS}/{ruta}"
    return f"{URL_BASE}/{lugar_id}/{ruta}"


def _carpeta():
    return Path(settings.BIBLIOTECA_DIR) / "escenarios"


def _leer(ruta):
    """El JSON de un archivo de la biblioteca; si falta o está roto es un 503 que no nombra rutas."""
    try:
        if not ruta.resolve().is_relative_to(_carpeta().resolve()):
            raise OSError("Ruta fuera del catálogo")
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        logger.error(
            "biblioteca_no_disponible",
            extra={"fields": {"archivo": ruta.name, "causa": type(error).__name__}},
        )
        raise ApiError(
            "BIBLIOTECA_NO_DISPONIBLE",
            _NO_DISPONIBLE,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        ) from None


def _indice():
    indice = _leer(_carpeta() / "indice.json")
    lugares = indice.get("lugares") if isinstance(indice, dict) else None
    return (
        [entrada for entrada in lugares if isinstance(entrada, dict)]
        if isinstance(lugares, list)
        else []
    )


def listar_lugares():
    """Los lugares del índice, en su orden, listos para el selector del editor.

    Cada uno trae las cifras del índice (``salas`` y ``hitos`` son cuántas hay) más ``descripcion``,
    ``nivelRiesgoPorDefecto`` y ``portada`` (la URL del fondo de su primera sala) para pintar una tarjeta.
    """
    resultado = []
    for entrada in _indice():
        lugar = cargar_lugar(entrada["id"])
        salas = lugar.get("salas") or []
        resultado.append(
            {
                "id": lugar["id"],
                "nombre": entrada.get("nombre", lugar.get("nombre")),
                "descripcion": lugar.get("descripcion", ""),
                "salas": entrada.get("salas", len(salas)),
                "completo": entrada.get("completo", lugar.get("completo", False)),
                "arteProvisional": entrada.get(
                    "arteProvisional", lugar.get("arteProvisional", False)
                ),
                "temas": list(entrada.get("temas", lugar.get("temas", []))),
                "hitos": entrada.get("hitos", len(lugar.get("hitos") or [])),
                "nivelRiesgoPorDefecto": lugar.get("nivelRiesgoPorDefecto"),
                "portada": _portada(lugar["id"], salas),
            }
        )
    return resultado


def _portada(lugar_id, salas):
    """La URL del fondo de la primera sala de imagen fija; una sala por piezas (esquema 3) no tiene imagen propia."""
    fondo = next((sala["fondo"] for sala in salas if isinstance(sala.get("fondo"), str)), None)
    return url_de_arte(lugar_id, fondo) if fondo else None


def cargar_lugar(lugar_id, por_piezas=False):
    """El escenario del lugar tal como está en el archivo (rutas de arte relativas), como una copia nueva.

    Con ``por_piezas`` se lee ``escenario-piezas.json`` (esquema 3: cada sala trae su ``estructura``) si el lugar lo tiene; un
    lugar sin plantilla por piezas (o el hospital, que solo existe por piezas y vive en ``escenario.json``) se lee como siempre.

    404 si el id no tiene la forma de un id de la biblioteca o el índice no lo nombra.
    """
    if (
        not isinstance(lugar_id, str)
        or len(lugar_id) > _MAX_ID
        or not _CLAVE.fullmatch(lugar_id)
    ):
        raise NotFound(_NO_EXISTE)
    if lugar_id not in {entrada.get("id") for entrada in _indice()}:
        raise NotFound(_NO_EXISTE)
    alternativo = _carpeta() / lugar_id / "escenario-piezas.json"
    archivo = alternativo if por_piezas and alternativo.exists() else _carpeta() / lugar_id / "escenario.json"
    escenario = _leer(archivo)
    if (
        not isinstance(escenario, dict)
        or escenario.get("id") != lugar_id
        or (archivo == alternativo and escenario.get("esquema") != 3)
    ):
        logger.error(
            "biblioteca_no_disponible",
            extra={"fields": {"archivo": archivo.name, "causa": "id_o_esquema"}},
        )
        raise ApiError(
            "BIBLIOTECA_NO_DISPONIBLE",
            _NO_DISPONIBLE,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return escenario


def lugar_publico(lugar):
    """Una copia del lugar con cada ruta de arte convertida en su URL pública (lo que se manda al editor)."""
    publico = copy.deepcopy(lugar)
    lugar_id = publico["id"]
    for sala in publico.get("salas", []):
        if isinstance(sala.get("fondo"), str):  # una sala por piezas trae ``estructura`` en vez de ``fondo``
            sala["fondo"] = url_de_arte(lugar_id, sala["fondo"])
    catalogo = publico.get("catalogo", {})
    for grupo in ("muebles", "objetos", "herramientas"):
        for elemento in catalogo.get(grupo, []):
            if "arte" in elemento:
                elemento["arte"] = url_de_arte(lugar_id, elemento["arte"])
            animacion = elemento.get("animacionCerca")
            if isinstance(animacion, dict) and "hoja" in animacion:
                animacion["hoja"] = url_de_arte(lugar_id, animacion["hoja"])
    return publico

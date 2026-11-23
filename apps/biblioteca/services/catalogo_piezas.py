"""El catálogo de piezas de la biblioteca, tal como lo necesita el servidor (contrato x-siep 2.2, sección 2.2).

Lo escribe el motor de arte de P1 en ``biblioteca/piezas/manifiesto.json`` (esquema 2). El servidor no dibuja: de cada pieza
(``"<tipo>/<modelo>"``) lee solo los muros donde puede ir, cuánto ocupa a lo largo del muro y su ``franja`` de altura sobre
el piso; de los pisos y los muros, las claves; de ``propios``, las rutas. Con eso juzgan las reglas OCL-13, 14 y 18.

Si el archivo falta o está roto, ``cargar_catalogo`` devuelve ``None`` y la regla OCL-18 lo dice: una sala por piezas no
puede validarse sin catálogo. La ruta sale de ``settings.BIBLIOTECA_PIEZAS_MANIFIESTO`` o, sin ella, de
``<BIBLIOTECA_DIR>/piezas/manifiesto.json``.
"""
import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PiezaCatalogo:
    """Una pieza del catálogo: dónde puede ir, cuánto ocupa a lo largo del muro y a qué altura (``franja``)."""

    clave: str
    muros: frozenset
    ocupa: int
    franja: tuple

    @property
    def tipo(self):
        return self.clave.split("/", 1)[0]

    @property
    def es_puerta(self):
        return self.tipo == "puerta"

    @property
    def de_suelo(self):
        return self.muros == frozenset({"suelo"})


@dataclass(frozen=True)
class Catalogo:
    anchos: tuple
    bordes: dict
    piezas: dict
    pisos: frozenset  # los tipos: "vinilo", "madera"…
    claves_de_pisos: frozenset  # "<piso>-<variante>": "vinilo-a", "damero-universidad-cafeteria"…
    muros: frozenset  # "<acabado>/<paleta>"
    propios: frozenset
    tapetes: frozenset

    def tiene_piso(self, piso, variante="a"):
        return f"{piso}-{variante}" in self.claves_de_pisos

    def tiene_muro(self, acabado, paleta):
        return f"{acabado}/{paleta}" in self.muros


def ruta_vigente():
    configurada = getattr(settings, "BIBLIOTECA_PIEZAS_MANIFIESTO", None)
    return Path(configurada) if configurada else Path(settings.BIBLIOTECA_DIR) / "piezas" / "manifiesto.json"


def _pieza(clave, entrada):
    franja = entrada.get("franja") or (0, 0)
    return PiezaCatalogo(
        clave=clave, muros=frozenset(entrada.get("muros") or ()), ocupa=int(entrada.get("ocupa") or 0),
        franja=(int(franja[0]), int(franja[1])),
    )


def _leer(ruta):
    datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    geometria = datos.get("geometria") or {}
    claves_de_pisos = frozenset(datos.get("pisos") or ())
    return Catalogo(
        anchos=tuple(int(a) for a in geometria.get("anchos") or ()),
        bordes={int(a): int(b) for a, b in (geometria.get("borde") or {}).items()},
        piezas={clave: _pieza(clave, entrada) for clave, entrada in (datos.get("piezas") or {}).items()},
        # El tipo de piso no lleva guiones; la variante sí puede llevarlos (``universidad-cafeteria``).
        pisos=frozenset(clave.partition("-")[0] for clave in claves_de_pisos),
        claves_de_pisos=claves_de_pisos,
        muros=frozenset(datos.get("muros") or ()),
        propios=frozenset(datos.get("propios") or ()),
        tapetes=frozenset(datos.get("tapetes") or ()),
    )


@lru_cache(maxsize=4)
def _cargar(ruta, _marca):
    try:
        return _leer(ruta)
    except (OSError, ValueError, TypeError, AttributeError, KeyError, IndexError) as error:
        logger.error("catalogo_piezas_no_disponible", extra={"fields": {"causa": type(error).__name__}})
        return None


def cargar_catalogo(ruta=None):
    """El catálogo del manifiesto en ``ruta`` (o el vigente), o ``None`` si no existe o no se puede leer.

    Se guarda en memoria mientras el archivo no cambie (la marca es su fecha de modificación).
    """
    ruta = Path(ruta) if ruta is not None else ruta_vigente()
    try:
        marca = ruta.stat().st_mtime_ns
    except OSError:
        return None
    return _cargar(str(ruta), marca)


cargar_catalogo.cache_clear = _cargar.cache_clear


def catalogo_vigente():
    return cargar_catalogo()

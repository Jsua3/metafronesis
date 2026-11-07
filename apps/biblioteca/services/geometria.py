"""Geometría de las salas de la biblioteca: el lienzo, la zona caminable de cada encuadre y las paredes que la rodean.

**Una sola tabla, en cuatro lugares.** La zona caminable por encuadre es la del generador de la biblioteca
(``biblioteca/scripts/geometria.mjs``) y la del editor (``frontend/src/app/features/autoria/modelo/geometria.ts``); el juego
la lee del editor. ``test_geometria_encuadres.py`` falla si alguna copia deja de coincidir con ésta.

La copia de un lugar al caso (``copiar_al_caso``) escribe como ``CollisionZone`` lo que queda FUERA de la zona caminable
—la pared del fondo, las laterales si el encuadre las tiene, y los bordes abiertos—: así el servidor rechaza al jugador
donde el fondo pintado dice que hay pared y el cliente, que lee las mismas zonas, no propone esa posición.
"""

from dataclasses import dataclass

#: La sala mide lo que el juego (``AUTHORED_ROOM_WIDTH/HEIGHT``).
ANCHO_SALA, ALTO_SALA = 960, 528

#: Zona caminable de cada encuadre, en px de sala: ``(x, y, ancho, alto)``. Con una pared lateral el borde del piso está
#: en 96 (o 864); sin ella se abre hasta 24 px del lienzo.
ZONAS = {
    "tres-paredes": (96, 236, 768, 250),
    "dos-paredes-izquierda": (96, 236, 840, 250),
    "dos-paredes-derecha": (24, 236, 840, 250),
    "una-pared": (24, 236, 912, 250),
}

#: ¿Tiene pared pintada a la izquierda / a la derecha? Sin ella, esa franja es solo el borde abierto del piso.
LATERALES = {
    "tres-paredes": (True, True),
    "dos-paredes-izquierda": (True, False),
    "dos-paredes-derecha": (False, True),
    "una-pared": (False, False),
}


@dataclass(frozen=True)
class Pared:
    """Un rectángulo de la sala por donde no se camina; ``clave`` es el ``zone_key`` de su ``CollisionZone``."""

    clave: str
    etiqueta: str
    x: int
    y: int
    ancho: int
    alto: int


def zona_caminable(encuadre):
    """``(x, y, ancho, alto)`` de la zona caminable del encuadre (``KeyError`` si no existe)."""
    return ZONAS[encuadre]


def paredes(encuadre):
    """Los rectángulos que rodean a la zona caminable, en el orden fondo, izquierda, derecha, delantero.

    Juntos con la zona cubren la sala entera, sin solaparse (las laterales van entre el fondo y el borde delantero). Una franja lateral sin ancho no se crea.
    """
    x, y, ancho, alto = zona_caminable(encuadre)
    con_pared_izquierda, con_pared_derecha = LATERALES[encuadre]
    derecha = x + ancho
    resultado = [Pared("pared-fondo", "Pared del fondo", 0, 0, ANCHO_SALA, y)]
    if x > 0:
        clave, etiqueta = (
            ("pared-izquierda", "Pared izquierda")
            if con_pared_izquierda
            else ("borde-izquierdo", "Borde izquierdo")
        )
        resultado.append(Pared(clave, etiqueta, 0, y, x, alto))
    if derecha < ANCHO_SALA:
        clave, etiqueta = (
            ("pared-derecha", "Pared derecha")
            if con_pared_derecha
            else ("borde-derecho", "Borde derecho")
        )
        resultado.append(Pared(clave, etiqueta, derecha, y, ANCHO_SALA - derecha, alto))
    if y + alto < ALTO_SALA:
        resultado.append(
            Pared(
                "borde-delantero",
                "Borde delantero",
                0,
                y + alto,
                ANCHO_SALA,
                ALTO_SALA - (y + alto),
            )
        )
    return resultado

/**
 * Geometría de las «salas por piezas»: una sola proyección para el piso, los muros y las piezas.
 *
 * Es el espejo de `tools/escenarios/piezas_geo.py` y debe dar exactamente lo mismo: lo comprueba
 * `scripts/world-art/salas-geometria.test.mjs` contra la referencia que escribe `tools/escenarios/piezas_referencia.py`.
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 *
 * La sala mide 528 px de alto y su ancho es uno de `ANCHOS`. Una pieza de muro se ubica con (muro, pos): `pos` es la
 * distancia en px a lo largo del muro, desde la izquierda en `fondo` y `camara`, y desde el fondo hacia la cámara en
 * `izquierda` y `derecha`.
 */

export type Muro = 'fondo' | 'izquierda' | 'derecha' | 'camara';
export type Encuadre = 'tres-paredes' | 'dos-paredes-izquierda' | 'dos-paredes-derecha' | 'una-pared';
export type Momento = 'dia' | 'noche';

export const ANCHOS: readonly number[] = [960, 1200, 1440, 1680, 1920];
export const ALTO = 528;
/** y donde el muro del fondo se junta con el piso. */
export const SEAM = 230;
/** y del borde superior del muro del fondo. */
export const TOP = 84;
/** px de piso, del muro del fondo al borde de la cámara. */
export const FONDO = ALTO - SEAM;
export const ALTO_MURO = SEAM - TOP;
/** px de lienzo que quedan por fuera de un muro lateral, abajo. */
export const MARGEN = 24;
export const REJILLA = 8;
export const MUROS: readonly Muro[] = ['fondo', 'izquierda', 'derecha', 'camara'];
/** Ancho de las imágenes maestras de piso y de muro, de las que cada sala es un recorte central. */
export const ANCHO_MAESTRA = 1920;
/** Alto de la maestra del muro del fondo: el muro más 6 px de canto, pegada en y = TOP − 6. */
export const ALTO_MAESTRA_MURO = ALTO_MURO + 6;

const ENCUADRES: Record<Encuadre, readonly [boolean, boolean]> = {
  'tres-paredes': [true, true],
  'dos-paredes-izquierda': [true, false],
  'dos-paredes-derecha': [false, true],
  'una-pared': [false, false],
};

export function esAncho(ancho: unknown): ancho is number {
  return typeof ancho === 'number' && ANCHOS.includes(ancho);
}

export function esEncuadre(encuadre: unknown): encuadre is Encuadre {
  return typeof encuadre === 'string' && Object.hasOwn(ENCUADRES, encuadre);
}

function comprobarAncho(ancho: number): number {
  if (!esAncho(ancho)) throw new Error(`ancho ${ancho} fuera del catálogo ${ANCHOS.join(', ')}`);
  return ancho;
}

/** Entero más cercano a n/d, con las mitades hacia arriba: el redondeo del contrato x-siep 2.2 (sección 1.2). */
export function redondear(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/** x donde un muro lateral se junta con el del fondo: 96 a 960 px, 172 a 1920 px. */
export function borde(ancho: number): number {
  return 96 + Math.floor((19 * (comprobarAncho(ancho) - 960)) / 240);
}

/** [¿hay muro a la izquierda?, ¿a la derecha?]. */
export function laterales(encuadre: Encuadre): [boolean, boolean] {
  const [izquierda, derecha] = ENCUADRES[encuadre];
  return [izquierda, derecha];
}

/** [x izquierda, x derecha] del muro del fondo. */
export function limites(encuadre: Encuadre, ancho: number): [number, number] {
  const [izquierda, derecha] = ENCUADRES[encuadre];
  const b = borde(ancho);
  return [izquierda ? b : 0, derecha ? ancho - b : ancho];
}

/** [x0, x1] del recorte central de una maestra para una sala de ese ancho. */
export function recorteDeMaestra(ancho: number): [number, number] {
  const mitad = comprobarAncho(ancho) / 2;
  return [ANCHO_MAESTRA / 2 - mitad, ANCHO_MAESTRA / 2 + mitad];
}

/** [x, y, ancho, alto] de la zona caminable. */
export function zonaCaminable(encuadre: Encuadre, ancho: number): [number, number, number, number] {
  const [izquierda, derecha] = ENCUADRES[encuadre];
  const b = borde(ancho);
  const x0 = izquierda ? b : MARGEN;
  const x1 = derecha ? ancho - b : ancho - MARGEN;
  return [x0, 236, x1 - x0, 250];
}

/** Largo en px del muro; 0 si el encuadre no lo tiene. */
export function largoMuro(muro: Muro, encuadre: Encuadre, ancho: number): number {
  const [izquierda, derecha] = ENCUADRES[encuadre];
  if (muro === 'fondo' || muro === 'camara') {
    const [xl, xr] = limites(encuadre, ancho);
    return xr - xl;
  }
  return (muro === 'izquierda' ? izquierda : derecha) ? FONDO : 0;
}

/** Punto de apoyo en pantalla de una pieza puesta en (muro, pos): el `ancla` del contrato x-siep 2.2 (sección 1.4). */
export function enPantalla(muro: Muro, pos: number, encuadre: Encuadre, ancho: number): [number, number] {
  const [xl] = limites(encuadre, ancho);
  if (muro === 'fondo') return [xl + pos, SEAM];
  if (muro === 'camara') {
    const cx = Math.floor(ancho / 2);
    return [cx + redondear((xl + pos - cx) * 19, 16), ALTO];   // 19/16: la escala crece de 1 en el fondo a 1 + 3/16 en la cámara
  }
  const b = borde(ancho);
  const x = b - redondear(pos * (b - MARGEN), FONDO);
  return [muro === 'izquierda' ? x : ancho - x, SEAM + pos];
}

/**
 * Umbral de la puerta que está en (muro, pos): su ancla traída a la zona caminable con los márgenes del contrato
 * (16 px a los lados; y entre 260 y 476, sección 1.5). Ahí mide el juego la cercanía y ahí queda parado quien llega por ella.
 */
export function llegada(muro: Muro, pos: number, encuadre: Encuadre, ancho: number): [number, number] {
  const [x, y] = enPantalla(muro, pos, encuadre, ancho);
  const [x0, y0, w, h] = zonaCaminable(encuadre, ancho);
  return [Math.min(Math.max(x, x0 + 16), x0 + w - 16), Math.min(Math.max(y, y0 + 24), y0 + h - 10)];
}

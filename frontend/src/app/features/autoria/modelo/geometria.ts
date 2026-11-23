/**
 * Geometría de las salas (contrato `.superpowers/contratos/x-siep-2.2.md`, sección 1): alto de 528, ancho de 960 a 1920,
 * zona caminable, muros y dónde cae una pieza puesta en un muro. La fuente es el servidor
 * (`apps/biblioteca/services/geometria.py`); esta copia y la del validador de la biblioteca (`biblioteca/scripts/geometria.mjs`)
 * reproducen su tabla dorada (`geometria-salas.fixture.ts`, la prueba es `geometria.spec.ts`). Todo es aritmética entera con
 * `redondear` (mitades hacia +∞), así las copias dan los mismos píxeles. A 960 px es la tabla fija de antes.
 *
 * Es también la fuente que lee el juego (`simulator/room-ambient.util.ts`) para que las personas que deambulan no salgan de la
 * zona; las paredes del servidor salen de la misma definición.
 */
import type { Encuadre } from './escenario';

export const ANCHOS = [960, 1200, 1440, 1680, 1920];
export const ANCHO_SALA = 960;
export const ALTO_SALA = 528;
/** y de la línea donde el muro del fondo toca el piso, y profundidad del piso (largo de un muro lateral). */
export const PISO = 230;
export const FONDO = ALTO_SALA - PISO;
const MARGEN = 24;
const ZONA_Y = 236;
const ZONA_ALTO = 250;
/** Holguras de la llegada: el pie del jugador mide 22 × 16 y se ancla 16 px por encima del punto. */
const LLEGADA_X = 16;
const LLEGADA_ARRIBA = 24;
const LLEGADA_ABAJO = 10;

export type Muro = 'fondo' | 'izquierda' | 'derecha' | 'camara';
export const MUROS: readonly Muro[] = ['fondo', 'izquierda', 'derecha', 'camara'];

export interface Zona {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface Punto {
  x: number;
  y: number;
}

export interface Pared extends Zona {
  clave: string;
  etiqueta: string;
}

/** ¿Tiene muro a la izquierda / a la derecha? */
const LATERALES: Record<Encuadre, readonly [boolean, boolean]> = {
  'tres-paredes': [true, true],
  'dos-paredes-izquierda': [true, false],
  'dos-paredes-derecha': [false, true],
  'una-pared': [false, false],
};

/** ¿Es el nombre de un encuadre que conocemos? (el juego lo lee de un registro libre, así que no se fía del tipo). */
export function esEncuadre(valor: unknown): valor is Encuadre {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(LATERALES, valor);
}

/** ¿Es un ancho del catálogo? */
export function esAnchoDeSala(valor: unknown): valor is number {
  return typeof valor === 'number' && ANCHOS.includes(valor);
}

/** `n / d` al entero más cercano, con las mitades hacia +∞ (igual que `redondear` del servidor). */
export function redondear(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/** x donde un muro lateral se junta con el del fondo: 96 a 960 px … 172 a 1920 px. */
export function borde(ancho: number): number {
  if (!esAnchoDeSala(ancho)) throw new Error(`Ancho fuera del catálogo: ${ancho}`);
  return 96 + Math.floor((19 * (ancho - 960)) / 240);
}

/** `[xl, xr]`: los extremos del muro del fondo. */
export function limites(encuadre: Encuadre, ancho = ANCHO_SALA): [number, number] {
  const [izquierda, derecha] = LATERALES[encuadre];
  const b = borde(ancho);
  return [izquierda ? b : 0, derecha ? ancho - b : ancho];
}

export function zonaCaminable(encuadre: Encuadre, ancho = ANCHO_SALA): Zona {
  const [izquierda, derecha] = LATERALES[encuadre];
  const b = borde(ancho);
  const x0 = izquierda ? b : MARGEN;
  const x1 = derecha ? ancho - b : ancho - MARGEN;
  return { x: x0, y: ZONA_Y, ancho: x1 - x0, alto: ZONA_ALTO };
}

/** Largo del muro en px; 0 si el encuadre no lo tiene. */
export function largoMuro(muro: Muro, encuadre: Encuadre, ancho = ANCHO_SALA): number {
  const [izquierda, derecha] = LATERALES[encuadre];
  if (muro === 'fondo' || muro === 'camara') {
    const [xl, xr] = limites(encuadre, ancho);
    return xr - xl;
  }
  return (muro === 'izquierda' ? izquierda : derecha) ? FONDO : 0;
}

/** Punto de apoyo en pantalla (centro inferior del dibujo) de una pieza puesta en `(muro, pos)`. */
export function ancla(muro: Muro, pos: number, encuadre: Encuadre, ancho = ANCHO_SALA): Punto {
  const [xl] = limites(encuadre, ancho);
  if (muro === 'fondo') return { x: xl + pos, y: PISO };
  if (muro === 'camara') {
    const centro = Math.floor(ancho / 2);
    return { x: centro + redondear((xl + pos - centro) * 19, 16), y: ALTO_SALA };
  }
  const b = borde(ancho);
  const x = b - redondear(pos * (b - MARGEN), FONDO);
  return { x: muro === 'izquierda' ? x : ancho - x, y: PISO + pos };
}

/** Dónde queda parado el personaje junto a la puerta puesta en `(muro, pos)`: su ancla traída dentro de la zona. */
export function llegada(muro: Muro, pos: number, encuadre: Encuadre, ancho = ANCHO_SALA): Punto {
  const a = ancla(muro, pos, encuadre, ancho);
  const z = zonaCaminable(encuadre, ancho);
  return {
    x: Math.min(Math.max(a.x, z.x + LLEGADA_X), z.x + z.ancho - LLEGADA_X),
    y: Math.min(Math.max(a.y, z.y + LLEGADA_ARRIBA), z.y + z.alto - LLEGADA_ABAJO),
  };
}

/** Lo que queda fuera de la zona caminable, en el orden fondo, izquierda, derecha, delantero (las colisiones del servidor). */
export function paredes(encuadre: Encuadre, ancho = ANCHO_SALA): Pared[] {
  const z = zonaCaminable(encuadre, ancho);
  const [conIzquierda, conDerecha] = LATERALES[encuadre];
  const derecha = z.x + z.ancho;
  const resultado: Pared[] = [{ clave: 'pared-fondo', etiqueta: 'Pared del fondo', x: 0, y: 0, ancho, alto: z.y }];
  if (z.x > 0) {
    resultado.push(conIzquierda
      ? { clave: 'pared-izquierda', etiqueta: 'Pared izquierda', x: 0, y: z.y, ancho: z.x, alto: z.alto }
      : { clave: 'borde-izquierdo', etiqueta: 'Borde izquierdo', x: 0, y: z.y, ancho: z.x, alto: z.alto });
  }
  if (derecha < ancho) {
    resultado.push(conDerecha
      ? { clave: 'pared-derecha', etiqueta: 'Pared derecha', x: derecha, y: z.y, ancho: ancho - derecha, alto: z.alto }
      : { clave: 'borde-derecho', etiqueta: 'Borde derecho', x: derecha, y: z.y, ancho: ancho - derecha, alto: z.alto });
  }
  if (z.y + z.alto < ALTO_SALA) {
    resultado.push({
      clave: 'borde-delantero', etiqueta: 'Borde delantero', x: 0, y: z.y + z.alto, ancho, alto: ALTO_SALA - (z.y + z.alto),
    });
  }
  return resultado;
}

const limitar = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)));

/**
 * Lleva un punto de apoyo al borde de la zona si se sale. `medioAncho` es la mitad del ancho
 * de la caja de un mueble: así el mueble entero queda dentro, como pide el validador de P1.
 */
export function limitarAZona(zona: Zona, x: number, y: number, medioAncho = 0): { x: number; y: number } {
  return {
    x: limitar(x, zona.x + medioAncho, zona.x + zona.ancho - medioAncho),
    y: limitar(y, zona.y, zona.y + zona.alto),
  };
}

export function centroDeZona(zona: Zona): { x: number; y: number } {
  return { x: Math.round(zona.x + zona.ancho / 2), y: Math.round(zona.y + zona.alto / 2) };
}

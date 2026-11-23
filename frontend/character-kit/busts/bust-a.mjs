/**
 * Maniquí de retrato (busto) — complexión A. Cuadro 32×32, de frente, que el
 * juego muestra a ×3 (caja de 96 px). Estilo tierno y de poco detalle
 * (aprobado el 2026-10-03): cabeza grande y redonda, barbilla corta, hombros
 * pequeños. Simétrico respecto a x = 15,5 (columna x ↔ 31 − x).
 *
 * Etiquetas: H cabeza, e/E orejas, N cuello, T hombros/torso. El borde del
 * cuadro queda vacío: el busto se corta en y = 29 y el contorno ocupa y = 30.
 */

import { gridFrom } from '../raster.mjs';

export const PORTRAIT_FRAME = { width: 32, height: 32, pivotX: 15.5 };

const CX = 15.5;

/** Medio ancho del cráneo por fila (null = fuera de la cabeza). */
export function headHalfWidth(y) {
  if (y < 4 || y > 24) return null;
  if (y <= 14) return 8.5 * Math.sqrt(Math.max(0, 1 - ((14 - y) / 10.5) ** 2));
  if (y <= 18) return 8.5;
  return 8.5 - 5.5 * ((y - 18) / 6) ** 1.4;
}

/** Orejas: una columna a cada lado de la cabeza, a la altura de los ojos. */
export function earAt(x, y) {
  if (y < 15 || y > 18) return null;
  if (x === 6) return 'e';
  if (x === 25) return 'E';
  return null;
}

/** Borde izquierdo de los hombros por fila; desde y = 29 queda en `rest`. */
const SHOULDER_LEFT = { 25: 10, 26: 7, 27: 5, 28: 4, rest: 3 };

/** Busto con una tabla de hombros dada; la cabeza y el cuello son los de A. */
export function bustGrid(shoulderLeft) {
  return gridFrom(32, 32, (x, y) => {
    const hw = headHalfWidth(y);
    if (hw !== null && Math.abs(x - CX) <= hw) return 'H';
    const ear = earAt(x, y);
    if (ear) return ear;
    if (y >= 23 && y <= 27 && x >= 13 && x <= 18) return 'N';
    const left = y >= 25 && y <= 29 ? (shoulderLeft[y] ?? shoulderLeft.rest) : null;
    if (left !== null && x >= left && x <= 31 - left) return 'T';
    return '.';
  });
}

export const BUST_A = {
  frame: PORTRAIT_FRAME,
  /** Profundidad por etiqueta: el mentón proyecta sombra sobre el cuello. */
  z: { H: 5, e: 4.9, E: 4.9, N: 2.5, T: 3 },
  grid: bustGrid(SHOULDER_LEFT),
};

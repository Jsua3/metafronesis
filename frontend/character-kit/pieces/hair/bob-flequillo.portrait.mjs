/**
 * Bob con flequillo de lado — versión retrato (32×32, de frente). Misma
 * lógica que el sprite: raya a la izquierda de la pantalla y el flequillo
 * barre hacia la derecha sin tapar los ojos. Pocas formas y 2 tonos fijos:
 * brillo arriba a la izquierda y una línea de mechón en el flequillo.
 */

import { gridFrom, stamp } from '../../raster.mjs';

const CX = 15.5;

/** Medio ancho exterior del pelo por fila. */
function outerHalfWidth(y) {
  if (y < 2 || y > 22) return null;
  if (y <= 13) return 10 * Math.sqrt(Math.max(0, 1 - ((13 - y) / 11.5) ** 2));
  if (y <= 20) return 10;
  return 10 - (y - 20);
}

/** Fila donde empieza la frente, por columna. */
function bangEdge(x) {
  if (x <= 10) return 10;
  return Math.min(13, Math.round(10 + 3 * ((x - 10) / 9)));
}

/** Medio ancho de la cara que el bob deja ver. */
const FACE_OPEN = 7;

const base = gridFrom(32, 32, (x, y) => {
  const hw = outerHalfWidth(y);
  if (hw === null || Math.abs(x - CX) > hw) return '.';
  return Math.abs(x - CX) <= FACE_OPEN && y > bangEdge(x) ? '.' : 'R';
});

const shine = [[12, 4, 'h'], [11, 5, 'h'], [10, 6, 'h']];
const strand = [[11, 9, 'r'], [13, 9, 'r'], [15, 10, 'r'], [17, 11, 'r'], [19, 12, 'r']];

export const HAIR_BOB_PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover',
  legend: {
    R: { mat: 'hair' },
    r: { mat: 'hair', tone: 3 },
    h: { mat: 'hair', tone: 0 },
  },
  grid: stamp(base, [...shine, ...strand]),
}];

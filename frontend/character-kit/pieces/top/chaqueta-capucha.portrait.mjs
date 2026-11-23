/**
 * Chaqueta abierta con capucha — versión retrato (32×32). El forro de la
 * capucha rodea el cuello y la camiseta asoma entre los bordes abiertos.
 * Sirve igual en las dos complexiones.
 */

import { gridFrom } from '../../raster.mjs';

const CX = 15.5;

const grid = gridFrom(32, 32, (x, y) => {
  if (y < 25) return '.';
  const d = Math.hypot((x - CX) / 1.3, y - 23);
  if (y <= 26 && d >= 2.6 && d <= 5) return 'f';
  if (y >= 26 && x >= 14 && x <= 17) return 'i';
  if (y >= 26 && (x === 13 || x === 18)) return 'x';
  return '.';
});

export const TOP_CHAQUETA_PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint',
  legend: {
    i: { mat: 'inner' },
    f: { mat: 'accent' },
    x: { mat: 'top', tone: 3 },
  },
  grid,
}];

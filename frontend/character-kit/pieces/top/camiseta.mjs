/**
 * Parte de arriba: camiseta de cuello redondo y manga corta. Ranura `top`.
 * La manga acaba a mitad del brazo: el antebrazo queda en piel. El bajo
 * suelto tapa la primera fila de la cadera.
 *
 * Leyenda: j camiseta · J costura del cuello y del bajo (tono profundo).
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './camiseta.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  J: { mat: 'top', tone: 3 },
};

/** Retrato: cuello redondo marcado alrededor de la base del cuello. */
const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    const d = Math.hypot((x - 15.5) / 1.25, y - 23.5);
    return y >= 25 && d >= 3.2 && d <= 4.3 ? 'J' : '.';
  }),
}];

export default {
  id: 'camiseta',
  kind: 'top',
  slots: ['top'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', A: 'top', b: 'skin', B: 'skin' },
  /** Borde de la manga corta. */
  edges: [{ labels: ['a', 'A'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: `
        JJJ...JJJ
        ..JJJJJ..
      ` },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjjjj' },
    ],
    up: [
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: '.JJJJJJJ.' },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjjjj' },
    ],
    left: [
      { anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND, grid: `
        ...JJ
        ..J..
      ` },
      { anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjj' },
    ],
  },
};

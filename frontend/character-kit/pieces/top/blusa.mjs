/**
 * Parte de arriba: blusa de escote redondo suave, sin botonadura marcada,
 * por fuera (el bajo tapa la primera fila de la cadera). Ranura `top`.
 *
 * Leyenda: j blusa · J borde del escote y del bajo (profundo) · s piel del escote.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './blusa.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  J: { mat: 'top', tone: 3 },
  s: { mat: 'skin' },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    // Escote en U: piel dentro, borde en tono profundo.
    const d = Math.hypot((x - 15.5) / 1.4, (y - 24) * 1.1);
    if (y >= 25 && d <= 3.3) return 's';
    if (y >= 25 && d <= 4.3) return 'J';
    return '.';
  }),
}];

export default {
  id: 'blusa',
  kind: 'top',
  slots: ['top'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      {
        anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND,
        grid: `
          JJsssssJJ
          .JJsssJJ.
          ...JJJ...
        `,
      },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjjjj' },
    ],
    up: [
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: '.JJJJJJJ.' },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjjjj' },
    ],
    left: [
      {
        anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND,
        grid: `
          .ssJ
          JJ..
        `,
      },
      { anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjj' },
    ],
  },
};

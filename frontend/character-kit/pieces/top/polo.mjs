/**
 * Parte de arriba: polo de manga corta. Ranuras `top` (polo) e `inner`
 * (botones). Cuello con dos solapas y tapeta de dos botones; el antebrazo
 * queda en piel. El bajo tapa la primera fila de la cadera.
 *
 * Leyenda: j polo · h solapa iluminada · J borde profundo · i botón.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './polo.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  h: { mat: 'top', tone: 0 },
  J: { mat: 'top', tone: 3 },
  i: { mat: 'inner' },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    // Solapas del cuello en V a los lados del cuello y tapeta con botones.
    if (y === 25 && (x === 12 || x === 13 || x === 18 || x === 19)) return 'h';
    if (y === 26 && (x === 13 || x === 14 || x === 17 || x === 18)) return 'J';
    if (x === 15 && y >= 26 && y <= 29) return y === 27 || y === 29 ? 'i' : 'J';
    return '.';
  }),
}];

export default {
  id: 'polo',
  kind: 'top',
  slots: ['top', 'inner'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', A: 'top', b: 'skin', B: 'skin' },
  edges: [{ labels: ['a', 'A'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.hh...hh.' },
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: `
        hhJJ.JJhh
        ...J.J...
        ....i....
        ....J....
        ....i....
      ` },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjjjj' },
    ],
    up: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '..hhhhh..' },
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: '.JJJJJJJ.' },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjjjj' },
    ],
    left: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.hhhhhh' },
      { anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND, grid: `
        ..hJ
        .iJ.
      ` },
      { anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: 'jjjjjjjjjjjjj' },
    ],
  },
};

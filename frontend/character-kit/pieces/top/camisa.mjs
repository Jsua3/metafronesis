/**
 * Parte de arriba: camisa de manga larga, por dentro del pantalón. Ranura
 * `top`. Cuello de puntas, tapeta con botones de 1 px y puños. De espalda,
 * el cuello; de perfil, el cuello y la tapeta en el borde del pecho.
 *
 * Leyenda: j camisa · h cuello y botón iluminados · J costura (profundo).
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './camisa.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  h: { mat: 'top', tone: 0 },
  J: { mat: 'top', tone: 3 },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    // Puntas del cuello a los lados del cuello y tapeta con botones al centro.
    if (y === 25 && (x === 12 || x === 13 || x === 18 || x === 19)) return 'h';
    if (y === 26 && (x === 13 || x === 14 || x === 17 || x === 18)) return 'J';
    if (x === 15 && y >= 26) return y === 27 || y === 29 ? 'h' : 'J';
    return '.';
  }),
}];

export default {
  id: 'camisa',
  kind: 'top',
  slots: ['top'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.hh...hh.' },
      {
        anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND,
        grid: `
          hhhJ.Jhhh
          ...JJJ...
          ....J....
          ....h....
          ....J....
          ....J....
          ....h....
          ....J....
          ....J....
          ....h....
          ....J....
          ....J....
          ....h....
          ....J....
          ....J....
        `,
      },
    ],
    up: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '..hhhhh..' },
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: '.JJJJJJJ.' },
    ],
    left: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.hhhhhh' },
      {
        anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ..hJ.
          .J...
          J....
          h....
          J....
          J....
          h....
          .J...
          .J...
          .h...
          ..J..
          ..J..
          ..h..
          ..J..
          ..J..
        `,
      },
    ],
  },
};

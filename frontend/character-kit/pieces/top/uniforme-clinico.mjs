/**
 * Parte de arriba: casaca de pijama clínico. Ranura `top`. Escote en V (piel),
 * manga corta, bolsillo de pecho a la izquierda de la pantalla y bajo suelto
 * que cubre dos filas de la cadera.
 *
 * Leyenda: j casaca · J costura/bolsillo (profundo) · K bajo (sombra) · s piel del escote.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './uniforme-clinico.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  J: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  s: { mat: 'skin' },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y < 25) return '.';
    const half = Math.max(0, 3 - (y - 25));
    const d = Math.abs(x - 15.5);
    if (d <= half) return 's';
    if (d <= half + 1) return 'J';
    // Bolsillo de pecho.
    if (y === 28 && x >= 8 && x <= 11) return 'J';
    if ((x === 8 || x === 11) && y >= 29) return 'J';
    return '.';
  }),
}];

export default {
  id: 'uniforme-clinico',
  kind: 'top',
  slots: ['top'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', A: 'top', b: 'skin', B: 'skin' },
  edges: [{ labels: ['a', 'A'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      {
        anchor: 'T', at: [19, 23], mode: 'paint', legend: LEGEND,
        grid: `
          .JsssssssJ.
          ..JsssssJ..
          ...JsssJ...
          ....JsJ....
          .....J.....
          JJJ........
          J.J........
          JJJ........
        `,
      },
      {
        anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
        grid: `
          KKKKKKKKKKKKKKK
          KKKKKKKKKKKKKKK
        `,
      },
    ],
    up: [
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: '.JJJJJJJ.' },
      {
        anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
        grid: `
          KKKKKKKKKKKKKKK
          KKKKKKKKKKKKKKK
        `,
      },
    ],
    left: [
      {
        anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ssJ
          sJ.
          J..
        `,
      },
      {
        anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND,
        grid: `
          KKKKKKKKKKKKK
          KKKKKKKKKKKKK
        `,
      },
    ],
  },
};

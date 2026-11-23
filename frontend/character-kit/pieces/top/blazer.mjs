/**
 * Parte de arriba: blazer abierto con solapas sobre una camisa. Ranuras `top`
 * (blazer) e `inner` (camisa). La V de las solapas baja hasta el pecho, un
 * botón a la cintura y el faldón cubre dos filas de la cadera. De espalda,
 * la costura central.
 *
 * Leyenda: j blazer · h solapa iluminada · x borde (profundo) · K faldón (sombra) · i camisa.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './blazer.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  h: { mat: 'top', tone: 0 },
  x: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  i: { mat: 'inner' },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y < 25) return '.';
    const half = Math.max(0, 3.5 - (y - 25) * 0.7);
    const d = Math.abs(x - 15.5);
    if (d <= half) return 'i';
    if (d <= half + 2) return y <= 27 ? 'h' : 'x';
    return '.';
  }),
}];

export default {
  id: 'blazer',
  kind: 'top',
  slots: ['top', 'inner'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.ii...ii.' },
      {
        anchor: 'T', at: [17, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ...hhiiiiihh...
          ...hhhiiihhh...
          ....hhhihhh....
          .....xhihx.....
          .....xxixx.....
          ......xix......
          ......xix......
          .......x.......
          .......x.......
          .......h.......
          .......x.......
          .......x.......
          .......x.......
          .......x.......
          .......x.......
        `,
      },
      {
        anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
        grid: `
          KKKKKKKxKKKKKKK
          KKKKKKKxKKKKKKK
        `,
      },
    ],
    up: [
      {
        anchor: 'T', at: [24, 28], mode: 'paint', legend: LEGEND,
        grid: `
          x
          x
          x
          x
          x
          x
          x
          x
          x
          x
        `,
      },
      {
        anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
        grid: `
          KKKKKKKxKKKKKKK
          KKKKKKKxKKKKKKK
        `,
      },
    ],
    left: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.iiiiii' },
      {
        anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ..iih
          .hhh.
          xhh..
          xh...
          x....
          x....
          .x...
          .x...
          ..x..
          ..h..
          ..x..
          ..x..
          ..x..
          ..x..
          ..x..
        `,
      },
      {
        anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND,
        grid: `
          ..xKKKKKKKKKK
          ..xKKKKKKKKKK
        `,
      },
    ],
  },
};

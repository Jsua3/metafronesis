/**
 * Parte de arriba: cárdigan abierto en V con botones, sobre una blusa o
 * camiseta. Ranuras `top` (cárdigan) e `inner` (lo de debajo). La V baja
 * hasta el pecho; desde ahí se cierra con botones hasta el bajo, que tapa
 * la primera fila de la cadera.
 *
 * Leyenda: j cárdigan · x borde de la V (profundo) · J botón (profundo) ·
 * K bajo (sombra) · i interior.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './cardigan.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  x: { mat: 'top', tone: 3 },
  J: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  i: { mat: 'inner' },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y < 25) return '.';
    // V que se cierra hacia abajo.
    const half = Math.max(0, 4 - (y - 25) * 0.8);
    if (Math.abs(x - 15.5) <= half) return 'i';
    if (Math.abs(x - 15.5) <= half + 1) return 'x';
    return '.';
  }),
}];

export default {
  id: 'cardigan',
  kind: 'top',
  slots: ['top', 'inner'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 2 }],
  views: {
    ...DIAGONAL,
    down: [
      {
        anchor: 'T', at: [17, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ...xiiiiiiix...
          ....xiiiiix....
          .....xiiix.....
          .....xiiix.....
          ......xix......
          ......xix......
          .......x.......
          .......J.......
          .......x.......
          .......x.......
          .......J.......
          .......x.......
          .......x.......
          .......J.......
          .......x.......
        `,
      },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKxKKKKKKK' },
    ],
    up: [
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: '.KKKKKKK.' },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKKKKKKKKK' },
    ],
    left: [
      {
        anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND,
        grid: `
          .iix.
          .ix..
          .x...
          x....
          x....
          J....
          x....
          x....
          .J...
          .x...
          .x...
          .J...
          .x...
          .x...
          .x...
        `,
      },
      { anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: '..xKKKKKKKKKK' },
    ],
  },
};

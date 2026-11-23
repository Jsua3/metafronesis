/**
 * Parte de arriba: chaqueta de jean abierta sobre una camiseta. Ranuras `top`
 * (chaqueta) e `inner` (camiseta). Solapas de cuello, bolsillos de pecho con
 * tapeta, costuras y bajo de pretina sobre la cadera. De espalda, el canesú.
 *
 * Leyenda: j chaqueta · h cuello iluminado · J costura/borde (profundo) ·
 * K pretina (sombra) · i camiseta · x borde de la abertura.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './chaqueta-jean.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  h: { mat: 'top', tone: 0 },
  J: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  i: { mat: 'inner' },
  x: { mat: 'top', tone: 3 },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y >= 25 && x >= 14 && x <= 17) return 'i';
    if (y >= 25 && (x === 13 || x === 18)) return 'x';
    if (y === 25 && (x === 11 || x === 12 || x === 19 || x === 20)) return 'h';
    if (y === 28 && ((x >= 9 && x <= 11) || (x >= 20 && x <= 22))) return 'J';
    return '.';
  }),
}];

export default {
  id: 'chaqueta-jean',
  kind: 'top',
  slots: ['top', 'inner'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.hh...hh.' },
      {
        anchor: 'T', at: [17, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ...hhhiiihhh...
          ....hxiiixh....
          .....xiiix.....
          .JJJ.xiiix.JJJ.
          .J.J.xiiix.J.J.
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
          .....xiiix.....
        `,
      },
      {
        anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND,
        grid: `
          KKKKKxiiixKKKKK
          KKKKKxiiixKKKKK
        `,
      },
    ],
    up: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '..hhhhh..' },
      {
        anchor: 'T', at: [17, 27], mode: 'paint', legend: LEGEND,
        grid: `
          .JJJJJJJJJJJJJ.
          .......J.......
          .......J.......
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
    left: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.hhhhhh' },
      {
        anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ..ih.
          .x...
          x....
          xJJ..
          x....
          x....
          .x...
          .x...
          ..x..
          ..x..
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

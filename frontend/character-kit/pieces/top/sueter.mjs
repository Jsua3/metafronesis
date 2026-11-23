/**
 * Parte de arriba: suéter liso con el cuello de la camisa asomando. Ranuras
 * `top` (suéter) e `inner` (cuello de la camisa). Cuello redondo, puños y
 * bajo de punto en banda (tono de sombra) sobre la cadera.
 *
 * Leyenda: j suéter · J borde profundo · K punto en banda (sombra) · i cuello de camisa.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './sueter.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  J: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  i: { mat: 'inner' },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    // Puntas del cuello de la camisa a los lados de la base del cuello.
    const collar = (y === 25 && (x === 12 || x === 13 || x === 18 || x === 19))
      || (y === 26 && (x === 13 || x === 14 || x === 17 || x === 18));
    if (collar) return 'i';
    const d = Math.hypot((x - 15.5) / 1.25, y - 23.5);
    return y >= 25 && d >= 3.2 && d <= 4.3 ? 'K' : '.';
  }),
}];

export default {
  id: 'sueter',
  kind: 'top',
  slots: ['top', 'inner'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 2 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.ii...ii.' },
      {
        anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND,
        grid: `
          KiiKKKiiK
          ..KKKKK..
        `,
      },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKKKKKKKKK' },
    ],
    up: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '..iiiii..' },
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: '.KKKKKKK.' },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKKKKKKKKK' },
    ],
    left: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.iiiiii' },
      {
        anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ..iKK
          ..K..
        `,
      },
      { anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKKKKKKK' },
    ],
  },
};

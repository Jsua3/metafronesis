/**
 * Parte de arriba: sudadera con capucha. Ranuras `top` (sudadera) y `accent`
 * (forro de la capucha y cordones). De frente, la capucha arrugada rodea el
 * cuello y cuelgan dos cordones; bolsillo canguro en el vientre; puños y bajo
 * en banda (tono de sombra). De espalda, la capucha caída; de perfil, su
 * bulto detrás del cuello.
 *
 * Leyenda: j sudadera · J borde profundo · K banda (sombra) · f forro · F forro en sombra.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './sudadera.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  J: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  f: { mat: 'accent' },
  F: { mat: 'accent', tone: 2 },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    const d = Math.hypot((x - 15.5) / 1.3, y - 23.5);
    if (y >= 24 && d >= 2.8 && d <= 4.8) return y >= 26 ? 'F' : 'f';
    if ((x === 13 || x === 18) && y >= 27 && y <= 29) return 'f';
    return '.';
  }),
}];

export default {
  id: 'sudadera',
  kind: 'top',
  slots: ['top', 'accent'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 2 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [19, 22], mode: 'cover', legend: LEGEND, grid: `
        ..fffffff..
      ` },
      { anchor: 'T', at: [19, 23], mode: 'paint', legend: LEGEND, grid: `
        ffFFFFFFFff
        .FF.....FF.
        ...f...f...
        ...f...f...
        ...........
        ...........
        ...........
        .JJJJJJJJJ.
        .J.......J.
        .J.......J.
        .JJ.....JJ.
      ` },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: `
        KKKKKKKKKKKKKKK
      ` },
    ],
    up: [
      { anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND, grid: `
        ..FFFFFFFFF..
        .J.........J.
        .J.........J.
        ..J.......J..
        ...JJJJJJJ...
      ` },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKKKKKKKKK' },
    ],
    left: [
      { anchor: 'T', at: [26, 20], mode: 'cover', legend: LEGEND, grid: `
        ..jjj
        .jjjj
        .jjjj
      ` },
      { anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND, grid: `
        ..fFFF.....J
        ..f.......J.
        ..f.........
      ` },
      { anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKKKKKKK' },
    ],
  },
};

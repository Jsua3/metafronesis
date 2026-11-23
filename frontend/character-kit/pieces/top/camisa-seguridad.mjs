/**
 * Parte de arriba: camisa de uniforme de seguridad, de manga corta y por
 * dentro. Ranuras `top` (camisa) y `accent` (charreteras). Cuello, tapeta con
 * botones y dos bolsillos de pecho con tapeta; charreteras en los hombros.
 *
 * Leyenda: j camisa · h cuello y botón iluminados · J costura (profundo) · f charretera.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './camisa-seguridad.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  h: { mat: 'top', tone: 0 },
  J: { mat: 'top', tone: 3 },
  f: { mat: 'accent' },
};

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y === 25 && (x === 12 || x === 13 || x === 18 || x === 19)) return 'h';
    if (y === 26 && (x === 13 || x === 14 || x === 17 || x === 18)) return 'J';
    if (x === 15 && y >= 26) return y === 28 ? 'h' : 'J';
    // Charreteras y bolsillos.
    if (y === 26 && ((x >= 5 && x <= 8) || (x >= 23 && x <= 26))) return 'f';
    if (y === 28 && ((x >= 9 && x <= 11) || (x >= 20 && x <= 22))) return 'J';
    return '.';
  }),
}];

export default {
  id: 'camisa-seguridad',
  kind: 'top',
  slots: ['top', 'accent'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', A: 'top', b: 'skin', B: 'skin' },
  edges: [{ labels: ['a', 'A'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.hh...hh.' },
      {
        anchor: 'T', at: [17, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ..fffhhJhhfff..
          .......J.......
          ..JJJ..J..JJJ..
          ..J.J..h..J.J..
          ..JJJ..J..JJJ..
          .......J.......
          .......h.......
          .......J.......
          .......J.......
          .......h.......
          .......J.......
          .......J.......
          .......h.......
          .......J.......
          .......J.......
        `,
      },
    ],
    up: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '..hhhhh..' },
      { anchor: 'T', at: [17, 23], mode: 'paint', legend: LEGEND, grid: '..fffJJJJJfff..' },
    ],
    left: [
      { anchor: 'T', at: [20, 22], mode: 'cover', legend: LEGEND, grid: '.hhhhhh' },
      {
        anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND, parts: ['T', 'a'],
        grid: `
          ..hJ.ffff
          .J.......
          JJ.......
          JJ.......
          J........
          h........
          J........
          .J.......
          .h.......
          ..J......
          ..J......
          ..h......
          ..J......
          ..J......
          ..J......
        `,
      },
    ],
  },
};

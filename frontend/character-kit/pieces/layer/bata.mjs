/**
 * Capa: bata (médica o clínica) sobre la parte de arriba. Ranura `layer`.
 * Cubre torso y brazos; en el escote deja ver la prenda de debajo (con sus
 * detalles: cuello, tapeta) y se abotona desde el pecho. El faldón baja
 * hasta medio muslo, 1 px más ancho que la cadera, con bolsillos.
 *
 * Cómo se superpone: `repaint` limpia los detalles de la prenda de debajo en
 * todo el torso salvo el escote, y una segunda superposición `paint` devuelve
 * el escote al material `top` sin borrar sus tonos fijos. El faldón es un
 * `cover` anclado a la pelvis (sigue al bob) y queda detrás de los brazos.
 *
 * Leyenda: L bata · X borde de la abertura (profundo) · K bolsillo (sombra) · t prenda de debajo.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './bata.diagonal.mjs';

const LEGEND = {
  L: { mat: 'layer' },
  X: { mat: 'layer', tone: 3 },
  K: { mat: 'layer', tone: 2 },
  t: { mat: 'top' },
};

/** Torso entero en bata salvo el escote (`.`), para la superposición `repaint`. */
const FRONT_BODY = `
  LLLLLL.....LLLLLL
  LLLLLLX...XLLLLLL
  LLLLLLLX.XLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
`;

/** Faldón de frente: de la cadera a medio muslo, con la abertura al centro y bolsillos. */
const FRONT_SKIRT = `
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LKKKLLLLXLLLLKKKL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLLXLLLLLLLL
  LLLLLLLX.XLLLLLLL
  LLLLLLLX.XLLLLLLL
  LLLLLLLX.XLLLLLLL
  .LLLLLLX.XLLLLLL.
`;

const PORTRAIT = [
  {
    anchor: 'T', at: [0, 0], mode: 'repaint', legend: LEGEND,
    grid: gridFrom(32, 32, (x, y) => {
      if (y < 25) return '.';
      const half = Math.max(0, 3 - (y - 25) * 0.75);
      const d = Math.abs(x - 15.5);
      if (d <= half) return '.';
      return d <= half + 1 ? 'X' : 'L';
    }),
  },
  {
    anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
    grid: gridFrom(32, 32, (x, y) => (y >= 25 && Math.abs(x - 15.5) <= Math.max(0, 3 - (y - 25) * 0.75) ? 't' : '.')),
  },
];

export default {
  id: 'bata',
  kind: 'layer',
  slots: ['layer'],
  portrait: PORTRAIT,
  coverage: { T: 'layer', a: 'layer', b: 'layer', A: 'layer', B: 'layer' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 2 }],
  views: {
    ...DIAGONAL,
    down: [
      { anchor: 'T', at: [16, 23], mode: 'repaint', legend: LEGEND, grid: FRONT_BODY },
      {
        anchor: 'T', at: [22, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ttttt
          .ttt.
          ..t..
        `,
      },
      { anchor: 'P', at: [16, 38], mode: 'cover', legend: LEGEND, grid: FRONT_SKIRT },
    ],
    up: [
      { anchor: 'T', at: [16, 23], mode: 'repaint', legend: LEGEND, grid: gridFrom(17, 15, () => 'L') },
      {
        anchor: 'P', at: [16, 38], mode: 'cover', legend: LEGEND,
        grid: `
          LLLLLLLLLLLLLLLLL
          LLLLLLLLLLLLLLLLL
          LLLLLLLLLLLLLLLLL
          LLLLLLLLLLLLLLLLL
          LLLLLLLLLLLLLLLLL
          LLLLLLLLLLLLLLLLL
          LLLLLLLLXLLLLLLLL
          LLLLLLLLXLLLLLLLL
          LLLLLLLLXLLLLLLLL
          .LLLLLLLXLLLLLLL.
        `,
      },
    ],
    left: [
      {
        anchor: 'T', at: [18, 23], mode: 'repaint', legend: LEGEND,
        grid: `
          ...LLLLLLLLL
          ..XLLLLLLLLL
          .XLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
          XLLLLLLLLLLL
        `,
      },
      {
        anchor: 'T', at: [19, 23], mode: 'paint', legend: LEGEND,
        grid: `
          tt
          t.
        `,
      },
      {
        anchor: 'P', at: [18, 38], mode: 'cover', legend: LEGEND,
        grid: `
          .XLLLLLLLLLLL
          .XLLLLLLLLLLL
          .XLKKKLLLLLLL
          .XLLLLLLLLLLL
          .XLLLLLLLLLLL
          .XLLLLLLLLLLL
          .XLLLLLLLLLLL
          .XLLLLLLLLLLL
          .XLLLLLLLLLLL
          ..XLLLLLLLLL.
        `,
      },
    ],
  },
};

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

/** Complexiones con cadera de 15 px (A y B): los faldones de arriba les quedan 1 px más anchos. */
const AB = ['a', 'b'];

/**
 * Complexión C: cintura más recogida y cadera de 19 px. La bata cae recta del
 * busto a la cadera (rellena el hueco de la cintura entre brazo y torso) y el
 * faldón abre 2 px más que el de A para tapar la cadera.
 */
const C = ['c'];

const C_WAIST_FRONT = { anchor: 'T', at: [16, 32], mode: 'cover', complexions: C, legend: LEGEND, grid: `
  LL.............LL
  LL.............LL
  LL.............LL
  LL.............LL
  L...............L
  L...............L
` };

const C_SKIRT_FRONT = `
  LLLLLLLLLXLLLLLLLLL
  LLLLLLLLLXLLLLLLLLL
  LKKKLLLLLXLLLLLKKKL
  LLLLLLLLLXLLLLLLLLL
  LLLLLLLLLXLLLLLLLLL
  LLLLLLLLLXLLLLLLLLL
  LLLLLLLLX.XLLLLLLLL
  LLLLLLLLX.XLLLLLLLL
  LLLLLLLLX.XLLLLLLLL
  .LLLLLLLX.XLLLLLLL.
`;

const C_SKIRT_BACK = `
  LLLLLLLLLLLLLLLLLLL
  LLLLLLLLLLLLLLLLLLL
  LLLLLLLLLLLLLLLLLLL
  LLLLLLLLLLLLLLLLLLL
  LLLLLLLLLLLLLLLLLLL
  LLLLLLLLLLLLLLLLLLL
  LLLLLLLLLXLLLLLLLLL
  LLLLLLLLLXLLLLLLLLL
  LLLLLLLLLXLLLLLLLLL
  .LLLLLLLLXLLLLLLLL.
`;

/** Perfil de C: el busto llega a x = 17; de ahí la bata cae recta hasta el faldón. */
const C_SIDE = [
  {
    anchor: 'T', at: [17, 23], mode: 'repaint', complexions: C, legend: LEGEND,
    grid: `
      ....LLLLLLLLL
      ...XLLLLLLLLL
      ..XLLLLLLLLLL
      XLLLLLLLLLLLL
      XLLLLLLLLLLLL
      XLLLLLLLLLLLL
      LLLLLLLLLLLLL
      LLLLLLLLLLLLL
      LLLLLLLLLLLLL
      LLLLLLLLLLLLL
      LLLLLLLLLLLLL
      LLLLLLLLLLLLL
      LLLLLLLLLLLLL
      LLLLLLLLLLLLL
      LLLLLLLLLLLLL
    `,
  },
  { anchor: 'T', at: [17, 29], mode: 'cover', complexions: C, legend: LEGEND, grid: `
      X..
      XL.
      XLL
      XLL
      XLL
      XLL
      XLL
      XLL
      XLL
    ` },
  {
    anchor: 'P', at: [17, 38], mode: 'cover', complexions: C, legend: LEGEND,
    grid: `
      XLLLLLLLLLLLLL
      XLLLLLLLLLLLLL
      XLLKKKLLLLLLLL
      XLLLLLLLLLLLLL
      XLLLLLLLLLLLLL
      XLLLLLLLLLLLLL
      XLLLLLLLLLLLLL
      XLLLLLLLLLLLLL
      XLLLLLLLLLLLLL
      .XLLLLLLLLLLL.
    `,
  },
];

/** Tres cuartos de C: la cintura de 12 px deja un hueco a cada lado; la bata lo cubre. */
const C_WAIST_QUARTER = { anchor: 'T', at: [17, 31], mode: 'cover', complexions: C, legend: LEGEND, grid: `
  L............L
  L............L
  L............L
  L............L
  L............L
` };

export default {
  id: 'bata',
  kind: 'layer',
  slots: ['layer'],
  portrait: PORTRAIT,
  coverage: { T: 'layer', a: 'layer', b: 'layer', A: 'layer', B: 'layer' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 2 }],
  views: {
    ...DIAGONAL,
    'down-left': [...DIAGONAL['down-left'], C_WAIST_QUARTER],
    'up-left': [...DIAGONAL['up-left'], C_WAIST_QUARTER],
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
      { anchor: 'P', at: [16, 38], mode: 'cover', complexions: AB, legend: LEGEND, grid: FRONT_SKIRT },
      C_WAIST_FRONT,
      { anchor: 'P', at: [15, 38], mode: 'cover', complexions: C, legend: LEGEND, grid: C_SKIRT_FRONT },
    ],
    up: [
      { anchor: 'T', at: [16, 23], mode: 'repaint', legend: LEGEND, grid: gridFrom(17, 15, () => 'L') },
      C_WAIST_FRONT,
      { anchor: 'P', at: [15, 38], mode: 'cover', complexions: C, legend: LEGEND, grid: C_SKIRT_BACK },
      {
        anchor: 'P', at: [16, 38], mode: 'cover', complexions: AB, legend: LEGEND,
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
      ...C_SIDE,
      {
        anchor: 'T', at: [18, 23], mode: 'repaint', complexions: AB, legend: LEGEND,
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
        anchor: 'P', at: [18, 38], mode: 'cover', complexions: AB, legend: LEGEND,
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

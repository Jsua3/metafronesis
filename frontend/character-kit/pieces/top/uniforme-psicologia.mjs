/**
 * Parte de arriba: casaca del uniforme de Psicología de la Universidad
 * Alexander von Humboldt (decisión 16). Ranuras `top` (casaca) y `accent`
 * (bordado). Cuello mao abierto al centro, tapeta corta con dos botones,
 * manga corta, dos bolsillos bajos y bajo suelto que tapa dos filas de la
 * cadera.
 *
 * El bordado es una marca de 2 px, sin texto ni logo, en el pecho y la manga
 * izquierdos de quien la lleva: de frente queda a la derecha de la pantalla y
 * de perfil solo se ve en la vista `left`, que muestra el lado izquierdo. Por
 * eso la pieza es asimétrica: `right` refleja lo común de `left` sin bordado.
 *
 * Leyenda: j casaca · h cuello y botones (luz) · J tapeta y bolsillos (profundo) · K bajo (sombra) · f bordado.
 */

import { gridFrom, mirrorOverlay } from '../../raster.mjs';
import { DIAGONAL } from './uniforme-psicologia.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  h: { mat: 'top', tone: 0 },
  J: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  f: { mat: 'accent', tone: 1 },
};

const at = (anchor, x, y, grid, extra = {}) => ({ anchor, at: [x, y], mode: 'paint', legend: LEGEND, grid, ...extra });
const cover = (x, y, grid) => ({ anchor: 'T', at: [x, y], mode: 'cover', legend: LEGEND, grid });

/** Bajo de la casaca sobre la pelvis: una fila de tela y el borde en sombra. */
const HEM = width => `
  ${'j'.repeat(width)}
  ${'K'.repeat(width)}
`;

/** Marca de bordado de 2×2. */
const MARK = `
  ff
  ff
`;

const PORTRAIT = [
  // Cuello mao: la banda sube por los lados del cuello y se abre al centro.
  {
    anchor: 'N', at: [0, 0], mode: 'paint', legend: LEGEND,
    grid: gridFrom(32, 32, (x, y) => {
      if (y === 26 && (x === 13 || x === 18)) return 'h';
      if (y === 27 && (x === 13 || x === 14 || x === 17 || x === 18)) return 'h';
      return '.';
    }),
  },
  // Tapeta con botón y bordado en el pecho izquierdo (derecha de la pantalla).
  {
    anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
    grid: gridFrom(32, 32, (x, y) => {
      if (x === 15 && y === 28) return 'J';
      if (x === 15 && y === 29) return 'h';
      if ((x === 20 || x === 21) && (y === 28 || y === 29)) return 'f';
      return '.';
    }),
  },
];

/** Perfil izquierdo sin bordado: lo que comparte con el derecho. */
const SIDE = [
  cover(22, 22, 'hhhhhh'),
  at('T', 20, 34, 'JJJ'),
  at('P', 18, 38, HEM(13)),
];

export default {
  id: 'uniforme-psicologia',
  kind: 'top',
  slots: ['top', 'accent'],
  asymmetric: true,
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', A: 'top', b: 'skin', B: 'skin' },
  edges: [{ labels: ['a', 'A'], edge: 'bottom', tone: 3 }],
  views: {
    ...DIAGONAL,
    down: [
      cover(21, 22, 'hhh.hhh'),
      at('T', 18, 23, `
        ......J......
        ......J......
        ......h......
        ......J......
        ......h......
        ......J......
        .............
        .............
        .............
        .............
        .............
        .JJJJ...JJJJ.
      `),
      at('T', 27, 26, MARK),
      at('T', 32, 27, 'f\nf', { parts: ['A'] }),
      at('P', 17, 38, HEM(15)),
    ],
    up: [
      cover(22, 22, 'hhhhh'),
      at('P', 17, 38, HEM(15)),
    ],
    left: [
      ...SIDE,
      at('T', 20, 26, MARK),
      at('T', 25, 27, 'f\nf', { parts: ['a'] }),
    ],
    right: SIDE.map(o => mirrorOverlay(o)),
  },
};

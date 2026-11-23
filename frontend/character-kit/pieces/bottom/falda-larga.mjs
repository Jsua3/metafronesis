/**
 * Parte de abajo: falda larga hasta media pantorrilla, en A. Ranura `bottom`.
 * Es un `cover` anclado a la pelvis; las piernas van en piel (asoman los
 * tobillos). De perfil, la falda se abre con la zancada: en los contactos
 * (cuadros 0 y 3) el bajo es más ancho y en los cuadros 1 y 4 algo menos, así
 * las piernas no atraviesan la tela.
 *
 * Las formas se definen por tramos (de x0 a x1 en cada fila) y se guardan
 * como grilla.
 *
 * Leyenda: S falda (la luz decide) · J bajo (profundo).
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './falda-larga.diagonal.mjs';

const LEGEND = {
  S: { mat: 'bottom' },
  J: { mat: 'bottom', tone: 3 },
};

const TOP = 38;
const HEM = 60;

/** Grilla del cuadro entero desde la cadera hasta el bajo; `span(y)` da [x0, x1]. */
function skirt(span) {
  return gridFrom(48, HEM - TOP + 1, (x, r) => {
    const [x0, x1] = span(TOP + r);
    if (x < x0 || x > x1) return '.';
    return TOP + r === HEM ? 'J' : 'S';
  });
}

const FRONT = skirt(y => (y <= 43 ? [17, 31] : y <= 51 ? [16, 32] : [15, 33]));

/** Perfil: en reposo, y abierta según la zancada. */
const SIDE_REST = skirt(y => (y <= 43 ? [20, 30] : y <= 49 ? [19, 31] : [18, 31]));
const SIDE_MID = skirt(y => (y <= 43 ? [20, 30] : y <= 49 ? [19, 31] : [17, 32]));
const SIDE_WIDE = skirt(y => (y <= 43 ? [20, 30] : y <= 49 ? [19, 31] : y <= 55 ? [17, 32] : [15, 33]));

const cover = (grid, extra = {}) => ({ anchor: 'P', at: [0, TOP], mode: 'cover', legend: LEGEND, grid, ...extra });

export default {
  id: 'falda-larga',
  kind: 'bottom',
  slots: ['bottom'],
  coverage: { P: 'bottom', l: 'skin', m: 'skin', L: 'skin', M: 'skin' },
  views: {
    ...DIAGONAL,
    down: [cover(FRONT)],
    up: [cover(FRONT)],
    left: [
      cover(SIDE_REST, { sheets: ['idle'] }),
      cover(SIDE_REST, { sheets: ['walk'], frames: [2, 5] }),
      cover(SIDE_MID, { sheets: ['walk'], frames: [1, 4] }),
      cover(SIDE_WIDE, { sheets: ['walk'], frames: [0, 3] }),
    ],
  },
};

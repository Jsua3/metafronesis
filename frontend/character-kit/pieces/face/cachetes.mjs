/**
 * Rostro de cachetes: el sereno con la cara más llena y las mejillas rojizas.
 * Las mejillas y la mandíbula se ensanchan 1 px por lado (modo `cover`, fuera
 * de la silueta de la cabeza) y el rubor queda puesto en todas las
 * expresiones, más ancho que el del sereno. Simétrico: el perfil derecho y
 * las diagonales derechas salen del espejo.
 *
 * Leyenda: c mejilla (piel) · q rubor (color literal).
 */

import { gridFrom } from '../../raster.mjs';
import { facePortrait } from './portrait-face.mjs';
import sereno from './sereno.mjs';

const LEGEND = {
  c: { mat: 'skin' },
  q: { literal: 'blush' },
};

const cover = (at, grid) => ({ anchor: 'H', at, mode: 'cover', legend: LEGEND, grid });
const paint = (at, grid) => ({ anchor: 'H', at, mode: 'paint', legend: LEGEND, grid });

/** Retrato: filas 19-23 de la cabeza del busto, 1 px más anchas por lado. */
const PORTRAIT_CHEEKS = cover([0, 0], gridFrom(32, 32, (x, y) => {
  const rows = { 19: [7, 24], 20: [8, 23], 21: [9, 22], 22: [10, 21], 23: [11, 20] };
  return rows[y]?.includes(x) ? 'c' : '.';
}));
const portraitOf = state => [PORTRAIT_CHEEKS, ...facePortrait(state, { rosy: true })];

export default {
  id: 'cachetes',
  kind: 'face',
  portrait: portraitOf('neutral'),
  expressions: Object.fromEntries(
    ['preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis'].map(state => [state, portraitOf(state)]),
  ),
  views: {
    ...sereno.views,
    down: [
      // Cabeza de x 17-31: las filas 17-20 crecen 1 px por lado.
      cover([17, 17], `
        c.............c
        .c...........c.
        ..c.........c..
        ....c.....c....
      `),
      ...sereno.views.down,
      // Rubor de 2 px por mejilla (el sereno pone 1).
      paint([20, 16], `
        qq.....qq
      `),
    ],
    'down-left': [
      // Mejilla cercana (derecha) más llena; la lejana, 1 px.
      cover([17, 17], `
        ..............c
        c............c.
        .c.........c...
      `),
      ...sereno.views['down-left'],
      paint([18, 16], `
        qq......qq
      `),
    ],
    left: [
      // Perfil: papada y mejilla 1 px más adelante bajo la boca.
      cover([17, 19], `
        c.
        .c
      `),
      ...sereno.views.left,
      paint([19, 16], `
        qq
      `),
    ],
  },
};

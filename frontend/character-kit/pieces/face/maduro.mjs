/**
 * Rostro maduro: el sereno con líneas de expresión de 1 px en sombra de piel
 * (bolsas bajo los ojos y surcos junto a la boca) y sin rubor en el sprite.
 * Retrato con las mismas cinco expresiones que el sereno, más las líneas.
 * Simétrico: el perfil derecho sale del espejo del izquierdo.
 *
 * Leyenda: b ceja · k ojo · n sombra de piel (nariz y líneas) · m boca.
 */

import { faceExpressions, facePortrait } from './portrait-face.mjs';
import { DIAGONAL } from './maduro.diagonal.mjs';

const LEGEND = {
  b: { mat: 'hair', tone: 3 },
  k: { literal: 'eye' },
  n: { mat: 'skin', tone: 2 },
  m: { mat: 'skin', tone: 3 },
};

export default {
  id: 'maduro',
  kind: 'face',
  portrait: facePortrait('neutral', { mature: true }),
  expressions: faceExpressions({ mature: true }),
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [16, 11], mode: 'paint', legend: LEGEND,
      grid: `
        ....bbb...bbb....
        .................
        .....k.....k.....
        .....k.....k.....
        ....n.......n....
        .........n.......
        ......n...n......
        .......mm........
      `,
    }],
    up: [],
    left: [{
      anchor: 'H', at: [16, 11], mode: 'paint', legend: LEGEND,
      grid: `
        ..bb.
        .....
        ...k.
        ...k.
        ....n
        ..n..
        ...n.
        .m...
      `,
    }],
  },
};

/**
 * Rostro de Karen (avatar elegible hecho con permiso de la persona). Como el
 * sereno, pero con cejas de 4 px más marcadas y labios rojo vino de 3 px.
 * Solo pinta sobre la cabeza (modo `paint`); lo que tape el pelo queda tapado.
 * El perfil derecho sale del espejo del izquierdo.
 *
 * Solo lo usa la receta karen: no se ofrece en el editor del avatar.
 *
 * Leyenda: b ceja (pelo, tono profundo) · k ojo (color literal) ·
 * n sombra de nariz · l labios (literal `labios`) · q rubor (color literal).
 */

import { KAREN_EXPRESSIONS, KAREN_PORTRAIT } from './karen.portrait.mjs';
import { DIAGONAL } from './karen.diagonal.mjs';

const LEGEND = {
  b: { mat: 'hair', tone: 3 },
  k: { literal: 'eye' },
  n: { mat: 'skin', tone: 2 },
  l: { literal: 'labios' },
  q: { literal: 'blush' },
};

export default {
  id: 'karen',
  kind: 'face',
  portrait: KAREN_PORTRAIT,
  expressions: KAREN_EXPRESSIONS,
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [16, 11], mode: 'paint', legend: LEGEND,
      grid: `
        ...bbbb...bbbb...
        .................
        .....k.....k.....
        .....k.....k.....
        .................
        ....q....n..q....
        .................
        .......lll.......
      `,
    }],
    up: [],
    left: [{
      anchor: 'H', at: [16, 11], mode: 'paint', legend: LEGEND,
      grid: `
        ..bbb
        .....
        ...k.
        ...k.
        .....
        ..n..
        .....
        .ll..
      `,
    }],
  },
};
